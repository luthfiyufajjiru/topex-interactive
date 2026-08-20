import type {
  TopexRecord,
  ProcessedRecord,
  BouguerParams,
  BoundingBox,
  RegionalResidualConfig,
  GeophysicsSummaryStats,
} from '@/types';
import type { RegularGrid2D, AllGridsResult } from '@/utils/geophysics/interpolation';
import { calculateBouguerAnomaly, computeGeophysicsStats } from '@/utils/geophysics/bouguer';
import { separateRegionalResidual } from '@/utils/geophysics/regionalResidual';
import { buildAllRegularGrids } from '@/utils/geophysics/interpolation';

export type { RegularGrid2D, AllGridsResult };

export interface WorkerRequest {
  id: string;
  type: 'PROCESS_BOUGUER' | 'SEPARATE_REGIONAL' | 'BUILD_ALL_GRIDS' | 'FULL_PIPELINE';
  payload: {
    rawRecords?: TopexRecord[];
    processedRecords?: ProcessedRecord[];
    bouguerParams?: BouguerParams;
    residualConfig?: RegionalResidualConfig;
    bounds?: BoundingBox;
  };
}

export interface WorkerResponse {
  id: string;
  type: 'SUCCESS' | 'ERROR';
  data?: {
    processedRecords?: ProcessedRecord[];
    stats?: GeophysicsSummaryStats;
    grids?: AllGridsResult;
  };
  error?: string;
}

const DEFAULT_BOUGUER_PARAMS: BouguerParams = {
  crustalDensity: 2.67,
  waterDensity: 1.03,
  includeCurvatureBullardB: false,
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'PROCESS_BOUGUER') {
      const raw = payload.rawRecords || [];
      const params = payload.bouguerParams || DEFAULT_BOUGUER_PARAMS;
      const config = payload.residualConfig || { method: 'poly2' };

      const withBouguer = calculateBouguerAnomaly(raw, params);
      const fullyProcessed = separateRegionalResidual(withBouguer, config);
      const stats = computeGeophysicsStats(fullyProcessed);

      const response: WorkerResponse = {
        id,
        type: 'SUCCESS',
        data: {
          processedRecords: fullyProcessed,
          stats,
        },
      };
      self.postMessage(response);
      return;
    }

    if (type === 'SEPARATE_REGIONAL') {
      const records = payload.processedRecords || [];
      const config = payload.residualConfig || { method: 'poly2' };

      const fullyProcessed = separateRegionalResidual(records, config);
      const stats = computeGeophysicsStats(fullyProcessed);

      const response: WorkerResponse = {
        id,
        type: 'SUCCESS',
        data: {
          processedRecords: fullyProcessed,
          stats,
        },
      };
      self.postMessage(response);
      return;
    }

    if (type === 'BUILD_ALL_GRIDS') {
      const records = payload.processedRecords || [];
      const bounds = payload.bounds;

      if (!bounds) {
        throw new Error('BoundingBox is required to build regular matrices');
      }

      const grids = buildAllRegularGrids(records, bounds);

      const response: WorkerResponse = {
        id,
        type: 'SUCCESS',
        data: {
          grids,
        },
      };
      self.postMessage(response);
      return;
    }

    if (type === 'FULL_PIPELINE') {
      const raw = payload.rawRecords || [];
      const params = payload.bouguerParams || DEFAULT_BOUGUER_PARAMS;
      const config = payload.residualConfig || { method: 'poly2' };
      const bounds = payload.bounds;

      const withBouguer = calculateBouguerAnomaly(raw, params);
      const fullyProcessed = separateRegionalResidual(withBouguer, config);
      const stats = computeGeophysicsStats(fullyProcessed);

      let grids: AllGridsResult | undefined;
      if (bounds) {
        grids = buildAllRegularGrids(fullyProcessed, bounds);
      }

      const response: WorkerResponse = {
        id,
        type: 'SUCCESS',
        data: {
          processedRecords: fullyProcessed,
          stats,
          grids,
        },
      };
      self.postMessage(response);
      return;
    }

    throw new Error(`Unknown worker task type: ${type}`);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
