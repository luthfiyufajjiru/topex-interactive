import type { ProcessedRecord } from '@/types';

export type RegionalResidualMethod = 'none' | 'poly1' | 'poly2' | 'gaussian';

export interface RegionalResidualConfig {
  method: RegionalResidualMethod;
  radiusKm?: number; // for spatial moving average / Gaussian filter
}

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
 * 2D Polynomial Trend Surface Analysis (1st & 2nd Order Least Squares)
 *
 * 1st Order (Regional Plane):
 *   Regional(x, y) = c0 + c1*x + c2*y
 *
 * 2nd Order (Parabolic Crustal Surface):
 *   Regional(x, y) = c0 + c1*x + c2*y + c3*x^2 + c4*x*y + c5*y^2
 *
 * Residual Anomaly:
 *   Residual(x, y) = Bouguer(x, y) - Regional(x, y)
 */
export function separateRegionalResidual(
  records: ProcessedRecord[],
  config: RegionalResidualConfig = { method: 'poly2' }
): ProcessedRecord[] {
  if (config.method === 'none' || records.length === 0) {
    return records.map((r) => ({
      ...r,
      regional: undefined,
      residual: r.bouguer,
    }));
  }

  // Filter valid points with Bouguer values
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

  const order = config.method === 'poly1' ? 1 : 2;
  const numTerms = order === 1 ? 3 : 6;

  // Basis functions for a point (x, y)
  const getBasis = (lon: number, lat: number): number[] => {
    const x = lon - meanLon;
    const y = lat - meanLat;
    if (order === 1) {
      return [1, x, y];
    }
    return [1, x, y, x * x, x * y, y * y];
  };

  // Build Normal Equations: (F^T * F) * c = F^T * z
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

  // Solve for polynomial coefficients c
  const coeffs = solveLinearSystem(ATA, ATz);
  if (!coeffs) {
    // Fallback if singular
    return records.map((r) => ({ ...r, regional: r.bouguer, residual: 0 }));
  }

  // Compute Regional and Residual for all records
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
