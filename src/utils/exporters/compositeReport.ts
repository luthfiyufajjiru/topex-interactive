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
 * combining all 3 maps with correlation points, the 2D cross-section profile, picked correlation markers, and survey metadata.
 * Designed in a clean, publication-ready Light Scientific Theme.
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

  // Background (Clean White)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Outer Neatline Frame
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Selected Correlation Target Point
  const targetPick = activePoint || profilePoints[Math.floor(profilePoints.length / 2)];

  // ==========================================
  // 1. Header Banner (Clean Light Scientific Theme)
  // ==========================================
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(24, 24, W - 48, 110);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, W - 48, 110);

  // Left Oceanic Blue Accent Stripe
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(24, 24, 6, 110);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SATELLITE GRAVITY & GEOPHYSICAL CROSS-SECTION REPORT', 55, 68);

  ctx.font = '15px Inter, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText(
    `Survey Extent: [${bounds.north.toFixed(4)}°N, ${bounds.south.toFixed(4)}°S, ${bounds.west.toFixed(4)}°W, ${bounds.east.toFixed(4)}°E] • Total Soundings: ${records.length.toLocaleString()} • Spatial Filter: ${interpolationMethod.toUpperCase()}`,
    55,
    102
  );

  ctx.textAlign = 'right';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText('https://topex-interactive.yufajjiru.work', W - 55, 68);
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Scripps Institution of Oceanography (SIO/UCSD)', W - 55, 96);

  // ==========================================
  // 2. Four Side-by-Side Geophysical Maps (Quad-Map Suite)
  // ==========================================
  const gridTopo = buildRegularGrid(records, bounds, (r) => r.elevation);
  const gridFaa = buildRegularGrid(records, bounds, (r) => r.gravity);
  const gridBg = buildRegularGrid(records, bounds, (r) => r.bouguer);
  const gridResidual = buildRegularGrid(records, bounds, (r) => r.residual ?? r.bouguer);

  const mapW = 540;
  const mapH = 370;
  const mapY = 165;
  const startX = 50;
  const gapX = 33;

  const mapConfigs = [
    { title: '1. Topography / Bathymetry', unit: 'm', grid: gridTopo, colormap: 'gebco' as const, x: startX },
    { title: '2. Free-Air Gravity Anomaly', unit: 'mGal', grid: gridFaa, colormap: 'coolwarm' as const, x: startX + mapW + gapX },
    { title: '3. Complete Bouguer Anomaly', unit: 'mGal', grid: gridBg, colormap: 'viridis' as const, x: startX + (mapW + gapX) * 2 },
    { title: '4. Residual Gravity Anomaly', unit: 'mGal', grid: gridResidual, colormap: 'coolwarm' as const, x: startX + (mapW + gapX) * 3 },
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
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(activeLine.labelStart, xA - 15, yA - 6);
    ctx.fillText(activeLine.labelEnd, xB + 7, yB - 6);

    // >>> CORRELATION POINT ON THE MAP <<<
    if (targetPick) {
      const xPick = mCfg.x + ((targetPick.longitude - bounds.west) / lonRange) * mapW;
      const yPick = mapY + ((bounds.north - targetPick.latitude) / latRange) * mapH;

      // Glow halo
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(xPick, yPick, 8, 0, Math.PI * 2);
      ctx.stroke();

      // White fill
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xPick, yPick, 6.5, 0, Math.PI * 2);
      ctx.fill();

      // Colored center reticle dot
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(xPick, yPick, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Map Title Header
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mCfg.title, mCfg.x, mapY - 12);

    // Outer Border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mCfg.x, mapY, mapW, mapH);

    // Colorbar strip
    const barY = mapY + mapH + 10;
    const barH = 12;
    const barImgData = ctx.createImageData(mapW, barH);
    const barPix = barImgData.data;

    for (let px = 0; px < mapW; px++) {
      const frac = px / (mapW - 1);
      const val = mCfg.grid.minVal + frac * (mCfg.grid.maxVal - mCfg.grid.minVal);
      const [r, g, b, a] = getInterpolatedColor(val, mCfg.grid.minVal, mCfg.grid.maxVal, mCfg.colormap);
      for (let py = 0; py < barH; py++) {
        const idx = (py * mapW + px) * 4;
        barPix[idx] = r;
        barPix[idx + 1] = g;
        barPix[idx + 2] = b;
        barPix[idx + 3] = a;
      }
    }
    ctx.putImageData(barImgData, mCfg.x, barY);
    ctx.strokeRect(mCfg.x, barY, mapW, barH);

    // Colorbar values
    ctx.fillStyle = '#475569';
    ctx.font = '11.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${mCfg.grid.minVal.toFixed(1)} ${mCfg.unit}`, mCfg.x, barY + barH + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${mCfg.grid.maxVal.toFixed(1)} ${mCfg.unit}`, mCfg.x + mapW, barY + barH + 14);
  }

  // ==========================================
  // 3. 2D Geophysical Cross-Section Profile
  // ==========================================
  const profX = 65;
  const profY = 630;
  const profW = W - 130;
  const profH = 430;
  const splitProfY = profY + 195;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `2D Geophysical Cross-Section: ${activeLine.name} (${activeLine.labelStart} → ${activeLine.labelEnd})`,
    profX,
    profY - 18
  );

  const totalDist = profilePoints[profilePoints.length - 1].distanceKm;

  // Elevation min/max
  let minElev = 0, maxElev = 0;
  for (const p of profilePoints) {
    if (p.elevation < minElev) minElev = p.elevation;
    if (p.elevation > maxElev) maxElev = p.elevation;
  }
  const elevPad = Math.max(100, (maxElev - minElev) * 0.1);
  minElev = Math.floor(minElev - elevPad);
  maxElev = Math.ceil(maxElev + elevPad);

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
  const gravPad = Math.max(10, (maxGrav - minGrav) * 0.1);
  minGrav = Math.floor(minGrav - gravPad);
  maxGrav = Math.ceil(maxGrav + gravPad);

  const gravH = splitProfY - profY;
  const topoH = profH - gravH - 45;
  const topoY = splitProfY + 45;

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

  // Residual Gravity Anomaly Curve (Vibrant Purple)
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  let startedRes = false;
  for (const p of profilePoints) {
    if (p.residual !== undefined) {
      const x = scaleX(p.distanceKm);
      const y = scaleYGrav(p.residual);
      if (!startedRes) {
        ctx.moveTo(x, y);
        startedRes = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();

  // Picked Correlation Line & Floating Value Badges
  if (targetPick) {
    const posX = scaleX(targetPick.distanceKm);
    const isRight = posX > profX + profW * 0.75;
    const offX = isRight ? -115 : 14;

    // Full vertical dashed correlation line
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

    // Residual anchor & tag
    if (targetPick.residual !== undefined) {
      const yR = scaleYGrav(targetPick.residual);
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath();
      ctx.arc(posX, yR, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#f5f3ff';
      ctx.fillRect(posX + offX, yR - 14, 115, 28);
      ctx.strokeStyle = '#ddd6fe';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + offX, yR - 14, 115, 28);
      ctx.fillStyle = '#6d28d9';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.residual.toFixed(1)} mGal`, posX + offX + 57, yR + 5);
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
  ctx.translate(profX - 60, profY + gravH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Gravity (mGal)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(profX - 60, topoY + topoH / 2);
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
  const legX = W - 780;
  const legY = profY - 18;
  ctx.font = 'bold 12px Inter, sans-serif';

  ctx.fillStyle = '#8b5cf6';
  ctx.fillRect(legX, legY - 10, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.fillText('Residual Anomaly', legX + 18, legY);

  ctx.fillStyle = '#d97706';
  ctx.fillRect(legX + 160, legY - 10, 12, 12);
  ctx.fillText('Complete Bouguer', legX + 178, legY);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(legX + 320, legY - 10, 12, 12);
  ctx.fillText('Free-Air (FAA)', legX + 338, legY);

  ctx.fillStyle = '#059669';
  ctx.fillRect(legX + 460, legY - 10, 12, 12);
  ctx.fillText('Topography', legX + 478, legY);

  // ==========================================
  // 4. Survey Specifications & Density Parameters
  // ==========================================
  const statY = H - 220;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(50, statY, W - 100, 130);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(50, statY, W - 100, 130);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GEOPHYSICAL REDUCTION & SURVEY SPECIFICATIONS', 70, statY + 28);

  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`• Standard Crustal Density (ρc): ${params.crustalDensity.toFixed(2)} g/cm³`, 70, statY + 56);
  ctx.fillText(`• Seawater Reference Density (ρw): ${params.waterDensity.toFixed(2)} g/cm³`, 70, statY + 80);
  ctx.fillText(`• Marine Density Contrast (Δρ): ${(params.crustalDensity - params.waterDensity).toFixed(2)} g/cm³`, 70, statY + 104);

  ctx.fillText(`• Total Soundings: ${records.length.toLocaleString()}`, 800, statY + 56);
  ctx.fillText(`• Active Transect Length: ${totalDist.toFixed(1)} km`, 800, statY + 80);
  ctx.fillText(`• Spatial Filter: ${interpolationMethod.toUpperCase()}`, 800, statY + 104);

  ctx.fillText(`• Elevation Range: [${gridTopo?.minVal.toFixed(1)} m to ${gridTopo?.maxVal.toFixed(1)} m]`, 1550, statY + 56);
  ctx.fillText(`• Free-Air Range: [${gridFaa?.minVal.toFixed(1)} mGal to ${gridFaa?.maxVal.toFixed(1)} mGal]`, 1550, statY + 80);
  ctx.fillText(`• Residual Range: [${gridResidual?.minVal.toFixed(1)} mGal to ${gridResidual?.maxVal.toFixed(1)} mGal]`, 1550, statY + 104);

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
