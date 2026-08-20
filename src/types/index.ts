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
  includeTerrainCorrection?: boolean; // default: true
  terrainRadiusKm?: number; // default: 15 km
}

export type RegionalResidualMethod = 'gaussian' | 'moving_avg' | 'poly2' | 'poly1' | 'none';

export interface RegionalResidualConfig {
  method: RegionalResidualMethod;
  radiusKm?: number; // for Gaussian filter in km (10 to 150 km, default: 35)
  gridWindowCells?: number; // for Moving Average grid radius k (k=1: 3x3, k=2: 5x5, k=3: 7x7, default: 3)
}

export interface ProcessedRecord extends TopexRecord {
  bouguer?: number; // Complete Bouguer Anomaly (CBA = SBA + TC)
  simpleBouguer?: number; // Simple Bouguer Anomaly (SBA = FAA - Slab)
  terrainCorrection?: number; // Terrain Correction (TC >= 0)
  slabCorrection?: number;
  regional?: number;
  residual?: number;
}

export interface ProfilePoint {
  index: number;
  distanceKm: number;
  latitude: number;
  longitude: number;
  elevation: number;
  freeAir?: number;
  bouguer?: number;
  simpleBouguer?: number;
  terrainCorrection?: number;
  slabCorrection?: number;
  regional?: number;
  residual?: number;
}

export interface ProfileLine {
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
}

export interface NamedProfileLine {
  id: string;
  name: string;
  labelStart: string;
  labelEnd: string;
  color: string;
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
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
