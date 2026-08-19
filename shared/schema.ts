import { z } from 'zod';

export const topexQuerySchema = z
  .object({
    north: z.coerce.number().min(-80.738, 'North latitude must be >= -80.738').max(80.738, 'North latitude must be <= 80.738'),
    south: z.coerce.number().min(-80.738, 'South latitude must be >= -80.738').max(80.738, 'South latitude must be <= 80.738'),
    west: z.coerce.number().min(-360, 'West longitude must be >= -360').max(360, 'West longitude must be <= 360'),
    east: z.coerce.number().min(-360, 'East longitude must be >= -360').max(360, 'East longitude must be <= 360'),
    mag: z.enum(['1', '0.1']).default('1'), // 1 = Topography, 0.1 = Gravity
    includeGravity: z.coerce.boolean().optional().default(true),
  })
  .refine((data) => data.north > data.south, {
    message: 'North latitude must be strictly greater than South latitude',
    path: ['north'],
  })
  .refine((data) => data.east > data.west, {
    message: 'East longitude must be strictly greater than West longitude',
    path: ['east'],
  })
  .refine((data) => Math.abs(data.north - data.south) <= 20.001, {
    message: 'Latitude selection area must be 20 degrees or less',
    path: ['north'],
  })
  .refine((data) => Math.abs(data.east - data.west) <= 20.001, {
    message: 'Longitude selection area must be 20 degrees or less',
    path: ['east'],
  })
  .refine((data) => !(data.west < 0 && data.east > 0), {
    message: 'Selection cannot span across longitude 0. Adjust boundaries or shift coordinates by +360.',
    path: ['west'],
  });

export type TopexQueryParams = z.infer<typeof topexQuerySchema>;

export interface TopexRecord {
  longitude: number;
  latitude: number;
  elevation?: number;
  gravity?: number;
}

export interface TopexApiResponse {
  success: boolean;
  count: number;
  bounds: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
  hasGravity: boolean;
  data: TopexRecord[];
  executionTimeMs: number;
  error?: string;
}
