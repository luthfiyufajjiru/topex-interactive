import type { ProcessedRecord, RegionalResidualConfig } from '@/types';
import { haversineDistanceKm } from './profile';

export type { RegionalResidualConfig };

/**
 * Solves an N x N linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Augmented matrix
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let k = 0; k < n; k++) {
    // Pivot selection
    let maxRow = k;
    let maxVal = Math.abs(M[k][k]);
    for (let r = k + 1; r < n; r++) {
      if (Math.abs(M[r][k]) > maxVal) {
        maxVal = Math.abs(M[r][k]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) return null; // Singular matrix

    // Swap rows
    if (maxRow !== k) {
      const tmp = M[k];
      M[k] = M[maxRow];
      M[maxRow] = tmp;
    }

    // Eliminate column
    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) {
        M[i][j] -= factor * M[k][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }

  return x;
}

/**
 * Fast 2D Spatial Moving Average & Gaussian Filter
 * Separates Regional and Residual fields using a spatial filter window of radius R (in km).
 */
function applySpatialWindowFilter(
  records: ProcessedRecord[],
  radiusKm: number,
  isGaussian: boolean
): ProcessedRecord[] {
  const n = records.length;
  if (n === 0) return records;

  // Extract unique sorted grid coords
  const lats = Array.from(new Set(records.map((r) => Number(r.latitude.toFixed(4))))).sort((a, b) => b - a);
  const lons = Array.from(new Set(records.map((r) => Number(r.longitude.toFixed(4))))).sort((a, b) => a - b);

  const nrows = lats.length;
  const ncols = lons.length;

  if (nrows === 0 || ncols === 0) {
    return records.map((r) => ({ ...r, regional: r.bouguer, residual: 0 }));
  }

  // Calculate approximate pixel resolution in km
  const midLat = (lats[0] + lats[nrows - 1]) / 2;
  const midLon = (lons[0] + lons[ncols - 1]) / 2;

  const latStepKm = nrows > 1 ? haversineDistanceKm(lats[0], midLon, lats[1], midLon) : 1;
  const lonStepKm = ncols > 1 ? haversineDistanceKm(midLat, lons[0], midLat, lons[1]) : 1;

  const rCellY = Math.max(1, Math.round(radiusKm / Math.max(0.1, latStepKm)));
  const rCellX = Math.max(1, Math.round(radiusKm / Math.max(0.1, lonStepKm)));

  // Build 2D grid matrix
  const grid = new Float32Array(nrows * ncols);
  grid.fill(NaN);

  const latIndexMap = new Map<number, number>();
  lats.forEach((lat, i) => latIndexMap.set(lat, i));

  const lonIndexMap = new Map<number, number>();
  lons.forEach((lon, j) => lonIndexMap.set(lon, j));

  for (let i = 0; i < n; i++) {
    const r = records[i];
    if (r.bouguer === undefined || isNaN(r.bouguer)) continue;
    const row = latIndexMap.get(Number(r.latitude.toFixed(4)));
    const col = lonIndexMap.get(Number(r.longitude.toFixed(4)));
    if (row !== undefined && col !== undefined) {
      grid[row * ncols + col] = r.bouguer;
    }
  }

  // Precompute 2D kernel weights
  const sigmaKm = radiusKm / 2;
  const twoSigmaSq = 2 * sigmaKm * sigmaKm;

  const regionalGrid = new Float32Array(nrows * ncols);

  for (let row = 0; row < nrows; row++) {
    for (let col = 0; col < ncols; col++) {
      let weightSum = 0;
      let valSum = 0;

      const minR = Math.max(0, row - rCellY);
      const maxR = Math.min(nrows - 1, row + rCellY);
      const minC = Math.max(0, col - rCellX);
      const maxC = Math.min(ncols - 1, col + rCellX);

      for (let nr = minR; nr <= maxR; nr++) {
        const dyKm = (nr - row) * latStepKm;

        for (let nc = minC; nc <= maxC; nc++) {
          const val = grid[nr * ncols + nc];
          if (isNaN(val)) continue;

          const dxKm = (nc - col) * lonStepKm;
          const distSq = dxKm * dxKm + dyKm * dyKm;

          if (distSq <= radiusKm * radiusKm) {
            let w = 1.0;
            if (isGaussian) {
              w = Math.exp(-distSq / twoSigmaSq);
            }
            valSum += val * w;
            weightSum += w;
          }
        }
      }

      regionalGrid[row * ncols + col] = weightSum > 0 ? valSum / weightSum : grid[row * ncols + col];
    }
  }

  // Map back to records
  return records.map((r) => {
    if (r.bouguer === undefined || isNaN(r.bouguer)) {
      return { ...r, regional: undefined, residual: undefined };
    }

    const row = latIndexMap.get(Number(r.latitude.toFixed(4)));
    const col = lonIndexMap.get(Number(r.longitude.toFixed(4)));

    if (row !== undefined && col !== undefined) {
      const regionalVal = regionalGrid[row * ncols + col];
      const residualVal = r.bouguer - regionalVal;
      return {
        ...r,
        regional: Number(regionalVal.toFixed(3)),
        residual: Number(residualVal.toFixed(3)),
      };
    }

    return { ...r, regional: r.bouguer, residual: 0 };
  });
}

/**
 * 2D Polynomial Trend Surface Analysis (1st & 2nd Order Least Squares)
 */
function applyPolynomialFilter(
  records: ProcessedRecord[],
  order: 1 | 2
): ProcessedRecord[] {
  const validRecords = records.filter((r) => r.bouguer !== undefined && !isNaN(r.bouguer));
  if (validRecords.length < 10) {
    return records.map((r) => ({ ...r, regional: r.bouguer, residual: 0 }));
  }

  // Center coordinates to prevent numerical instability
  let meanLon = 0;
  let meanLat = 0;
  for (let i = 0; i < validRecords.length; i++) {
    meanLon += validRecords[i].longitude;
    meanLat += validRecords[i].latitude;
  }
  meanLon /= validRecords.length;
  meanLat /= validRecords.length;

  const numTerms = order === 1 ? 3 : 6;

  const getBasis = (lon: number, lat: number): number[] => {
    const x = lon - meanLon;
    const y = lat - meanLat;
    if (order === 1) {
      return [1, x, y];
    }
    return [1, x, y, x * x, x * y, y * y];
  };

  const ATA: number[][] = Array.from({ length: numTerms }, () => new Array(numTerms).fill(0));
  const ATz: number[] = new Array(numTerms).fill(0);

  for (let i = 0; i < validRecords.length; i++) {
    const r = validRecords[i];
    const z = r.bouguer!;
    const f = getBasis(r.longitude, r.latitude);

    for (let j = 0; j < numTerms; j++) {
      ATz[j] += f[j] * z;
      for (let k = 0; k < numTerms; k++) {
        ATA[j][k] += f[j] * f[k];
      }
    }
  }

  const coeffs = solveLinearSystem(ATA, ATz);
  if (!coeffs) {
    return records.map((r) => ({ ...r, regional: r.bouguer, residual: 0 }));
  }

  return records.map((r) => {
    if (r.bouguer === undefined || isNaN(r.bouguer)) {
      return { ...r, regional: undefined, residual: undefined };
    }

    const f = getBasis(r.longitude, r.latitude);
    let regionalVal = 0;
    for (let j = 0; j < numTerms; j++) {
      regionalVal += coeffs[j] * f[j];
    }

    const residualVal = r.bouguer - regionalVal;

    return {
      ...r,
      regional: Number(regionalVal.toFixed(3)),
      residual: Number(residualVal.toFixed(3)),
    };
  });
}

/**
 * High-Level Regional-Residual Separation Dispatcher
 */
export function separateRegionalResidual(
  records: ProcessedRecord[],
  config: RegionalResidualConfig = { method: 'gaussian', radiusKm: 35 }
): ProcessedRecord[] {
  if (config.method === 'none' || records.length === 0) {
    return records.map((r) => ({
      ...r,
      regional: undefined,
      residual: r.bouguer,
    }));
  }

  if (config.method === 'poly1') {
    return applyPolynomialFilter(records, 1);
  }

  if (config.method === 'poly2') {
    return applyPolynomialFilter(records, 2);
  }

  if (config.method === 'moving_avg') {
    return applySpatialWindowFilter(records, config.radiusKm || 35, false);
  }

  // Default: Gaussian Spatial Filter
  return applySpatialWindowFilter(records, config.radiusKm || 35, true);
}
