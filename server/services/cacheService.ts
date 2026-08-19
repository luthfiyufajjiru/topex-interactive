import type { TopexApiResponse } from '@shared/schema';

// In-memory fallback cache for development/local execution
const localMemoryCache = new Map<string, { data: TopexApiResponse; expiresAt: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateCacheKey(params: {
  north: number;
  south: number;
  west: number;
  east: number;
  mag: string;
  includeGravity: boolean;
}): string {
  const n = params.north.toFixed(4);
  const s = params.south.toFixed(4);
  const w = params.west.toFixed(4);
  const e = params.east.toFixed(4);
  return `topex_${n}_${s}_${w}_${e}_mag${params.mag}_grav${params.includeGravity}`;
}

export function getFromLocalCache(key: string): TopexApiResponse | null {
  const entry = localMemoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    localMemoryCache.delete(key);
    return null;
  }

  return entry.data;
}

export function setToLocalCache(key: string, data: TopexApiResponse): void {
  // Cap local cache size to 500 entries to prevent memory leaks
  if (localMemoryCache.size > 500) {
    const oldestKey = localMemoryCache.keys().next().value;
    if (oldestKey) localMemoryCache.delete(oldestKey);
  }

  localMemoryCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}
