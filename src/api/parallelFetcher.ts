import type { BoundingBox, TopexRecord } from '@/types';
import { extractTopexData } from './client';
import { generateChunkTiles, ChunkTile, clipRecordsToBounds } from '@/utils/chunking';
import { getClientCachedTileAsync, setClientCachedTile } from './clientCache';

export interface ChunkProgress {
  completedTiles: number;
  totalTiles: number;
  loadedPoints: number;
  currentTile: ChunkTile;
  percentage: number;
}

export interface ParallelFetchOptions {
  bounds: BoundingBox;
  includeGravity: boolean;
  concurrency?: number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ChunkProgress) => void;
  onChunkReceived?: (newRecords: TopexRecord[], progress: ChunkProgress) => void;
}

export async function fetchLargeGridInChunks(
  options: ParallelFetchOptions
): Promise<{ records: TopexRecord[]; totalTiles: number; executionTimeMs: number }> {
  const startTime = performance.now();
  // Generate canonical discrete tiles snapped to global 0.5° grid
  const tiles = generateChunkTiles(options.bounds);
  // Default to 2 concurrent workers to prevent triggering upstream 522 connection limits
  const concurrency = Math.min(options.concurrency || 2, 3);

  let completedTiles = 0;
  const allClippedRecords: TopexRecord[] = [];
  let nextTileIdx = 0;

  // Helper with exponential backoff & jitter retry
  const fetchWithRetry = async (tileBounds: BoundingBox): Promise<TopexRecord[]> => {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (options.abortSignal?.aborted) return [];
      try {
        const res = await extractTopexData({
          north: tileBounds.north,
          south: tileBounds.south,
          west: tileBounds.west,
          east: tileBounds.east,
          includeGravity: options.includeGravity,
          mag: '1',
        });

        if (res.data && res.data.length > 0) {
          return res.data;
        }
        return [];
      } catch (err: unknown) {
        if (options.abortSignal?.aborted || attempt === maxAttempts) {
          throw err;
        }
        // Exponential backoff: 300ms, 600ms + random jitter
        const backoffMs = 300 * Math.pow(2, attempt - 1) + Math.random() * 200;
        console.warn(`Tile fetch attempt ${attempt} failed, retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    return [];
  };

  // Worker loop for concurrent execution with canonical discrete caching
  const worker = async (): Promise<void> => {
    while (nextTileIdx < tiles.length) {
      if (options.abortSignal?.aborted) {
        break;
      }

      const currentIdx = nextTileIdx++;
      const tile = tiles[currentIdx];

      try {
        // 1. Check Client-Side Cache (checks L1 memory and L2 IndexedDB)
        let tileRecords = await getClientCachedTileAsync(tile.bounds, options.includeGravity);

        if (!tileRecords) {
          // 2. Fetch from Edge Proxy API (with retry and gentle pacing)
          tileRecords = await fetchWithRetry(tile.bounds);

          if (options.abortSignal?.aborted) {
            break;
          }

          if (tileRecords.length > 0) {
            // Store canonical tile in Client-Side Cache (L1 Memory + L2 IndexedDB)
            setClientCachedTile(tile.bounds, options.includeGravity, tileRecords);
          }

          // Gentle 100ms stagger between uncached network requests
          await new Promise((r) => setTimeout(r, 100));
        }

        // 3. Clip canonical tile soundings to the user's exact requested bounding box
        const clippedTileRecords = clipRecordsToBounds(tileRecords, options.bounds);

        if (clippedTileRecords.length > 0) {
          allClippedRecords.push(...clippedTileRecords);
        }

        completedTiles++;

        const progressInfo: ChunkProgress = {
          completedTiles,
          totalTiles: tiles.length,
          loadedPoints: allClippedRecords.length,
          currentTile: tile,
          percentage: Math.round((completedTiles / tiles.length) * 100),
        };

        // Live JIT streaming callback with clipped soundings
        if (options.onChunkReceived && clippedTileRecords.length > 0) {
          options.onChunkReceived(clippedTileRecords, progressInfo);
        }

        if (options.onProgress) {
          options.onProgress(progressInfo);
        }
      } catch (err) {
        if (options.abortSignal?.aborted) return;
        console.error(`Failed to fetch tile ${tile.id}:`, err);
        throw err;
      }
    }
  };

  // Run concurrency workers in parallel
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tiles.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    records: allClippedRecords,
    totalTiles: tiles.length,
    executionTimeMs,
  };
}
