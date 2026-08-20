import type { TopexRecord, BouguerParams, BoundingBox } from '@/types';

// Gravitational constant converted for: rho in g/cm3, area in m2, distance/height in m -> result in mGal
// G = 6.6743e-11 m3/(kg s2) * 1e5 (m/s2 to mGal) * 1000 (g/cm3 to kg/m3) = 6.6743e-3
const G_TERRAIN_FACTOR = 6.6743e-3;

/**
 * Computes 3D Topographic / Bathymetric Terrain Correction (TC >= 0 in mGal)
 * for each observation sounding using spatial prism integration.
 *
 * Both mountains above station and submarine trenches below station produce
 * upward/deficient gravity, meaning the terrain correction TC is ALWAYS POSITIVE.
 *
 * Complete Bouguer Anomaly (CBA) = Simple Bouguer Anomaly (SBA) + TC
 */
export function computeTerrainCorrections(
  records: TopexRecord[],
  bounds: BoundingBox,
  params: BouguerParams = { crustalDensity: 2.67, waterDensity: 1.03, includeCurvatureBullardB: false },
  radiusKm = 15
): Float32Array {
  const n = records.length;
  const tcArray = new Float32Array(n);
  if (n === 0) return tcArray;

  const { crustalDensity, waterDensity } = params;
  const deltaRhoMarine = crustalDensity - waterDensity;

  const latSpan = Math.abs(bounds.north - bounds.south) || 1;
  const lonSpan = Math.abs(bounds.east - bounds.west) || 1;
  const midLat = (bounds.north + bounds.south) / 2;
  const metersPerDegLat = 111132.95;
  const metersPerDegLon = 111412.84 * Math.cos((midLat * Math.PI) / 180);

  // Approximate average cell area Delta A in m2
  const approxCells = Math.sqrt(n);
  const cellWidthM = (lonSpan * metersPerDegLon) / Math.max(10, approxCells);
  const cellHeightM = (latSpan * metersPerDegLat) / Math.max(10, approxCells);
  const cellAreaM2 = Math.max(100, cellWidthM * cellHeightM);

  const radiusMeters = radiusKm * 1000;
  const maxRadiusSq = radiusMeters * radiusMeters;

  // Spatial grid binning for fast neighborhood queries: O(N) instead of O(N^2)
  const binSizeM = radiusMeters;
  const numBinsX = Math.max(1, Math.ceil((lonSpan * metersPerDegLon) / binSizeM));
  const numBinsY = Math.max(1, Math.ceil((latSpan * metersPerDegLat) / binSizeM));

  const bins: number[][] = Array.from({ length: numBinsX * numBinsY }, () => []);

  // Pre-calculate metric coordinates for all records
  const posX = new Float32Array(n);
  const posY = new Float32Array(n);
  const elev = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const r = records[i];
    const x = (r.longitude - bounds.west) * metersPerDegLon;
    const y = (bounds.north - r.latitude) * metersPerDegLat;
    posX[i] = x;
    posY[i] = y;
    elev[i] = r.elevation ?? 0;

    const bx = Math.max(0, Math.min(numBinsX - 1, Math.floor(x / binSizeM)));
    const by = Math.max(0, Math.min(numBinsY - 1, Math.floor(y / binSizeM)));
    bins[by * numBinsX + bx].push(i);
  }

  // Compute TC for each station
  for (let i = 0; i < n; i++) {
    const x0 = posX[i];
    const y0 = posY[i];
    const z0 = elev[i];

    const bx0 = Math.max(0, Math.min(numBinsX - 1, Math.floor(x0 / binSizeM)));
    const by0 = Math.max(0, Math.min(numBinsY - 1, Math.floor(y0 / binSizeM)));

    let sumTC = 0;

    // Search adjacent spatial bins
    for (let dby = -1; dby <= 1; dby++) {
      const by = by0 + dby;
      if (by < 0 || by >= numBinsY) continue;

      for (let dbx = -1; dbx <= 1; dbx++) {
        const bx = bx0 + dbx;
        if (bx < 0 || bx >= numBinsX) continue;

        const binIndices = bins[by * numBinsX + bx];
        for (let k = 0; k < binIndices.length; k++) {
          const j = binIndices[k];
          if (i === j) continue;

          const dx = posX[j] - x0;
          const dy = posY[j] - y0;
          const rSq = dx * dx + dy * dy;

          if (rSq > maxRadiusSq || rSq < 1) continue;

          const dz = elev[j] - z0;
          if (Math.abs(dz) < 0.1) continue;

          // Effective density contrast
          const rho = elev[j] < 0 ? deltaRhoMarine : crustalDensity;

          // Prismatic Hammer approximation: G * rho * DeltaA * dz^2 / (2 * (r^2 + dz^2)^(3/2))
          const dist3D_sq = rSq + dz * dz;
          const dist3D = Math.sqrt(dist3D_sq);
          const kernel = (dz * dz) / (2 * dist3D_sq * dist3D);

          sumTC += G_TERRAIN_FACTOR * rho * cellAreaM2 * kernel;
        }
      }
    }

    tcArray[i] = Math.max(0, Number(sumTC.toFixed(3)));
  }

  return tcArray;
}
