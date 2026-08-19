import type { ProcessedRecord, BoundingBox } from '@/types';
import { getInterpolatedColor, ColormapName } from '@/utils/geophysics/colormaps';

export interface MapExportOptions {
  title: string;
  variable: 'topography' | 'freeAir' | 'bouguer';
  unit: string;
  colormap: ColormapName;
  bounds: BoundingBox;
  records: ProcessedRecord[];
}

export function exportMapToPng(options: MapExportOptions, filename = 'topex_map.png'): void {
  const { title, variable, unit, colormap, bounds, records } = options;

  if (records.length === 0) return;

  const canvas = document.createElement('canvas');
  const width = 1200;
  const height = 900;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Map Area Margins
  const margin = { top: 90, right: 180, bottom: 90, left: 100 };
  const mapWidth = width - margin.left - margin.right;
  const mapHeight = height - margin.top - margin.bottom;

  // Extract min/max for the chosen variable
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const val = variable === 'bouguer' ? r.bouguer : variable === 'freeAir' ? r.gravity : r.elevation;
    if (val !== undefined && !isNaN(val)) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  if (min === Infinity) {
    min = -100;
    max = 100;
  }

  // Draw Map Grid Pixels
  const lonRange = bounds.east - bounds.west || 1;
  const latRange = bounds.north - bounds.south || 1;

  // Estimate grid step size
  const stepX = Math.max(2, mapWidth / 120);
  const stepY = Math.max(2, mapHeight / 120);

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const val = variable === 'bouguer' ? r.bouguer : variable === 'freeAir' ? r.gravity : r.elevation;
    if (val === undefined || isNaN(val)) continue;

    const xNorm = (r.longitude - bounds.west) / lonRange;
    const yNorm = (bounds.north - r.latitude) / latRange;

    const px = margin.left + xNorm * mapWidth;
    const py = margin.top + yNorm * mapHeight;

    const [red, green, blue] = getInterpolatedColor(val, min, max, colormap);
    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    ctx.fillRect(px - stepX / 2, py - stepY / 2, stepX + 1, stepY + 1);
  }

  // Neatline / Map Border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin.left, margin.top, mapWidth, mapHeight);

  // Grid Coordinate Labels
  ctx.fillStyle = '#334155';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  // Top/Bottom Lon ticks
  const numXTicks = 4;
  for (let i = 0; i <= numXTicks; i++) {
    const lonVal = bounds.west + (lonRange / numXTicks) * i;
    const px = margin.left + (mapWidth / numXTicks) * i;

    ctx.fillText(`${lonVal.toFixed(2)}°`, px, margin.top - 10);
    ctx.fillText(`${lonVal.toFixed(2)}°`, px, margin.top + mapHeight + 20);

    // Ticks
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top - 5);
    ctx.moveTo(px, margin.top + mapHeight);
    ctx.lineTo(px, margin.top + mapHeight + 5);
    ctx.stroke();
  }

  // Left/Right Lat ticks
  ctx.textAlign = 'right';
  const numYTicks = 4;
  for (let i = 0; i <= numYTicks; i++) {
    const latVal = bounds.north - (latRange / numYTicks) * i;
    const py = margin.top + (mapHeight / numYTicks) * i;

    ctx.fillText(`${latVal.toFixed(2)}°`, margin.left - 10, py + 4);

    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left - 5, py);
    ctx.moveTo(margin.left + mapWidth, py);
    ctx.lineTo(margin.left + mapWidth + 5, py);
    ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, margin.left, 45);

  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(
    `TOPEX/Poseidon & SIO/UCSD Altimetry Model • Extracted: ${new Date().toLocaleDateString()}`,
    margin.left,
    68
  );

  // Vertical Colorbar on the Right
  const cbX = width - 110;
  const cbY = margin.top + 20;
  const cbW = 22;
  const cbH = mapHeight - 40;

  // Draw gradient bar
  const grad = ctx.createLinearGradient(0, cbY + cbH, 0, cbY);
  for (let step = 0; step <= 10; step++) {
    const frac = step / 10;
    const sampleVal = min + (max - min) * frac;
    const [r, g, b] = getInterpolatedColor(sampleVal, min, max, colormap);
    grad.addColorStop(frac, `rgb(${r}, ${g}, ${b})`);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(cbX, cbY, cbW, cbH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(cbX, cbY, cbW, cbH);

  // Colorbar Title & Units
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(unit, cbX - 4, cbY - 10);

  // Colorbar tick labels
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';

  ctx.fillText(`${max.toFixed(1)}`, cbX + cbW + 8, cbY + 6);
  ctx.fillText(`${((min + max) / 2).toFixed(1)}`, cbX + cbW + 8, cbY + cbH / 2 + 4);
  ctx.fillText(`${min.toFixed(1)}`, cbX + cbW + 8, cbY + cbH + 2);

  // Footer Attribution
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Data source: Scripps Institution of Oceanography, UC San Diego • Generated with Topex Interactive Downloader',
    width / 2,
    height - 25
  );

  // Download Trigger
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
