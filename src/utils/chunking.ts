import type { BoundingBox } from '@/types';

export interface ChunkTile {
  id: string;
  gridRow: number;
  gridCol: number;
  index: number;
  total: number;
  bounds: BoundingBox;
}

// Canonical discrete grid resolution: 0.5° x 0.5° (quarter Bali island size)
// All bounding boxes snap to this universal global grid.
// This guarantees that any overlapping user selections anywhere in the world
// hit the exact same deterministic cache keys at Cloudflare Edge and in browser memory!
export const CANONICAL_GRID_STEP = 0.5;

/**
 * Generates canonical discrete grid tiles that cover the given bounding box.
 * Every tile has deterministic boundaries aligned to integer multiples of 0.5°.
 */
export function generateChunkTiles(bounds: BoundingBox): ChunkTile[] {
  const minLat = Math.min(bounds.south, bounds.north);
  const maxLat = Math.max(bounds.south, bounds.north);
  const minLon = Math.min(bounds.west, bounds.east);
  const maxLon = Math.max(bounds.west, bounds.east);

  const startRow = Math.floor(minLat / CANONICAL_GRID_STEP);
  const endRow = Math.floor((maxLat - 0.00001) / CANONICAL_GRID_STEP);

  const startCol = Math.floor(minLon / CANONICAL_GRID_STEP);
  const endCol = Math.floor((maxLon - 0.00001) / CANONICAL_GRID_STEP);

  const tiles: ChunkTile[] = [];
  let index = 1;

  for (let r = startRow; r <= endRow; r++) {
    const south = parseFloat((r * CANONICAL_GRID_STEP).toFixed(4));
    const north = parseFloat(((r + 1) * CANONICAL_GRID_STEP).toFixed(4));

    for (let c = startCol; c <= endCol; c++) {
      let west = parseFloat((c * CANONICAL_GRID_STEP).toFixed(4));
      let east = parseFloat(((c + 1) * CANONICAL_GRID_STEP).toFixed(4));

      // Handle 0-meridian wrap boundary
      if (west < 0 && east >= 0) {
        // Tile spans 0: split at 0
        if (west < 0) {
          tiles.push({
            id: `tile_r${r}_c${c}_neg`,
            gridRow: r,
            gridCol: c,
            index: index++,
            total: 0,
            bounds: { north, south, west, east: -0.001 },
          });
        }
        if (east > 0) {
          tiles.push({
            id: `tile_r${r}_c${c}_pos`,
            gridRow: r,
            gridCol: c,
            index: index++,
            total: 0,
            bounds: { north, south, west: 0.001, east },
          });
        }
        continue;
      }

      tiles.push({
        id: `tile_r${r}_c${c}`,
        gridRow: r,
        gridCol: c,
        index: index++,
        total: 0,
        bounds: { north, south, west, east },
      });
    }
  }

  // Update total counts
  const total = tiles.length;
  tiles.forEach((t) => {
    t.total = total;
  });

  return tiles;
}

/**
 * Clips an array of soundings to the exact user-specified bounding box
 */
export function clipRecordsToBounds<T extends { latitude: number; longitude: number }>(
  records: T[],
  bounds: BoundingBox
): T[] {
  const minLat = Math.min(bounds.south, bounds.north);
  const maxLat = Math.max(bounds.south, bounds.north);
  const minLon = Math.min(bounds.west, bounds.east);
  const maxLon = Math.max(bounds.west, bounds.east);

  return records.filter(
    (r) =>
      r.latitude >= minLat - 0.0001 &&
      r.latitude <= maxLat + 0.0001 &&
      r.longitude >= minLon - 0.0001 &&
      r.longitude <= maxLon + 0.0001
  );
}
