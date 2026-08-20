import type { BoundingBox } from '@/types';

export type BasemapType = 'google-hybrid' | 'google-sat' | 'esri-ocean' | 'none';

function lon2tile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function getTileUrl(type: BasemapType, x: number, y: number, z: number): string {
  if (type === 'google-hybrid') {
    return `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
  }
  if (type === 'google-sat') {
    return `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
  }
  if (type === 'esri-ocean') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/${z}/${y}/${x}`;
  }
  return '';
}

function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    img.src = url;
  });
}

/**
 * Renders basemap tiles covering the given BoundingBox onto a target Canvas context.
 */
export async function renderBasemapToCanvas(
  ctx: CanvasRenderingContext2D,
  bounds: BoundingBox,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number,
  basemapType: BasemapType
): Promise<void> {
  if (basemapType === 'none') return;

  const lonSpan = Math.abs(bounds.east - bounds.west) || 1;
  const latSpan = Math.abs(bounds.north - bounds.south) || 1;

  // Compute optimal zoom level based on destination pixel size
  let zoom = Math.round(Math.log2((360 / lonSpan) * (destWidth / 256)));
  zoom = Math.max(2, Math.min(18, zoom));

  const minTileX = Math.floor(lon2tile(bounds.west, zoom));
  const maxTileX = Math.floor(lon2tile(bounds.east, zoom));
  const minTileY = Math.floor(lat2tile(bounds.north, zoom));
  const maxTileY = Math.floor(lat2tile(bounds.south, zoom));

  const tilePromises: Promise<{ img: HTMLImageElement; x: number; y: number }>[] = [];

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const url = getTileUrl(basemapType, tx, ty, zoom);
      if (!url) continue;

      tilePromises.push(
        loadTileImage(url)
          .then((img) => ({ img, x: tx, y: ty }))
          .catch(() => ({ img: null as any, x: tx, y: ty }))
      );
    }
  }

  const loadedTiles = await Promise.all(tilePromises);

  ctx.save();
  ctx.beginPath();
  ctx.rect(destX, destY, destWidth, destHeight);
  ctx.clip();

  for (const { img, x, y } of loadedTiles) {
    if (!img) continue;

    const tWest = tile2lon(x, zoom);
    const tEast = tile2lon(x + 1, zoom);
    const tNorth = tile2lat(y, zoom);
    const tSouth = tile2lat(y + 1, zoom);

    const px = destX + ((tWest - bounds.west) / lonSpan) * destWidth;
    const py = destY + ((bounds.north - tNorth) / latSpan) * destHeight;
    const pw = ((tEast - tWest) / lonSpan) * destWidth;
    const ph = ((tNorth - tSouth) / latSpan) * destHeight;

    ctx.drawImage(img, px, py, pw + 0.5, ph + 0.5);
  }

  ctx.restore();
}
