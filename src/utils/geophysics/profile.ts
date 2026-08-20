import type { ProfilePoint, ProfileLine, BoundingBox, InterpolationMethod } from '@/types';
import { RegularGrid2D, sampleInterpolatedValue } from './interpolation';

/**
 * Calculates Great Circle distance between two coordinates in kilometers using the Haversine formula.
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resamples continuous geophysical values along a line transect from point A to point A'.
 */
export function extractProfilePoints(
  line: ProfileLine,
  gridTopo: RegularGrid2D | null,
  gridFaa: RegularGrid2D | null,
  gridBg: RegularGrid2D | null,
  gridResidual: RegularGrid2D | null = null,
  gridRegional: RegularGrid2D | null = null,
  bounds: BoundingBox,
  method: InterpolationMethod = 'bicubic',
  numSamples = 100
): ProfilePoint[] {
  if (!gridTopo) return [];

  const points: ProfilePoint[] = [];
  const totalDistKm = haversineDistanceKm(line.start.lat, line.start.lon, line.end.lat, line.end.lon);

  const lonRange = bounds.east - bounds.west || 1;
  const latRange = bounds.north - bounds.south || 1;

  for (let i = 0; i <= numSamples; i++) {
    const fraction = i / numSamples;
    const lat = line.start.lat + (line.end.lat - line.start.lat) * fraction;
    const lon = line.start.lon + (line.end.lon - line.start.lon) * fraction;
    const distanceKm = Number((totalDistKm * fraction).toFixed(2));

    const u = Math.max(0, Math.min(1, (lon - bounds.west) / lonRange));
    const v = Math.max(0, Math.min(1, (bounds.north - lat) / latRange));

    const elev = sampleInterpolatedValue(gridTopo, u, v, method);
    const faa = gridFaa ? sampleInterpolatedValue(gridFaa, u, v, method) : undefined;
    const bg = gridBg ? sampleInterpolatedValue(gridBg, u, v, method) : undefined;
    const residual = gridResidual ? sampleInterpolatedValue(gridResidual, u, v, method) : undefined;
    const regional = gridRegional ? sampleInterpolatedValue(gridRegional, u, v, method) : undefined;

    points.push({
      index: i,
      distanceKm,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lon.toFixed(5)),
      elevation: Number(elev.toFixed(1)),
      freeAir: faa !== undefined ? Number(faa.toFixed(2)) : undefined,
      bouguer: bg !== undefined ? Number(bg.toFixed(2)) : undefined,
      residual: residual !== undefined ? Number(residual.toFixed(2)) : undefined,
      regional: regional !== undefined ? Number(regional.toFixed(2)) : undefined,
    });
  }

  return points;
}

/**
 * Exports profile cross-section data as CSV for GM-SYS or spreadsheet analysis.
 */
export function exportProfileToCsv(points: ProfilePoint[], filename = 'topex_cross_section_profile.csv'): void {
  if (points.length === 0) return;

  const headers = ['Index', 'Distance_km', 'Latitude', 'Longitude', 'Topography_m', 'FreeAir_mGal', 'Bouguer_mGal', 'Residual_mGal', 'Regional_mGal'];
  const rows = points.map((p) => [
    p.index,
    p.distanceKm,
    p.latitude,
    p.longitude,
    p.elevation,
    p.freeAir ?? '',
    p.bouguer ?? '',
    p.residual ?? '',
    p.regional ?? '',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
