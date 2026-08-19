export type { TopexQueryParams, TopexRecord, TopexApiResponse } from '@shared/schema';
import type { TopexRecord } from '@shared/schema';

export type WorkflowStep = 'extract' | 'process' | 'studio';

export type DatasetType = 'topography' | 'freeAir' | 'bouguer';

export type InterpolationMethod = 'bicubic' | 'spline' | 'bilinear' | 'idw' | 'nearest';

export interface BoundingBox {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface BouguerParams {
  crustalDensity: number; // default: 2.67 g/cm3
  waterDensity: number;   // default: 1.03 g/cm3
  includeCurvatureBullardB: boolean; // default: false
}

export interface ProcessedRecord extends TopexRecord {
  bouguer?: number;
  slabCorrection?: number;
}

export interface VariableStats {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  rms: number;
}

export interface GeophysicsSummaryStats {
  count: number;
  topography: VariableStats;
  freeAir?: VariableStats;
  bouguer?: VariableStats;
}

export interface SummaryStats {
  count: number;
  minElevation?: number;
  maxElevation?: number;
  avgElevation?: number;
  minGravity?: number;
  maxGravity?: number;
  avgGravity?: number;
  minBouguer?: number;
  maxBouguer?: number;
  avgBouguer?: number;
}
