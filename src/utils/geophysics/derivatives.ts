import type { RegularGrid2D, BoundingBox } from '@/types';

export interface DerivativeGridsResult {
  fhd: RegularGrid2D; // First Horizontal Derivative (mGal/km)
  svd: RegularGrid2D; // Second Vertical Derivative (mGal/km2)
  tdr: RegularGrid2D; // Tilt Derivative / Tilt Angle (degrees: -90 to +90)
}

/**
 * Computes structural potential-field derivatives for fault, edge, and lineament detection:
 *
 * 1. FHD (Total Horizontal Derivative):
 *    FHD = sqrt( (dg/dx)^2 + (dg/dy)^2 )  [mGal/km]
 *    -> Sharp maximum ridges directly over fault traces and geologic contacts.
 *
 * 2. SVD (Second Vertical Derivative via Laplace's Equation):
 *    d2g/dz2 = -(d2g/dx2 + d2g/dy2)       [mGal/km2]
 *    -> Zero-crossing contour (SVD = 0) delineates lateral contact boundaries.
 *
 * 3. TDR (Tilt Derivative / Tilt Angle):
 *    theta = arctan( FVD / FHD )           [-90 deg to +90 deg]
 *    -> Normalizes dynamic range so subtle and deep faults are equally crisp.
 */
export function computePotentialFieldDerivatives(
  grid: RegularGrid2D,
  bounds: BoundingBox
): DerivativeGridsResult {
  const { lats, lons, nrows, ncols, data } = grid;
  const totalCells = nrows * ncols;

  const dataFhd = new Float32Array(totalCells).fill(0);
  const dataSvd = new Float32Array(totalCells).fill(0);
  const dataTdr = new Float32Array(totalCells).fill(0);

  if (nrows < 3 || ncols < 3) {
    return {
      fhd: { lats, lons, nrows, ncols, data: dataFhd, minVal: 0, maxVal: 1 },
      svd: { lats, lons, nrows, ncols, data: dataSvd, minVal: -1, maxVal: 1 },
      tdr: { lats, lons, nrows, ncols, data: dataTdr, minVal: -90, maxVal: 90 },
    };
  }

  const midLat = (bounds.north + bounds.south) / 2;
  const latSpan = Math.abs(bounds.north - bounds.south) || 1;
  const lonSpan = Math.abs(bounds.east - bounds.west) || 1;

  // Metric grid cell size in kilometers
  const kmPerDegLat = 111.13295;
  const kmPerDegLon = 111.41284 * Math.cos((midLat * Math.PI) / 180);

  const dy = Math.max(0.1, (latSpan * kmPerDegLat) / (nrows - 1));
  const dx = Math.max(0.1, (lonSpan * kmPerDegLon) / (ncols - 1));

  const twoDx = 2 * dx;
  const twoDy = 2 * dy;
  const dxSq = dx * dx;
  const dySq = dy * dy;

  let minFhd = Infinity, maxFhd = -Infinity;
  let minSvd = Infinity, maxSvd = -Infinity;
  let minTdr = Infinity, maxTdr = -Infinity;

  const getVal = (r: number, c: number): number => {
    const rc = Math.max(0, Math.min(nrows - 1, r));
    const cc = Math.max(0, Math.min(ncols - 1, c));
    const v = data[rc * ncols + cc];
    return isNaN(v) ? 0 : v;
  };

  for (let r = 0; r < nrows; r++) {
    const rowOffset = r * ncols;
    for (let c = 0; c < ncols; c++) {
      const idx = rowOffset + c;
      const v = getVal(r, c);

      // First horizontal derivatives: Central difference (mGal/km)
      const gx = (getVal(r, c + 1) - getVal(r, c - 1)) / twoDx;
      // In grid coordinates, row 0 is North and row (nrows-1) is South
      const gy = (getVal(r - 1, c) - getVal(r + 1, c)) / twoDy;

      // 1. Total Horizontal Derivative (FHD >= 0)
      const fhdVal = Math.sqrt(gx * gx + gy * gy);
      dataFhd[idx] = fhdVal;
      if (fhdVal < minFhd) minFhd = fhdVal;
      if (fhdVal > maxFhd) maxFhd = fhdVal;

      // Second horizontal derivatives (mGal/km2)
      const gxx = (getVal(r, c + 1) - 2 * v + getVal(r, c - 1)) / dxSq;
      const gyy = (getVal(r + 1, c) - 2 * v + getVal(r - 1, c)) / dySq;

      // 2. Second Vertical Derivative (SVD via Laplace's Equation)
      // d2g/dz2 = -(gxx + gyy)
      const svdVal = -(gxx + gyy);
      dataSvd[idx] = svdVal;
      if (svdVal < minSvd) minSvd = svdVal;
      if (svdVal > maxSvd) maxSvd = svdVal;

      // 3. First Vertical Derivative (FVD) & Tilt Angle Derivative (TDR)
      // FVD approximated from vertical curvature rate: FVD ~ sqrt(|SVD * v|) * sign(v)
      const fvdApprox = svdVal >= 0 ? Math.sqrt(Math.max(0, svdVal * 0.5)) : -Math.sqrt(Math.max(0, -svdVal * 0.5));
      const tdrVal = Math.atan2(fvdApprox, Math.max(0.01, fhdVal)) * (180 / Math.PI);
      dataTdr[idx] = tdrVal;
      if (tdrVal < minTdr) minTdr = tdrVal;
      if (tdrVal > maxTdr) maxTdr = tdrVal;
    }
  }

  return {
    fhd: {
      lats,
      lons,
      nrows,
      ncols,
      data: dataFhd,
      minVal: minFhd === Infinity ? 0 : Number(minFhd.toFixed(3)),
      maxVal: maxFhd === -Infinity ? 10 : Number(maxFhd.toFixed(3)),
    },
    svd: {
      lats,
      lons,
      nrows,
      ncols,
      data: dataSvd,
      minVal: minSvd === Infinity ? -5 : Number(minSvd.toFixed(4)),
      maxVal: maxSvd === -Infinity ? 5 : Number(maxSvd.toFixed(4)),
    },
    tdr: {
      lats,
      lons,
      nrows,
      ncols,
      data: dataTdr,
      minVal: minTdr === Infinity ? -90 : Number(minTdr.toFixed(1)),
      maxVal: maxTdr === -Infinity ? 90 : Number(maxTdr.toFixed(1)),
    },
  };
}
