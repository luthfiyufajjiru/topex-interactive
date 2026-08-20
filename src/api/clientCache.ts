import type { BoundingBox, TopexRecord } from '@/types';

interface CacheEntry {
  records: TopexRecord[];
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry>();
const MAX_CLIENT_CACHE_ENTRIES = 1000;
const CLIENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const DB_NAME = 'topex_interactive_cache_v2';
const STORE_NAME = 'canonical_tiles';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export function makeClientTileKey(bounds: BoundingBox, includeGravity: boolean): string {
  const n = bounds.north.toFixed(4);
  const s = bounds.south.toFixed(4);
  const w = bounds.west.toFixed(4);
  const e = bounds.east.toFixed(4);
  return `${n}_${s}_${w}_${e}_g${includeGravity}`;
}

export function getClientCachedTile(
  bounds: BoundingBox,
  includeGravity: boolean
): TopexRecord[] | null {
  const key = makeClientTileKey(bounds, includeGravity);
  const entry = memoryStore.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CLIENT_CACHE_TTL_MS) {
    memoryStore.delete(key);
    return null;
  }

  return entry.records;
}

export async function getClientCachedTileAsync(
  bounds: BoundingBox,
  includeGravity: boolean
): Promise<TopexRecord[] | null> {
  const key = makeClientTileKey(bounds, includeGravity);

  // 1. Check L1 memory
  const memEntry = memoryStore.get(key);
  if (memEntry && Date.now() - memEntry.timestamp <= CLIENT_CACHE_TTL_MS) {
    return memEntry.records;
  }

  // 2. Check L2 IndexedDB
  try {
    const db = await getIDB();
    return await new Promise<TopexRecord[] | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.records) {
          if (Date.now() - req.result.timestamp <= CLIENT_CACHE_TTL_MS) {
            // Promote to L1 memory
            memoryStore.set(key, {
              records: req.result.records,
              timestamp: req.result.timestamp,
            });
            resolve(req.result.records);
            return;
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export function setClientCachedTile(
  bounds: BoundingBox,
  includeGravity: boolean,
  records: TopexRecord[]
): void {
  const key = makeClientTileKey(bounds, includeGravity);
  const now = Date.now();

  // 1. Save to L1 memory
  if (memoryStore.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }
  memoryStore.set(key, { records, timestamp: now });

  // 2. Asynchronously save to L2 IndexedDB
  getIDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key, records, timestamp: now });
    })
    .catch(() => {
      // ignore storage quota errors
    });
}

export function clearClientCache(): void {
  memoryStore.clear();
  getIDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    })
    .catch(() => {});
}
