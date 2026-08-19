export type { TopexQueryParams, TopexRecord, TopexApiResponse } from '@shared/schema';

export interface BoundingBox {
  north: number;
  south: number;
  west: number;
  east: number;
}

export interface SummaryStats {
  count: number;
  minElevation?: number;
  maxElevation?: number;
  avgElevation?: number;
  minGravity?: number;
  maxGravity?: number;
  avgGravity?: number;
}
