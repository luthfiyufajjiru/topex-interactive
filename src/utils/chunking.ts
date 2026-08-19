import type { BoundingBox } from '@/types';

export interface ChunkTile {
  id: string;
  index: number;
  total: number;
  bounds: BoundingBox;
}

// 0.5 degrees is approx quarter of Bali island size (~30 nautical miles / ~900 soundings per tile)
// for ultra-fast, snappy parallel streaming.
const MAX_TILE_SPAN = 0.5;

/**
 * Splits a bounding box across 0 longitude if it spans negative and positive longitudes
 */
function splitAcrossZeroMeridian(bounds: BoundingBox): BoundingBox[] {
  if (bounds.west < 0 && bounds.east > 0) {
    return [
      {
        north: bounds.north,
        south: bounds.south,
        west: bounds.west,
        east: -0.001,
      },
      {
        north: bounds.north,
        south: bounds.south,
        west: 0.001,
        east: bounds.east,
      },
    ];
  }
  return [bounds];
}

/**
 * Subdivides any bounding box into mini-tiles (<= 0.5 degrees)
 * for rapid parallel extraction from UCSD TOPEX.
 */
export function generateChunkTiles(bounds: BoundingBox): ChunkTile[] {
  const initialBoxes = splitAcrossZeroMeridian(bounds);
  const rawTiles: BoundingBox[] = [];

  for (const box of initialBoxes) {
    const latSpan = Math.abs(box.north - box.south);
    const lonSpan = Math.abs(box.east - box.west);

    const latSteps = Math.max(1, Math.ceil(latSpan / MAX_TILE_SPAN));
    const lonSteps = Math.max(1, Math.ceil(lonSpan / MAX_TILE_SPAN));

    const latStepSize = latSpan / latSteps;
    const lonStepSize = lonSpan / lonSteps;

    for (let r = 0; r < latSteps; r++) {
      const south = parseFloat((box.south + r * latStepSize).toFixed(4));
      const north = parseFloat(
        (r === latSteps - 1 ? box.north : box.south + (r + 1) * latStepSize).toFixed(4)
      );

      for (let c = 0; c < lonSteps; c++) {
        const west = parseFloat((box.west + c * lonStepSize).toFixed(4));
        const east = parseFloat(
          (c === lonSteps - 1 ? box.east : box.west + (c + 1) * lonStepSize).toFixed(4)
        );

        rawTiles.push({
          north,
          south,
          west,
          east,
        });
      }
    }
  }

  return rawTiles.map((tileBounds, i) => ({
    id: `tile_${i + 1}_of_${rawTiles.length}`,
    index: i + 1,
    total: rawTiles.length,
    bounds: tileBounds,
  }));
}
