import type { ProcessedRecord, BoundingBox, BouguerParams, NamedProfileLine, ProfilePoint, InterpolationMethod } from '@/types';
import { getInterpolatedColor } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, sampleInterpolatedValue } from '@/utils/geophysics/interpolation';

export interface CompositeReportOptions {
  records: ProcessedRecord[];
  bounds: BoundingBox;
  params: BouguerParams;
  lines: NamedProfileLine[];
  activeLine: NamedProfileLine;
  profilePoints: ProfilePoint[];
  activePoint?: ProfilePoint | null;
  interpolationMethod: InterpolationMethod;
  filename?: string;
}

/**
 * Generates and downloads a single high-resolution composite geophysical report image (.PNG)
 * combining all 3 maps, the 2D cross-section profile, picked correlation markers, and survey metadata.
 */
export function exportCompositeReportImage(options: CompositeReportOptions): void {
  const {
    records,
    bounds,
    params,
    activeLine,
    profilePoints,
    activePoint,
    interpolationMethod,
    filename = `topex_geophysical_report_suite_${new Date().toISOString().slice(0, 10)}.png`,
  } = options;

  if (records.length === 0 || profilePoints.length === 0) return;

  const canvas = document.createElement('canvas');
  const W = 2400;
  const H = 1750;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Outer Neatline Frame
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // ==========================================
  // 1. Header Banner
  // ==========================================
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(24, 24, W - 48, 110);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TOPEX SATELLITE GRAVITY & GEOPHYSICAL SUITE REPORT', 65, 72);

  ctx.font = '16px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `Boundaries: [N: ${bounds.north.toFixed(4)}°, S: ${bounds.south.toFixed(4)}°, W: ${bounds.west.toFixed(4)}°, E: ${bounds.east.toFixed(4)}°] • Points: ${records.length.toLocaleString()} • Filter: ${interpolationMethod.toUpperCase()}`,
    65,
    106
  );

  ctx.textAlign = 'right';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('https://topex-interactive.yufajjiru.work', W - 65, 72);
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Scripps Institution of Oceanography (SIO/UCSD)', W - 65, 100);

  // ==========================================
  // 2. Three Side-by-Side Geophysical Maps
  // ==========================================
  const gridTopo = buildRegularGrid(records, bounds, (r) => r.elevation);
  const gridFaa = buildRegularGrid(records, bounds, (r) => r.gravity);
  const gridBg = buildRegularGrid(records, bounds, (r) => r.bouguer);

  const mapW = 690;
  const mapH = 460;
  const mapY = 175;
  const startX = 65;
  const gapX = 80;

  const mapConfigs = [
    { title: 'Topography / Bathymetry', unit: 'm', grid: gridTopo, colormap: 'gebco' as const, x: startX },
    { title: 'Free-Air Gravity Anomaly', unit: 'mGal', grid: gridFaa, colormap: 'coolwarm' as const, x: startX + mapW + gapX },
    { title: 'Complete Bouguer Anomaly', unit: 'mGal', grid: gridBg, colormap: 'viridis' as const, x: startX + (mapW + gapX) * 2 },
  ];

  const lonRange = bounds.east - bounds.west || 1;
  const latRange = bounds.north - bounds.south || 1;

  for (const mCfg of mapConfigs) {
    if (!mCfg.grid) continue;

    // Raster generation
    const imgData = ctx.createImageData(mapW, mapH);
    const pix = imgData.data;

    for (let py = 0; py < mapH; py++) {
      const v = py / (mapH - 1);
      const rowOff = py * mapW * 4;
      for (let px = 0; px < mapW; px++) {
        const u = px / (mapW - 1);
        const val = sampleInterpolatedValue(mCfg.grid, u, v, interpolationMethod);
        const [r, g, b, a] = getInterpolatedColor(val, mCfg.grid.minVal, mCfg.grid.maxVal, mCfg.colormap);
        const idx = rowOff + px * 4;
        pix[idx] = r;
        pix[idx + 1] = g;
        pix[idx + 2] = b;
        pix[idx + 3] = a;
      }
    }
    ctx.putImageData(imgData, mCfg.x, mapY);

    // Draw Transect Line A -> A'
    const xA = mCfg.x + ((activeLine.start.lon - bounds.west) / lonRange) * mapW;
    const yA = mapY + ((bounds.north - activeLine.start.lat) / latRange) * mapH;
    const xB = mCfg.x + ((activeLine.end.lon - bounds.west) / lonRange) * mapW;
    const yB = mapY + ((bounds.north - activeLine.end.lat) / latRange) * mapH;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoints
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(xA, yA, 7, 0, Math.PI * 2);
    ctx.arc(xB, yB, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(activeLine.labelStart, xA - 16, yA - 6);
    ctx.fillText(activeLine.labelEnd, xB + 8, yB - 6);
    ctx.restore();

    // Map Border
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(mCfg.x, mapY, mapW, mapH);

    // Map Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mCfg.title, mCfg.x, mapY - 12);

    // Horizontal Colorbar
    const cbY = mapY + mapH + 12;
    const cbH = 14;
    const grad = ctx.createLinearGradient(mCfg.x, 0, mCfg.x + mapW, 0);
    for (let s = 0; s <= 10; s++) {
      const frac = s / 10;
      const sVal = mCfg.grid.minVal + (mCfg.grid.maxVal - mCfg.grid.minVal) * frac;
      const [r, g, b] = getInterpolatedColor(sVal, mCfg.grid.minVal, mCfg.grid.maxVal, mCfg.colormap);
      grad.addColorStop(frac, `rgb(${r}, ${g}, ${b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(mCfg.x, cbY, mapW, cbH);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(mCfg.x, cbY, mapW, cbH);

    ctx.fillStyle = '#475569';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${mCfg.grid.minVal.toFixed(1)} ${mCfg.unit}`, mCfg.x, cbY + cbH + 16);
    ctx.textAlign = 'right';
    ctx.fillText(`${mCfg.grid.maxVal.toFixed(1)} ${mCfg.unit}`, mCfg.x + mapW, cbY + cbH + 16);
  }

  // ==========================================
  // 3. 2D Cross-Section Profile Graph
  // ==========================================
  const profX = 110;
  const profY = 730;
  const profW = W - profX - 110;
  const profH = 700;
  const splitProfY = profY + 330;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `2D Geophysical Cross-Section Profile: ${activeLine.name} (${activeLine.labelStart} → ${activeLine.labelEnd})`,
    profX,
    profY - 14
  );

  const totalDist = profilePoints[profilePoints.length - 1].distanceKm;

  // Elevation min/max
  let minElev = 0, maxElev = 0;
  for (const p of profilePoints) {
    if (p.elevation < minElev) minElev = p.elevation;
    if (p.elevation > maxElev) maxElev = p.elevation;
  }
  minElev = Math.floor(minElev - 200);
  maxElev = Math.ceil(maxElev + 200);

  // Gravity min/max
  let minGrav = 0, maxGrav = 0;
  for (const p of profilePoints) {
    if (p.freeAir !== undefined) {
      if (p.freeAir < minGrav) minGrav = p.freeAir;
      if (p.freeAir > maxGrav) maxGrav = p.freeAir;
    }
    if (p.bouguer !== undefined) {
      if (p.bouguer < minGrav) minGrav = p.bouguer;
      if (p.bouguer > maxGrav) maxGrav = p.bouguer;
    }
  }
  minGrav = Math.floor(minGrav - 20);
  maxGrav = Math.ceil(maxGrav + 20);

  const gravH = splitProfY - profY;
  const topoH = profH - gravH - 50;
  const topoY = splitProfY + 50;

  const scaleX = (d: number) => profX + (d / (totalDist || 1)) * profW;
  const scaleYGrav = (v: number) => profY + gravH - ((v - minGrav) / ((maxGrav - minGrav) || 1)) * gravH;
  const scaleYTopo = (v: number) => topoY + topoH - ((v - minElev) / ((maxElev - minElev) || 1)) * topoH;

  // Background sub-chart boxes
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(profX, profY, profW, gravH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(profX, profY, profW, gravH);

  ctx.fillRect(profX, topoY, profW, topoH);
  ctx.strokeRect(profX, topoY, profW, topoH);

  // Zero gravity line
  if (minGrav <= 0 && maxGrav >= 0) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(profX, scaleYGrav(0));
    ctx.lineTo(profX + profW, scaleYGrav(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Sea level 0m line
  const zeroElevY = Math.max(topoY, Math.min(topoY + topoH, scaleYTopo(0)));
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(profX, zeroElevY);
  ctx.lineTo(profX + profW, zeroElevY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('0 m MSL (Sea Level)', profX + profW - 10, zeroElevY - 6);

  // Topo Crust Fill
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleYTopo(profilePoints[0].elevation));
  for (let i = 1; i < profilePoints.length; i++) {
    ctx.lineTo(scaleX(profilePoints[i].distanceKm), scaleYTopo(profilePoints[i].elevation));
  }
  ctx.lineTo(profX + profW, topoY + topoH);
  ctx.lineTo(profX, topoY + topoH);
  ctx.closePath();
  ctx.fill();

  // Topo Line
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleYTopo(profilePoints[0].elevation));
  for (let i = 1; i < profilePoints.length; i++) {
    ctx.lineTo(scaleX(profilePoints[i].distanceKm), scaleYTopo(profilePoints[i].elevation));
  }
  ctx.stroke();

  // Gravity FAA & CBA Curves
  // FAA
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  let startedFaa = false;
  for (const p of profilePoints) {
    if (p.freeAir !== undefined) {
      const x = scaleX(p.distanceKm);
      const y = scaleYGrav(p.freeAir);
      if (!startedFaa) {
        ctx.moveTo(x, y);
        startedFaa = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();

  // CBA
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  let startedBg = false;
  for (const p of profilePoints) {
    if (p.bouguer !== undefined) {
      const x = scaleX(p.distanceKm);
      const y = scaleYGrav(p.bouguer);
      if (!startedBg) {
        ctx.moveTo(x, y);
        startedBg = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();

  // Picked Correlation Line & Floating Value Badges
  const targetPick = activePoint || profilePoints[Math.floor(profilePoints.length / 2)];
  if (targetPick) {
    const posX = scaleX(targetPick.distanceKm);
    const isRight = posX > profX + profW * 0.75;
    const offX = isRight ? -115 : 14;

    // Full vertical dashed line
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(posX, profY);
    ctx.lineTo(posX, topoY + topoH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Topo anchor & tag
    const yT = scaleYTopo(targetPick.elevation);
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(posX, yT, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(posX + offX, yT - 14, 105, 28);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(posX + offX, yT - 14, 105, 28);
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.elevation.toFixed(1)} m`, posX + offX + 52, yT + 5);

    // FAA anchor & tag
    if (targetPick.freeAir !== undefined) {
      const yF = scaleYGrav(targetPick.freeAir);
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(posX, yF, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#f0f9ff';
      ctx.fillRect(posX + offX, yF - 14, 115, 28);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + offX, yF - 14, 115, 28);
      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.freeAir.toFixed(1)} mGal`, posX + offX + 57, yF + 5);
    }

    // CBA anchor & tag
    if (targetPick.bouguer !== undefined) {
      const yB = scaleYGrav(targetPick.bouguer);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(posX, yB, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(posX + offX, yB - 14, 115, 28);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + offX, yB - 14, 115, 28);
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.bouguer.toFixed(1)} mGal`, posX + offX + 57, yB + 5);
    }

    // Distance tag
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(posX - 50, topoY + topoH + 6, 100, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.distanceKm.toFixed(1)} km`, posX, topoY + topoH + 24);
  }

  // Axis Labels & Y Titles
  ctx.fillStyle = '#334155';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${maxGrav}`, profX - 12, profY + 14);
  ctx.fillText(`${minGrav}`, profX - 12, profY + gravH);
  ctx.fillText(`${maxElev} m`, profX - 12, topoY + 14);
  ctx.fillText(`${minElev} m`, profX - 12, topoY + topoH);

  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';

  ctx.save();
  ctx.translate(profX - 55, profY + gravH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Gravity (mGal)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(profX - 55, topoY + topoH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (m)', 0, 0);
  ctx.restore();

  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';
  ctx.fillText(`0 km (${activeLine.labelStart})`, profX, topoY + topoH + 24);
  ctx.textAlign = 'right';
  ctx.fillText(`${totalDist.toFixed(1)} km (${activeLine.labelEnd})`, profX + profW, topoY + topoH + 24);

  // Legends
  const legX = W - 580;
  const legY = profY - 14;
  ctx.font = 'bold 12px Inter, sans-serif';

  ctx.fillStyle = '#d97706';
  ctx.fillRect(legX, legY - 10, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.fillText('Complete Bouguer (CBA)', legX + 18, legY);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(legX + 200, legY - 10, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Free-Air (FAA)', legX + 218, legY);

  ctx.fillStyle = '#059669';
  ctx.fillRect(legX + 340, legY - 10, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Topography', legX + 358, legY);

  // ==========================================
  // 4. Survey Specifications & Density Parameters
  // ==========================================
  const statY = H - 220;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(65, statY, W - 130, 130);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(65, statY, W - 130, 130);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GEOPHYSICAL REDUCTION & SURVEY SPECIFICATIONS', 85, statY + 28);

  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`• Standard Crustal Density (ρc): ${params.crustalDensity.toFixed(2)} g/cm³`, 85, statY + 56);
  ctx.fillText(`• Seawater Reference Density (ρw): ${params.waterDensity.toFixed(2)} g/cm³`, 85, statY + 80);
  ctx.fillText(`• Marine Density Contrast (Δρ): ${(params.crustalDensity - params.waterDensity).toFixed(2)} g/cm³`, 85, statY + 104);

  ctx.fillText(`• Total Soundings: ${records.length.toLocaleString()}`, 850, statY + 56);
  ctx.fillText(`• Active Transect Length: ${totalDist.toFixed(1)} km`, 850, statY + 80);
  ctx.fillText(`• Spatial Filter: ${interpolationMethod.toUpperCase()}`, 850, statY + 104);

  ctx.fillText(`• Elevation Range: [${gridTopo?.minVal.toFixed(1)} m to ${gridTopo?.maxVal.toFixed(1)} m]`, 1600, statY + 56);
  ctx.fillText(`• Free-Air Range: [${gridFaa?.minVal.toFixed(1)} mGal to ${gridFaa?.maxVal.toFixed(1)} mGal]`, 1600, statY + 80);
  ctx.fillText(`• Bouguer Range: [${gridBg?.minVal.toFixed(1)} mGal to ${gridBg?.maxVal.toFixed(1)} mGal]`, 1600, statY + 104);

  // ==========================================
  // 5. Attribution Footer
  // ==========================================
  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Data source: Scripps Institution of Oceanography, UC San Diego (SIO/UCSD) • TOPEX/Poseidon & Sandwell-Smith Satellite Altimetry Model',
    W / 2,
    H - 52
  );

  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(
    'Generated with TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
    W / 2,
    H - 30
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
