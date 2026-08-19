import type { BoundingBox, TopexRecord } from '@/types';

interface CacheEntry {
  records: TopexRecord[];
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry>();
const MAX_CLIENT_CACHE_ENTRIES = 1000;
const CLIENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

export function setClientCachedTile(
  bounds: BoundingBox,
  includeGravity: boolean,
  records: TopexRecord[]
): void {
  if (memoryStore.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldestKey = memoryStore.keys().next().value;
    if (oldestKey) memoryStore.delete(oldestKey);
  }

  const key = makeClientTileKey(bounds, includeGravity);
  memoryStore.set(key, {
    records,
    timestamp: Date.now(),
  });
}

export function clearClientCache(): void {
  memoryStore.clear();
}
