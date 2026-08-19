import type { TopexRecord, BouguerParams, ProcessedRecord, GeophysicsSummaryStats, VariableStats } from '@/types';

// Gravitational constant factor: 2 * pi * G = 0.04193 mGal * cm3 / (g * m)
export const BOUGUER_GRAV_FACTOR = 0.04193;

/**
 * Calculates Complete Bouguer Anomaly for a dataset containing Topography (m) and Free-Air Gravity (mGal).
 *
 * Continental (Onshore, h >= 0):
 *   BA = FAA - 2*pi*G * rho_c * h
 *
 * Marine / Ocean (Offshore, h < 0, where water replaces rock):
 *   BA = FAA - 2*pi*G * (rho_c - rho_w) * h
 *   (Since h is negative, this adds the positive Bouguer slab correction to compensate for mass deficit of seawater)
 */
export function calculateBouguerAnomaly(
  records: TopexRecord[],
  params: BouguerParams = { crustalDensity: 2.67, waterDensity: 1.03, includeCurvatureBullardB: false }
): ProcessedRecord[] {
  const { crustalDensity, waterDensity } = params;
  const deltaRhoMarine = crustalDensity - waterDensity;

  return records.map((rec) => {
    const h = rec.elevation ?? 0;
    const faa = rec.gravity;

    if (faa === undefined || faa === null || isNaN(faa)) {
      return {
        ...rec,
        bouguer: undefined,
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

    const bouguer = faa - slabCorrection;

    return {
      ...rec,
      bouguer: Number(bouguer.toFixed(3)),
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
