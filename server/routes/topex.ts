import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { topexQuerySchema, TopexApiResponse, TopexRecord } from '../../shared/schema';
import { fetchUcsdGrid } from '../services/ucsdClient';

export const topexRoute = new Hono()
  /**
   * POST /api/topex/extract
   * Fetches and parses topography (and optionally gravity) from UCSD
   */
  .post(
    '/extract',
    zValidator('json', topexQuerySchema, (result, c) => {
      if (!result.success) {
        return c.json(
          {
            success: false,
            count: 0,
            bounds: { north: 0, south: 0, west: 0, east: 0 },
            hasGravity: false,
            data: [],
            executionTimeMs: 0,
            error: result.error.errors.map((e) => e.message).join(', '),
          },
          400
        );
      }
    }),
    async (c) => {
      const startTime = performance.now();
      const params = c.req.valid('json');

      try {
        if (params.includeGravity) {
          // Fetch Elevation and Free Air Gravity in parallel
          const [topoPoints, gravityPoints] = await Promise.all([
            fetchUcsdGrid({
              north: params.north,
              south: params.south,
              west: params.west,
              east: params.east,
              mag: '1',
            }),
            fetchUcsdGrid({
              north: params.north,
              south: params.south,
              west: params.west,
              east: params.east,
              mag: '0.1',
            }),
          ]);

          // Build merged records
          // Create coordinate map for reliable gravity lookup
          const gravityMap = new Map<string, number>();
          for (const g of gravityPoints) {
            // Key by 4 decimal places
            const key = `${g.longitude.toFixed(4)}_${g.latitude.toFixed(4)}`;
            gravityMap.set(key, g.value);
          }

          const records: TopexRecord[] = topoPoints.map((t, idx) => {
            const key = `${t.longitude.toFixed(4)}_${t.latitude.toFixed(4)}`;
            let gravVal = gravityMap.get(key);
            // Fallback to index match if coordinates line up exactly
            if (gravVal === undefined && idx < gravityPoints.length) {
              gravVal = gravityPoints[idx].value;
            }
            return {
              longitude: t.longitude,
              latitude: t.latitude,
              elevation: t.value,
              gravity: gravVal,
            };
          });

          const executionTimeMs = Math.round(performance.now() - startTime);

          const response: TopexApiResponse = {
            success: true,
            count: records.length,
            bounds: {
              north: params.north,
              south: params.south,
              west: params.west,
              east: params.east,
            },
            hasGravity: true,
            data: records,
            executionTimeMs,
          };

          return c.json(response);
        } else {
          // Topography only or Gravity only based on mag param
          const points = await fetchUcsdGrid({
            north: params.north,
            south: params.south,
            west: params.west,
            east: params.east,
            mag: params.mag,
          });

          const isGravity = params.mag === '0.1';
          const records: TopexRecord[] = points.map((p) => ({
            longitude: p.longitude,
            latitude: p.latitude,
            ...(isGravity ? { gravity: p.value } : { elevation: p.value }),
          }));

          const executionTimeMs = Math.round(performance.now() - startTime);

          const response: TopexApiResponse = {
            success: true,
            count: records.length,
            bounds: {
              north: params.north,
              south: params.south,
              west: params.west,
              east: params.east,
            },
            hasGravity: isGravity,
            data: records,
            executionTimeMs,
          };

          return c.json(response);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown upstream error';
        const executionTimeMs = Math.round(performance.now() - startTime);

        return c.json(
          {
            success: false,
            count: 0,
            bounds: {
              north: params.north,
              south: params.south,
              west: params.west,
              east: params.east,
            },
            hasGravity: false,
            data: [],
            executionTimeMs,
            error: errorMsg,
          },
          502
        );
      }
    }
  )

  /**
   * GET /api/topex/health
   */
  .get('/health', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      upstream: 'https://topex.ucsd.edu/cgi-bin/get_data.cgi',
    });
  });
