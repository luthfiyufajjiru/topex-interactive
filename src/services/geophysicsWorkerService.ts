import type {
  TopexRecord,
  ProcessedRecord,
  BouguerParams,
  BoundingBox,
  RegionalResidualConfig,
  GeophysicsSummaryStats,
} from '@/types';
import type { AllGridsResult } from '@/utils/geophysics/interpolation';
import type { WorkerRequest, WorkerResponse } from '@/workers/geophysics.worker';
import { calculateBouguerAnomaly, computeGeophysicsStats } from '@/utils/geophysics/bouguer';
import { separateRegionalResidual } from '@/utils/geophysics/regionalResidual';
import { buildAllRegularGrids } from '@/utils/geophysics/interpolation';

class GeophysicsWorkerService {
  private worker: Worker | null = null;
  private pendingCallbacks = new Map<
    string,
    {
      resolve: (data: WorkerResponse['data']) => void;
      reject: (err: Error) => void;
    }
  >();
  private reqIdCounter = 0;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(
        new URL('../workers/geophysics.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, type, data, error } = event.data;
        const cb = this.pendingCallbacks.get(id);
        if (!cb) return;

        this.pendingCallbacks.delete(id);

        if (type === 'SUCCESS' && data) {
          cb.resolve(data);
        } else {
          cb.reject(new Error(error || 'Worker task failed'));
        }
      };

      this.worker.onerror = (err) => {
        console.error('[GeophysicsWorker] Unhandled Worker error:', err);
      };
    } catch (e) {
      console.warn('[GeophysicsWorker] Could not initialize Web Worker, falling back to main thread:', e);
      this.worker = null;
    }
  }

  private postTask(type: WorkerRequest['type'], payload: WorkerRequest['payload']): Promise<WorkerResponse['data']> {
    const id = `geo_req_${++this.reqIdCounter}_${Date.now()}`;

    // If worker unavailable, run inline as fallback
    if (!this.worker) {
      return this.runFallback(type, payload);
    }

    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload });
    });
  }

  private async runFallback(
    type: WorkerRequest['type'],
    payload: WorkerRequest['payload']
  ): Promise<WorkerResponse['data']> {
    if (type === 'PROCESS_BOUGUER') {
      const withBouguer = calculateBouguerAnomaly(payload.rawRecords || [], payload.bouguerParams);
      const fullyProcessed = separateRegionalResidual(withBouguer, payload.residualConfig || { method: 'poly2' });
      const stats = computeGeophysicsStats(fullyProcessed);
      return { processedRecords: fullyProcessed, stats };
    }

    if (type === 'SEPARATE_REGIONAL') {
      const fullyProcessed = separateRegionalResidual(payload.processedRecords || [], payload.residualConfig || { method: 'poly2' });
      const stats = computeGeophysicsStats(fullyProcessed);
      return { processedRecords: fullyProcessed, stats };
    }

    if (type === 'BUILD_ALL_GRIDS') {
      if (!payload.bounds) throw new Error('Bounds required for grids');
      const grids = buildAllRegularGrids(payload.processedRecords || [], payload.bounds);
      return { grids };
    }

    if (type === 'FULL_PIPELINE') {
      const withBouguer = calculateBouguerAnomaly(payload.rawRecords || [], payload.bouguerParams);
      const fullyProcessed = separateRegionalResidual(withBouguer, payload.residualConfig || { method: 'poly2' });
      const stats = computeGeophysicsStats(fullyProcessed);
      let grids: AllGridsResult | undefined;
      if (payload.bounds) {
        grids = buildAllRegularGrids(fullyProcessed, payload.bounds);
      }
      return { processedRecords: fullyProcessed, stats, grids };
    }

    throw new Error(`Unknown type: ${type}`);
  }

  public async processBouguer(
    rawRecords: TopexRecord[],
    bouguerParams?: BouguerParams,
    residualConfig?: RegionalResidualConfig
  ): Promise<{ processedRecords: ProcessedRecord[]; stats: GeophysicsSummaryStats }> {
    const res = await this.postTask('PROCESS_BOUGUER', {
      rawRecords,
      bouguerParams,
      residualConfig,
    });
    return {
      processedRecords: res?.processedRecords || [],
      stats: res?.stats || {
        count: 0,
        topography: { min: 0, max: 0, mean: 0, stdDev: 0, rms: 0 },
      },
    };
  }

  public async separateRegional(
    processedRecords: ProcessedRecord[],
    residualConfig: RegionalResidualConfig
  ): Promise<{ processedRecords: ProcessedRecord[]; stats: GeophysicsSummaryStats }> {
    const res = await this.postTask('SEPARATE_REGIONAL', {
      processedRecords,
      residualConfig,
    });
    return {
      processedRecords: res?.processedRecords || [],
      stats: res?.stats || {
        count: 0,
        topography: { min: 0, max: 0, mean: 0, stdDev: 0, rms: 0 },
      },
    };
  }

  public async buildGrids(
    processedRecords: ProcessedRecord[],
    bounds: BoundingBox
  ): Promise<AllGridsResult> {
    const res = await this.postTask('BUILD_ALL_GRIDS', {
      processedRecords,
      bounds,
    });
    return (
      res?.grids || {
        topo: null,
        faa: null,
        bouguer: null,
        residual: null,
        regional: null,
      }
    );
  }

  public async fullPipeline(
    rawRecords: TopexRecord[],
    bounds: BoundingBox,
    bouguerParams?: BouguerParams,
    residualConfig?: RegionalResidualConfig
  ): Promise<{
    processedRecords: ProcessedRecord[];
    stats: GeophysicsSummaryStats;
    grids?: AllGridsResult;
  }> {
    const res = await this.postTask('FULL_PIPELINE', {
      rawRecords,
      bounds,
      bouguerParams,
      residualConfig,
    });
    return {
      processedRecords: res?.processedRecords || [],
      stats: res?.stats || {
        count: 0,
        topography: { min: 0, max: 0, mean: 0, stdDev: 0, rms: 0 },
      },
      grids: res?.grids,
    };
  }
}

export const geophysicsWorker = new GeophysicsWorkerService();
