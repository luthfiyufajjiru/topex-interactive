import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { topexQuerySchema, TopexApiResponse, TopexRecord } from '../../shared/schema';
import { fetchUcsdGrid } from '../services/ucsdClient';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  generateCacheKey,
  getFromLocalCache,
  setToLocalCache,
} from '../services/cacheService';

export const topexRoute = new Hono()
  // Apply edge rate limiter: max 300 requests per minute per IP
  .use('/extract', createRateLimiter({ windowMs: 60000, maxRequests: 300 }))

  /**
   * POST /api/topex/extract
   * Fetches and parses topography (and optionally gravity) from UCSD with edge caching
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

      const cacheKey = generateCacheKey({
        north: params.north,
        south: params.south,
        west: params.west,
        east: params.east,
        mag: params.mag,
        includeGravity: params.includeGravity,
      });

      // 1. Check Worker / Edge Cache
      const cached = getFromLocalCache(cacheKey);
      if (cached) {
        c.header('X-Cache', 'HIT');
        c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
        return c.json(cached);
      }

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
          const gravityMap = new Map<string, number>();
          for (const g of gravityPoints) {
            const key = `${g.longitude.toFixed(4)}_${g.latitude.toFixed(4)}`;
            gravityMap.set(key, g.value);
          }

          const records: TopexRecord[] = topoPoints.map((t, idx) => {
            const key = `${t.longitude.toFixed(4)}_${t.latitude.toFixed(4)}`;
            let gravVal = gravityMap.get(key);
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

          // Save to edge cache
          setToLocalCache(cacheKey, response);

          c.header('X-Cache', 'MISS');
          c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
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

          // Save to edge cache
          setToLocalCache(cacheKey, response);

          c.header('X-Cache', 'MISS');
          c.header('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
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
