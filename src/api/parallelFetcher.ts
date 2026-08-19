import type { BoundingBox, TopexRecord } from '@/types';
import { extractTopexData } from './client';
import { generateChunkTiles, ChunkTile, clipRecordsToBounds } from '@/utils/chunking';
import { getClientCachedTile, setClientCachedTile } from './clientCache';

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
  const concurrency = options.concurrency || 6;

  let completedTiles = 0;
  const allClippedRecords: TopexRecord[] = [];
  let nextTileIdx = 0;

  // Worker loop for concurrent execution with canonical discrete caching
  const worker = async (): Promise<void> => {
    while (nextTileIdx < tiles.length) {
      if (options.abortSignal?.aborted) {
        break;
      }

      const currentIdx = nextTileIdx++;
      const tile = tiles[currentIdx];

      try {
        // 1. Check Client-Side Cache (uses canonical tile bounds)
        let tileRecords = getClientCachedTile(tile.bounds, options.includeGravity);

        if (!tileRecords) {
          // 2. Fetch from Edge Proxy API (which checks Cloudflare Edge Cache)
          const res = await extractTopexData({
            north: tile.bounds.north,
            south: tile.bounds.south,
            west: tile.bounds.west,
            east: tile.bounds.east,
            includeGravity: options.includeGravity,
            mag: '1',
          });

          if (options.abortSignal?.aborted) {
            break;
          }

          if (res.data && res.data.length > 0) {
            tileRecords = res.data;
            // Store canonical tile in Client-Side Cache
            setClientCachedTile(tile.bounds, options.includeGravity, tileRecords);
          } else {
            tileRecords = [];
          }
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
