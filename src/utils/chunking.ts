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

  return records.filter((r) => {
    return (
      r.latitude >= minLat &&
      r.latitude <= maxLat &&
      r.longitude >= minLon &&
      r.longitude <= maxLon
    );
  });
}

/**
 * Structural Grid Integrity & Checksum Validator.
 * Verifies that returned soundings form a valid, non-truncated geophysical grid
 * before committing to L1 memory, L2 IndexedDB, or edge cache.
 */
export interface TileValidationResult {
  isValid: boolean;
  reason?: string;
  pointCount: number;
  expectedMinPoints: number;
}

export function validateTileIntegrity(
  records: { latitude: number; longitude: number; elevation?: number; gravity?: number }[] | undefined,
  bounds: BoundingBox,
  includeGravity: boolean
): TileValidationResult {
  const pointCount = records ? records.length : 0;

  if (!records || pointCount === 0) {
    return {
      isValid: false,
      reason: 'Empty dataset (0 soundings returned)',
      pointCount: 0,
      expectedMinPoints: 50,
    };
  }

  // 1. Minimum Point Density Calculation
  // Standard TOPEX 1-minute grid on 0.5° x 0.5° has ~31 x 31 = 961 points (min threshold ~250).
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lonSpan = Math.abs(bounds.east - bounds.west);
  const isFullTile = latSpan >= 0.45 && lonSpan >= 0.45;
  const expectedMinPoints = isFullTile ? 250 : Math.max(20, Math.round(latSpan * lonSpan * 1000));

  if (pointCount < expectedMinPoints) {
    return {
      isValid: false,
      reason: `Truncated stream: received ${pointCount} points, expected at least ${expectedMinPoints}`,
      pointCount,
      expectedMinPoints,
    };
  }

  // 2. Sample Check for NaN / Coordinate Sanity & Elevation Range (-12000m to +9000m)
  const sampleSize = Math.min(pointCount, 30);
  const step = Math.max(1, Math.floor(pointCount / sampleSize));

  for (let i = 0; i < pointCount; i += step) {
    const r = records[i];
    if (isNaN(r.latitude) || isNaN(r.longitude)) {
      return {
        isValid: false,
        reason: `Corrupted coordinate at index ${i}`,
        pointCount,
        expectedMinPoints,
      };
    }

    if (r.elevation !== undefined) {
      if (isNaN(r.elevation) || r.elevation < -12000 || r.elevation > 9000) {
        return {
          isValid: false,
          reason: `Out-of-bounds elevation value (${r.elevation}m) at index ${i}`,
          pointCount,
          expectedMinPoints,
        };
      }
    }

    if (includeGravity && r.gravity !== undefined) {
      if (isNaN(r.gravity) || r.gravity < -1000 || r.gravity > 1000) {
        return {
          isValid: false,
          reason: `Out-of-bounds gravity anomaly value (${r.gravity} mGal) at index ${i}`,
          pointCount,
          expectedMinPoints,
        };
      }
    }
  }

  return {
    isValid: true,
    pointCount,
    expectedMinPoints,
  };
}
