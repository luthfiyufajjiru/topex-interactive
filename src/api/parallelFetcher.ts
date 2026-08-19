import type { BoundingBox, TopexRecord } from '@/types';
import { extractTopexData } from './client';
import { generateChunkTiles, ChunkTile } from '@/utils/chunking';

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
  const tiles = generateChunkTiles(options.bounds);
  const concurrency = options.concurrency || 6;

  let completedTiles = 0;
  const allRecords: TopexRecord[] = [];
  let nextTileIdx = 0;

  // Worker loop for concurrent execution
  const worker = async (): Promise<void> => {
    while (nextTileIdx < tiles.length) {
      if (options.abortSignal?.aborted) {
        break;
      }

      const currentIdx = nextTileIdx++;
      const tile = tiles[currentIdx];

      try {
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
          allRecords.push(...res.data);
        }

        completedTiles++;

        const progressInfo: ChunkProgress = {
          completedTiles,
          totalTiles: tiles.length,
          loadedPoints: allRecords.length,
          currentTile: tile,
          percentage: Math.round((completedTiles / tiles.length) * 100),
        };

        // Real-time Just-in-Time stream callback
        if (options.onChunkReceived && res.data && res.data.length > 0) {
          options.onChunkReceived(res.data, progressInfo);
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
    records: allRecords,
    totalTiles: tiles.length,
    executionTimeMs,
  };
}
