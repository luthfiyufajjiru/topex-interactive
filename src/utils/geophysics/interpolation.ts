import type { ProcessedRecord, BoundingBox, InterpolationMethod } from '@/types';
import { getInterpolatedColor, ColormapName } from './colormaps';

export interface RegularGrid2D {
  lats: number[];
  lons: number[];
  nrows: number;
  ncols: number;
  data: Float32Array;
  minVal: number;
  maxVal: number;
}

/**
 * Builds a structured 2D matrix from irregular or regular sounding records.
 */
export function buildRegularGrid(
  records: ProcessedRecord[],
  _bounds: BoundingBox,
  getValue: (r: ProcessedRecord) => number | undefined
): RegularGrid2D | null {
  if (records.length === 0) return null;

  // Extract unique sorted latitudes (descending north-to-south) and longitudes (ascending west-to-east)
  const lats = Array.from(new Set(records.map((r) => Number(r.latitude.toFixed(4))))).sort((a, b) => b - a);
  const lons = Array.from(new Set(records.map((r) => Number(r.longitude.toFixed(4))))).sort((a, b) => a - b);

  const nrows = lats.length;
  const ncols = lons.length;
  if (nrows === 0 || ncols === 0) return null;

  const data = new Float32Array(nrows * ncols);
  data.fill(NaN);

  // Map lookup
  const latIndexMap = new Map<number, number>();
  lats.forEach((lat, i) => latIndexMap.set(lat, i));

  const lonIndexMap = new Map<number, number>();
  lons.forEach((lon, j) => lonIndexMap.set(lon, j));

  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const val = getValue(r);
    if (val === undefined || isNaN(val)) continue;

    const latKey = Number(r.latitude.toFixed(4));
    const lonKey = Number(r.longitude.toFixed(4));

    const row = latIndexMap.get(latKey);
    const col = lonIndexMap.get(lonKey);

    if (row !== undefined && col !== undefined) {
      data[row * ncols + col] = val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
  }

  // Fill sparse missing cells with nearest neighbor
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const idx = r * ncols + c;
      if (isNaN(data[idx])) {
        // Find nearest valid neighbor in adjacent cells
        let found = false;
        for (let radius = 1; radius <= 3 && !found; radius++) {
          for (let dr = -radius; dr <= radius && !found; dr++) {
            for (let dc = -radius; dc <= radius && !found; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < nrows && nc >= 0 && nc < ncols) {
                const nval = data[nr * ncols + nc];
                if (!isNaN(nval)) {
                  data[idx] = nval;
                  found = true;
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    lats,
    lons,
    nrows,
    ncols,
    data,
    minVal: minVal === Infinity ? -100 : minVal,
    maxVal: maxVal === -Infinity ? 100 : maxVal,
  };
}

// 1D Cubic Hermite / Catmull-Rom spline kernel
function cubicHermite(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  const d = p1;
  return a * t * t * t + b * t * t + c * t + d;
}

// 1D Thin Plate Spline / Minimum Curvature approximation kernel
function thinPlateSpline(p0: number, p1: number, p2: number, p3: number, t: number): number {
  // Enhanced harmonic tension spline (Oasis Montaj style)
  const tension = 0.25;
  const m0 = (p2 - p0) * 0.5 * (1 - tension);
  const m1 = (p3 - p1) * 0.5 * (1 - tension);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p1 + h10 * m0 + h01 * p2 + h11 * m1;
}

function getGridVal(grid: RegularGrid2D, row: number, col: number): number {
  const rClamped = Math.max(0, Math.min(grid.nrows - 1, row));
  const cClamped = Math.max(0, Math.min(grid.ncols - 1, col));
  const val = grid.data[rClamped * grid.ncols + cClamped];
  return isNaN(val) ? 0 : val;
}

/**
 * Evaluates the interpolated grid value at fractional normalized coordinates (u in [0,1], v in [0,1]).
 */
export function sampleInterpolatedValue(
  grid: RegularGrid2D,
  u: number, // 0 = West, 1 = East
  v: number, // 0 = North, 1 = South
  method: InterpolationMethod
): number {
  const x = u * (grid.ncols - 1);
  const y = v * (grid.nrows - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;

  switch (method) {
    case 'nearest': {
      const rx = Math.round(x);
      const ry = Math.round(y);
      return getGridVal(grid, ry, rx);
    }

    case 'bilinear': {
      const v00 = getGridVal(grid, y0, x0);
      const v10 = getGridVal(grid, y0, x0 + 1);
      const v01 = getGridVal(grid, y0 + 1, x0);
      const v11 = getGridVal(grid, y0 + 1, x0 + 1);

      const top = v00 + tx * (v10 - v00);
      const bottom = v01 + tx * (v11 - v01);
      return top + ty * (bottom - top);
    }

    case 'bicubic': {
      // 4x4 neighborhood bicubic spline (Catmull-Rom)
      const colArr: number[] = new Array(4);
      for (let j = -1; j <= 2; j++) {
        const p0 = getGridVal(grid, y0 + j, x0 - 1);
        const p1 = getGridVal(grid, y0 + j, x0);
        const p2 = getGridVal(grid, y0 + j, x0 + 1);
        const p3 = getGridVal(grid, y0 + j, x0 + 2);
        colArr[j + 1] = cubicHermite(p0, p1, p2, p3, tx);
      }
      return cubicHermite(colArr[0], colArr[1], colArr[2], colArr[3], ty);
    }

    case 'spline': {
      // Thin Plate Spline / Minimum Curvature harmonic surface
      const colArr: number[] = new Array(4);
      for (let j = -1; j <= 2; j++) {
        const p0 = getGridVal(grid, y0 + j, x0 - 1);
        const p1 = getGridVal(grid, y0 + j, x0);
        const p2 = getGridVal(grid, y0 + j, x0 + 1);
        const p3 = getGridVal(grid, y0 + j, x0 + 2);
        colArr[j + 1] = thinPlateSpline(p0, p1, p2, p3, tx);
      }
      return thinPlateSpline(colArr[0], colArr[1], colArr[2], colArr[3], ty);
    }

    case 'idw': {
      // 4x4 Inverse Distance Weighting
      let weightSum = 0;
      let valSum = 0;
      const power = 2;

      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const rx = x0 + dx;
          const ry = y0 + dy;
          const val = getGridVal(grid, ry, rx);
          const distSq = (x - rx) ** 2 + (y - ry) ** 2;

          if (distSq < 1e-6) return val;

          const w = 1 / Math.pow(distSq, power / 2);
          weightSum += w;
          valSum += val * w;
        }
      }
      return weightSum > 0 ? valSum / weightSum : getGridVal(grid, y0, x0);
    }

    default:
      return getGridVal(grid, Math.round(y), Math.round(x));
  }
}

/**
 * Renders a full interpolated raster onto an HTML5 2D Canvas context with 60 FPS performance.
 */
export function renderInterpolatedRasterToCanvas(
  canvas: HTMLCanvasElement,
  grid: RegularGrid2D,
  colormap: ColormapName,
  method: InterpolationMethod,
  customMin?: number,
  customMax?: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.createImageData(width, height);
  const pixels = imgData.data;

  const min = customMin !== undefined ? customMin : grid.minVal;
  const max = customMax !== undefined ? customMax : grid.maxVal;

  for (let py = 0; py < height; py++) {
    const v = py / (height - 1); // 0 at North, 1 at South
    const rowOffset = py * width * 4;

    for (let px = 0; px < width; px++) {
      const u = px / (width - 1); // 0 at West, 1 at East

      const val = sampleInterpolatedValue(grid, u, v, method);
      const [r, g, b, a] = getInterpolatedColor(val, min, max, colormap);

      const idx = rowOffset + px * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
