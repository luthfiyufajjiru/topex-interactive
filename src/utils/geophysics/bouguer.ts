import type { TopexRecord, BouguerParams, ProcessedRecord, GeophysicsSummaryStats, VariableStats, BoundingBox } from '@/types';
import { computeTerrainCorrections } from './terrainCorrection';

// Gravitational constant factor: 2 * pi * G = 0.04193 mGal * cm3 / (g * m)
export const BOUGUER_GRAV_FACTOR = 0.04193;

/**
 * Calculates Simple and Complete Bouguer Anomaly for a dataset containing Topography (m) and Free-Air Gravity (mGal).
 *
 * Continental (Onshore, h >= 0):
 *   SBA = FAA - 2*pi*G * rho_c * h
 *
 * Marine / Ocean (Offshore, h < 0, where water replaces rock):
 *   SBA = FAA - 2*pi*G * (rho_c - rho_w) * h
 *
 * Complete Bouguer Anomaly (CBA):
 *   CBA = SBA + TC (where TC >= 0 is 3D Terrain Correction)
 */
export function calculateBouguerAnomaly(
  records: TopexRecord[],
  params: BouguerParams = { crustalDensity: 2.67, waterDensity: 1.03, includeCurvatureBullardB: false },
  bounds?: BoundingBox
): ProcessedRecord[] {
  const { crustalDensity, waterDensity, includeTerrainCorrection = true, terrainRadiusKm = 15 } = params;
  const deltaRhoMarine = crustalDensity - waterDensity;

  // Compute bounding box if not provided
  let bBox = bounds;
  if (!bBox && records.length > 0) {
    let north = -90, south = 90, west = 180, east = -180;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.latitude > north) north = r.latitude;
      if (r.latitude < south) south = r.latitude;
      if (r.longitude > east) east = r.longitude;
      if (r.longitude < west) west = r.longitude;
    }
    bBox = { north, south, west, east };
  }

  const tcArray = bBox && includeTerrainCorrection
    ? computeTerrainCorrections(records, bBox, params, terrainRadiusKm)
    : null;

  return records.map((rec, i) => {
    const h = rec.elevation ?? 0;
    const faa = rec.gravity;

    if (faa === undefined || faa === null || isNaN(faa)) {
      return {
        ...rec,
        bouguer: undefined,
        simpleBouguer: undefined,
        terrainCorrection: undefined,
        slabCorrection: undefined,
      };
    }

    let slabCorrection = 0;

    if (h >= 0) {
      // Onshore / Land Bouguer Slab Reduction
      slabCorrection = BOUGUER_GRAV_FACTOR * crustalDensity * h;
    } else {
      // Marine / Oceanic Bouguer Slab Reduction (h < 0)
      slabCorrection = BOUGUER_GRAV_FACTOR * deltaRhoMarine * h;
    }

    const simpleBouguer = faa - slabCorrection;
    const tc = tcArray ? tcArray[i] : 0;
    const completeBouguer = simpleBouguer + tc;

    return {
      ...rec,
      bouguer: Number(completeBouguer.toFixed(3)),
      simpleBouguer: Number(simpleBouguer.toFixed(3)),
      terrainCorrection: Number(tc.toFixed(3)),
      slabCorrection: Number(slabCorrection.toFixed(3)),
    };
  });
}

function calculateVarStats(values: number[]): VariableStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, rms: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }

  const n = values.length;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stdDev = Math.sqrt(variance);
  const rms = Math.sqrt(sumSq / n);

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    rms: Number(rms.toFixed(2)),
  };
}

/**
 * Computes complete geophysical statistics for Topography, Free Air, and Bouguer.
 */
export function computeGeophysicsStats(records: ProcessedRecord[]): GeophysicsSummaryStats {
  const elevValues: number[] = [];
  const faaValues: number[] = [];
  const bgValues: number[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.elevation !== undefined && !isNaN(r.elevation)) elevValues.push(r.elevation);
    if (r.gravity !== undefined && !isNaN(r.gravity)) faaValues.push(r.gravity);
    if (r.bouguer !== undefined && !isNaN(r.bouguer)) bgValues.push(r.bouguer);
  }

  return {
    count: records.length,
    topography: calculateVarStats(elevValues),
    freeAir: faaValues.length > 0 ? calculateVarStats(faaValues) : undefined,
    bouguer: bgValues.length > 0 ? calculateVarStats(bgValues) : undefined,
  };
}

export interface DensityRegressionResult {
  slope: number; // mGal / m (dFAA / dh)
  intercept: number; // mGal
  rSquared: number; // Correlation coefficient R^2
  empiricalDensity: number; // Derived rho_c (g/cm^3)
  effectiveContrast: number; // Derived Delta_rho (g/cm^3)
  pointCount: number;
  samplePoints: { x: number; y: number }[]; // x = h (m), y = FAA (mGal)
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  meanX: number;
  meanY: number;
}

/**
 * Calculates Parasnis (1952, 1962) / Nettleton (1939) Linear Regression between
 * Topography (h in meters) and Free-Air Gravity Anomaly (FAA in mGal) to determine optimal
 * empirical in-situ crustal density.
 *
 * Mathematical formulation:
 *   FAA = m * h + c
 *   m = 2 * pi * G * rho
 *   rho = m / (2 * pi * G) = m / 0.04193
 *
 * References:
 *   1. Parasnis, D. S. (1962). Principles of Applied Geophysics. Chapman and Hall.
 *   2. Nettleton, L. L. (1939). Determination of density for reduction of gravimeter observations. Geophysics, 4(3), 176-183.
 *   3. Telford, W. M., et al. (1990). Applied Geophysics (2nd ed.). Cambridge University Press, pp. 12-25.
 */
export function computeDensityLinearRegression(
  records: TopexRecord[] | ProcessedRecord[],
  waterDensity: number = 1.03,
  maxSamplePoints: number = 800
): DensityRegressionResult | null {
  const validPoints: { x: number; y: number }[] = [];
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const h = r.elevation;
    const faa = r.gravity;
    if (h !== undefined && faa !== undefined && !isNaN(h) && !isNaN(faa)) {
      validPoints.push({ x: h, y: faa });
      if (h < xMin) xMin = h;
      if (h > xMax) xMax = h;
      if (faa < yMin) yMin = faa;
      if (faa > yMax) yMax = faa;
    }
  }

  const n = validPoints.length;
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const { x, y } = validPoints[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Correlation R^2
  const numR = n * sumXY - sumX * sumY;
  const denR = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  const r = denR !== 0 ? numR / denR : 0;
  const rSquared = r * r;

  // Calculate empirical density:
  // If mostly marine (meanX < 0), slope = 2*pi*G * (rho_c - rho_w) => rho_c = rho_w + slope / 0.04193
  // If continental (meanX >= 0), slope = 2*pi*G * rho_c => rho_c = slope / 0.04193
  let empiricalDensity = 2.67;
  const rawDensity = slope / BOUGUER_GRAV_FACTOR;

  if (meanX < 0) {
    empiricalDensity = waterDensity + rawDensity;
  } else {
    empiricalDensity = rawDensity;
  }

  // Clamped for reasonable geological stability display [1.80, 3.30]
  const clampedDensity = Math.max(1.8, Math.min(3.3, empiricalDensity));

  // Subsample points for scatter plot rendering
  let samplePoints: { x: number; y: number }[] = validPoints;
  if (n > maxSamplePoints) {
    const step = Math.ceil(n / maxSamplePoints);
    samplePoints = [];
    for (let i = 0; i < n; i += step) {
      samplePoints.push(validPoints[i]);
    }
  }

  return {
    slope: Number(slope.toFixed(5)),
    intercept: Number(intercept.toFixed(2)),
    rSquared: Number(rSquared.toFixed(4)),
    empiricalDensity: Number(clampedDensity.toFixed(2)),
    effectiveContrast: Number(rawDensity.toFixed(2)),
    pointCount: n,
    samplePoints,
    xMin,
    xMax,
    yMin,
    yMax,
    meanX,
    meanY,
  };
}

