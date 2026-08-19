import type { ProcessedRecord, BoundingBox, InterpolationMethod, NamedProfileLine } from '@/types';
import { getInterpolatedColor, ColormapName } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, sampleInterpolatedValue } from '@/utils/geophysics/interpolation';

export interface MapExportOptions {
  title: string;
  variable: 'topography' | 'freeAir' | 'bouguer';
  unit: string;
  colormap: ColormapName;
  interpolationMethod?: InterpolationMethod;
  bounds: BoundingBox;
  records: ProcessedRecord[];
  activeLine?: NamedProfileLine;
}

export function exportMapToPng(options: MapExportOptions, filename = 'topex_map.png'): void {
  const { title, variable, unit, colormap, interpolationMethod = 'bicubic', bounds, records, activeLine } = options;

  if (records.length === 0) return;

  const canvas = document.createElement('canvas');
  const width = 1400;
  const height = 1000;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Map Area Margins
  const margin = { top: 100, right: 200, bottom: 100, left: 110 };
  const mapWidth = width - margin.left - margin.right;
  const mapHeight = height - margin.top - margin.bottom;

  // Build regular grid for smooth interpolation
  const getValue = (r: ProcessedRecord) =>
    variable === 'bouguer' ? r.bouguer : variable === 'freeAir' ? r.gravity : r.elevation;

  const grid = buildRegularGrid(records, bounds, getValue);
  if (!grid) return;

  const min = grid.minVal;
  const max = grid.maxVal;

  // Render high-res interpolated pixels
  const mapImgData = ctx.createImageData(mapWidth, mapHeight);
  const pixels = mapImgData.data;

  for (let py = 0; py < mapHeight; py++) {
    const v = py / (mapHeight - 1);
    const rowOffset = py * mapWidth * 4;

    for (let px = 0; px < mapWidth; px++) {
      const u = px / (mapWidth - 1);
      const val = sampleInterpolatedValue(grid, u, v, interpolationMethod);
      const [r, g, b, a] = getInterpolatedColor(val, min, max, colormap);

      const idx = rowOffset + px * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }

  ctx.putImageData(mapImgData, margin.left, margin.top);

  const lonRange = bounds.east - bounds.west || 1;
  const latRange = bounds.north - bounds.south || 1;

  // Draw active transect line if provided
  if (activeLine) {
    const xA = margin.left + ((activeLine.start.lon - bounds.west) / lonRange) * mapWidth;
    const yA = margin.top + ((bounds.north - activeLine.start.lat) / latRange) * mapHeight;
    const xB = margin.left + ((activeLine.end.lon - bounds.west) / lonRange) * mapWidth;
    const yB = margin.top + ((bounds.north - activeLine.end.lat) / latRange) * mapHeight;

    ctx.save();
    // Shadow line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();

    // Main line
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoint A
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(xA, yA, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(activeLine.labelStart, xA - 16, yA - 6);

    // Endpoint A'
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(xB, yB, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.fillText(activeLine.labelEnd, xB + 8, yB - 6);

    ctx.restore();
  }

  // Neatline / Map Border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin.left, margin.top, mapWidth, mapHeight);

  // Grid Coordinate Labels
  ctx.fillStyle = '#334155';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  // Top/Bottom Lon ticks
  const numXTicks = 5;
  for (let i = 0; i <= numXTicks; i++) {
    const lonVal = bounds.west + (lonRange / numXTicks) * i;
    const px = margin.left + (mapWidth / numXTicks) * i;

    ctx.fillText(`${lonVal.toFixed(2)}°`, px, margin.top - 12);
    ctx.fillText(`${lonVal.toFixed(2)}°`, px, margin.top + mapHeight + 24);

    // Ticks
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top - 6);
    ctx.moveTo(px, margin.top + mapHeight);
    ctx.lineTo(px, margin.top + mapHeight + 6);
    ctx.stroke();
  }

  // Left/Right Lat ticks
  ctx.textAlign = 'right';
  const numYTicks = 5;
  for (let i = 0; i <= numYTicks; i++) {
    const latVal = bounds.north - (latRange / numYTicks) * i;
    const py = margin.top + (mapHeight / numYTicks) * i;

    ctx.fillText(`${latVal.toFixed(2)}°`, margin.left - 12, py + 4);

    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left - 6, py);
    ctx.moveTo(margin.left + mapWidth, py);
    ctx.lineTo(margin.left + mapWidth + 6, py);
    ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, margin.left, 46);

  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(
    `TOPEX/Poseidon & SIO/UCSD Satellite Altimetry Model • Filter: ${interpolationMethod.toUpperCase()} • Extracted: ${new Date().toLocaleDateString()}`,
    margin.left,
    74
  );

  // Vertical Colorbar on the Right
  const cbX = width - 130;
  const cbY = margin.top + 30;
  const cbW = 26;
  const cbH = mapHeight - 60;

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
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cbX, cbY, cbW, cbH);

  // Colorbar Title & Units
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(unit, cbX - 4, cbY - 12);

  // Colorbar tick labels
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';

  ctx.fillText(`${max.toFixed(1)}`, cbX + cbW + 10, cbY + 6);
  ctx.fillText(`${((min + max) / 2).toFixed(1)}`, cbX + cbW + 10, cbY + cbH / 2 + 4);
  ctx.fillText(`${min.toFixed(1)}`, cbX + cbW + 10, cbY + cbH + 2);

  // Prominent Attribution Footer with Site URL
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Data source: Scripps Institution of Oceanography, UC San Diego (SIO/UCSD) • Sandwell & Smith Satellite Altimetry Model',
    width / 2,
    height - 42
  );

  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(
    'Generated with TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
    width / 2,
    height - 22
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
