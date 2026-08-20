import JSZip from 'jszip';
import type { ProcessedRecord, BoundingBox, BouguerParams, NamedProfileLine, ProfilePoint, InterpolationMethod } from '@/types';
import { getInterpolatedColor } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, sampleInterpolatedValue } from '@/utils/geophysics/interpolation';

export interface FullSuiteOptions {
  records: ProcessedRecord[];
  bounds: BoundingBox;
  params: BouguerParams;
  lines: NamedProfileLine[];
  activeLine: NamedProfileLine;
  profilePoints: ProfilePoint[];
  activePoint?: ProfilePoint | null;
  interpolationMethod: InterpolationMethod;
  onProgress?: (msg: string) => void;
}

/**
 * Generates an ultra high-res (2400 x 1800) Composite Report Poster Canvas.
 */
export async function generateCompositeReportCanvas(options: FullSuiteOptions): Promise<HTMLCanvasElement> {
  const { records, bounds, params, activeLine, profilePoints, activePoint, interpolationMethod } = options;

  const canvas = document.createElement('canvas');
  const W = 2400;
  const H = 1800;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Outer Border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // 1. Header Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(20, 20, W - 40, 110);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SATELLITE GRAVITY & GEOPHYSICAL CROSS-SECTION REPORT', 65, 70);

  ctx.font = '15px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `Survey Extent: [${bounds.north.toFixed(4)}°N, ${bounds.south.toFixed(4)}°S, ${bounds.west.toFixed(4)}°W, ${bounds.east.toFixed(4)}°E] • Total Soundings: ${records.length.toLocaleString()} • Filter: ${interpolationMethod.toUpperCase()} Spline`,
    65,
    104
  );

  ctx.textAlign = 'right';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('https://topex-interactive.yufajjiru.work', W - 60, 70);
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Scripps Institution of Oceanography (SIO/UCSD)', W - 60, 98);

  // 2. Build Grids for 3 Maps
  const gridTopo = buildRegularGrid(records, bounds, (r) => r.elevation);
  const gridFaa = buildRegularGrid(records, bounds, (r) => r.gravity);
  const gridBg = buildRegularGrid(records, bounds, (r) => r.bouguer);

  // Map Viewports (3 side-by-side)
  const mapW = 700;
  const mapH = 500;
  const mapY = 160;
  const startX = 60;
  const gapX = 70;

  const mapConfigs = [
    { title: 'Topography / Bathymetry', unit: 'm', grid: gridTopo, colormap: 'gebco' as const, x: startX },
    { title: 'Free-Air Gravity Anomaly', unit: 'mGal', grid: gridFaa, colormap: 'coolwarm' as const, x: startX + mapW + gapX },
    { title: 'Complete Bouguer Anomaly', unit: 'mGal', grid: gridBg, colormap: 'viridis' as const, x: startX + (mapW + gapX) * 2 },
  ];

  const lonRange = bounds.east - bounds.west || 1;
  const latRange = bounds.north - bounds.south || 1;

  for (const mCfg of mapConfigs) {
    if (!mCfg.grid) continue;

    // Map box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(mCfg.x, mapY, mapW, mapH);

    // Render Raster Image Data
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
    ctx.arc(xA, yA, 7.5, 0, Math.PI * 2);
    ctx.arc(xB, yB, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(activeLine.labelStart, xA - 16, yA - 6);
    ctx.fillText(activeLine.labelEnd, xB + 8, yB - 6);

    // Picked Correlation Target Point on Map
    const targetPick = activePoint || profilePoints[Math.floor(profilePoints.length / 2)];
    if (targetPick) {
      const xPick = mCfg.x + ((targetPick.longitude - bounds.west) / lonRange) * mapW;
      const yPick = mapY + ((bounds.north - targetPick.latitude) / latRange) * mapH;

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(xPick, yPick, 9, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xPick, yPick, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(xPick, yPick, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Map Border
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(mCfg.x, mapY, mapW, mapH);

    // Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mCfg.title, mCfg.x, mapY - 12);

    // Colorbar below map
    const cbY = mapY + mapH + 15;
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

    // Ticks
    ctx.fillStyle = '#475569';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${mCfg.grid.minVal.toFixed(1)} ${mCfg.unit}`, mCfg.x, cbY + cbH + 16);
    ctx.textAlign = 'right';
    ctx.fillText(`${mCfg.grid.maxVal.toFixed(1)} ${mCfg.unit}`, mCfg.x + mapW, cbY + cbH + 16);
  }

  // 3. 2D Cross-Section Profile Section
  const profX = 110;
  const profY = 750;
  const profW = W - profX - 110;
  const profH = 720;
  const splitProfY = profY + 340;

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

  // Boxes
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(profX, profY, profW, gravH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(profX, profY, profW, gravH);

  ctx.fillRect(profX, topoY, profW, topoH);
  ctx.strokeRect(profX, topoY, profW, topoH);

  // Zero lines
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

  // Sea level
  const zeroElevY = Math.max(topoY, Math.min(topoY + topoH, scaleYTopo(0)));
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(profX, zeroElevY);
  ctx.lineTo(profX + profW, zeroElevY);
  ctx.stroke();
  ctx.setLineDash([]);

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

  // Correlation Line & Value Callout Badges
  const targetPick = activePoint || profilePoints[Math.floor(profilePoints.length / 2)];
  if (targetPick) {
    const posX = scaleX(targetPick.distanceKm);
    const isRight = posX > profX + profW * 0.75;
    const offX = isRight ? -110 : 14;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(posX, profY);
    ctx.lineTo(posX, topoY + topoH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Topo dot & tag
    const yT = scaleYTopo(targetPick.elevation);
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(posX, yT, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(posX + offX, yT - 14, 100, 28);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(posX + offX, yT - 14, 100, 28);
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.elevation.toFixed(1)} m`, posX + offX + 50, yT + 5);

    // FAA dot & tag
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
      ctx.fillRect(posX + offX, yF - 14, 110, 28);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + offX, yF - 14, 110, 28);
      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.freeAir.toFixed(1)} mGal`, posX + offX + 55, yF + 5);
    }

    // CBA dot & tag
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
      ctx.fillRect(posX + offX, yB - 14, 110, 28);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + offX, yB - 14, 110, 28);
      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.bouguer.toFixed(1)} mGal`, posX + offX + 55, yB + 5);
    }

    // Distance tag
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(posX - 50, topoY + topoH + 6, 100, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.distanceKm.toFixed(1)} km`, posX, topoY + topoH + 24);
  }

  // Y Titles
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

  // 4. Survey Parameters Summary Box (Bottom)
  const statY = H - 240;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(60, statY, W - 120, 150);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, statY, W - 120, 150);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GEOPHYSICAL REDUCTION & SURVEY SPECIFICATIONS', 80, statY + 30);

  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`• Standard Crustal Density (ρc): ${params.crustalDensity.toFixed(2)} g/cm³`, 80, statY + 60);
  ctx.fillText(`• Seawater Reference Density (ρw): ${params.waterDensity.toFixed(2)} g/cm³`, 80, statY + 85);
  ctx.fillText(`• Marine Density Contrast (Δρ): ${(params.crustalDensity - params.waterDensity).toFixed(2)} g/cm³`, 80, statY + 110);
  ctx.fillText(`• Bouguer Formula: BA = FAA - 0.04193 • Δρ • h (marine) / FAA - 0.04193 • ρc • h (land)`, 80, statY + 135);

  ctx.fillText(`• Total Sounding Samples: ${records.length.toLocaleString()}`, 900, statY + 60);
  ctx.fillText(`• Transect Length: ${totalDist.toFixed(1)} km`, 900, statY + 85);
  ctx.fillText(`• Coordinate System: WGS 84 (EPSG:4326)`, 900, statY + 110);
  ctx.fillText(`• Interpolation Kernel: ${interpolationMethod.toUpperCase()}`, 900, statY + 135);

  ctx.fillText(`• Elevation Range: [${gridTopo?.minVal.toFixed(1)} m to ${gridTopo?.maxVal.toFixed(1)} m]`, 1650, statY + 60);
  ctx.fillText(`• Free-Air Anomaly Range: [${gridFaa?.minVal.toFixed(1)} mGal to ${gridFaa?.maxVal.toFixed(1)} mGal]`, 1650, statY + 85);
  ctx.fillText(`• Bouguer Anomaly Range: [${gridBg?.minVal.toFixed(1)} mGal to ${gridBg?.maxVal.toFixed(1)} mGal]`, 1650, statY + 110);

  // Prominent Attribution Footer
  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Data source: Scripps Institution of Oceanography, UC San Diego (SIO/UCSD) • TOPEX/Poseidon & Sandwell-Smith Satellite Altimetry Model',
    W / 2,
    H - 55
  );

  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(
    'Generated with TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
    W / 2,
    H - 32
  );

  return canvas;
}

/**
 * Generates and downloads the Complete Geophysical Suite ZIP package.
 */
export async function exportFullSuiteZip(options: FullSuiteOptions): Promise<void> {
  const { records, bounds, params, lines, activeLine, profilePoints, onProgress } = options;

  if (records.length === 0) return;

  onProgress?.('Generating Composite Report Poster (4K)...');
  const zip = new JSZip();

  // 1. Generate 4K Composite Poster PNG
  const compositeCanvas = await generateCompositeReportCanvas(options);
  const compositeBlob = await new Promise<Blob | null>((resolve) => compositeCanvas.toBlob(resolve, 'image/png'));
  if (compositeBlob) {
    zip.file('REPORT/topex_geophysical_report_composite.png', compositeBlob);
  }

  // 2. CSV Datasets
  onProgress?.('Compiling CSV Soundings & Profiles...');
  const soundingsCsv = [
    'Latitude,Longitude,Topography_m,FreeAir_mGal,Bouguer_mGal,SlabCorrection_mGal',
    ...records.map(
      (r) =>
        `${r.latitude.toFixed(6)},${r.longitude.toFixed(6)},${r.elevation ?? ''},${r.gravity ?? ''},${r.bouguer ?? ''},${r.slabCorrection ?? ''}`
    ),
  ].join('\r\n');
  zip.file('DATA_CSV/topex_soundings_complete.csv', soundingsCsv);

  const profileCsv = [
    'ProfileName,Index,Distance_km,Latitude,Longitude,Topography_m,FreeAir_mGal,Bouguer_mGal',
    ...profilePoints.map(
      (p) =>
        `${activeLine.name},${p.index},${p.distanceKm},${p.latitude},${p.longitude},${p.elevation},${p.freeAir ?? ''},${p.bouguer ?? ''}`
    ),
  ].join('\r\n');
  zip.file('DATA_CSV/topex_cross_section_profile.csv', profileCsv);

  // 3. Oasis Montaj Geosoft XYZ & GXF
  onProgress?.('Formatting Geosoft Oasis Montaj XYZ & GXF Grids...');
  const xyzLines = [
    '/ Oasis Montaj Geosoft XYZ Data File',
    '/ Generated by TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
    `/ Date: ${new Date().toISOString()}`,
    '/ Coordinate System: WGS 84 (EPSG:4326)',
    '/ Channels: Longitude Latitude Topo_m FAA_mGal Bouguer_mGal Slab_mGal',
    '/',
    '/LINE 0',
    '/ X              Y              Topo_m         FAA_mGal       Bouguer_mGal   Slab_mGal',
  ];
  for (const r of records) {
    xyzLines.push(
      `${r.longitude.toFixed(6).padStart(14, ' ')} ${r.latitude.toFixed(6).padStart(14, ' ')} ${(r.elevation?.toFixed(2) ?? '*').padStart(14, ' ')} ${(r.gravity?.toFixed(3) ?? '*').padStart(14, ' ')} ${(r.bouguer?.toFixed(3) ?? '*').padStart(14, ' ')} ${(r.slabCorrection?.toFixed(3) ?? '*').padStart(14, ' ')}`
    );
  }
  zip.file('OASIS_MONTAJ_GEOSOFT/topex_survey.xyz', xyzLines.join('\r\n'));

  // 4. Survey Report Readme
  const reportText = `================================================================================
TOPEX SATELLITE GRAVITY & GEOPHYSICAL SURVEY REPORT
================================================================================
Generated by: TOPEX Interactive Downloader
URL: https://topex-interactive.yufajjiru.work
Date of Generation: ${new Date().toISOString()}

1. SURVEY BOUNDARIES (WGS 84 / EPSG:4326)
--------------------------------------------------------------------------------
North Latitude : ${bounds.north.toFixed(4)}°
South Latitude : ${bounds.south.toFixed(4)}°
West Longitude : ${bounds.west.toFixed(4)}°
East Longitude : ${bounds.east.toFixed(4)}°
Total Points   : ${records.length.toLocaleString()}

2. BOUGUER GRAVITY REDUCTION PARAMETERS
--------------------------------------------------------------------------------
Standard Crustal Density (rho_c)   : ${params.crustalDensity.toFixed(2)} g/cm³
Seawater Reference Density (rho_w) : ${params.waterDensity.toFixed(2)} g/cm³
Marine Density Contrast (Delta_rho): ${(params.crustalDensity - params.waterDensity).toFixed(2)} g/cm³
Bouguer Gravitational Constant     : 2 * pi * G = 0.04193 mGal * cm³ / (g * m)

Reduction Formulas:
- Continental (h >= 0): CBA = FAA - 0.04193 * rho_c * h
- Marine / Ocean (h < 0): CBA = FAA - 0.04193 * (rho_c - rho_w) * h

3. SURVEY PROFILE LINES
--------------------------------------------------------------------------------
${lines
  .map(
    (l) =>
      `- ${l.name} (${l.labelStart} -> ${l.labelEnd}): Start (${l.start.lat.toFixed(4)}°, ${l.start.lon.toFixed(4)}°) -> End (${l.end.lat.toFixed(4)}°, ${l.end.lon.toFixed(4)}°)`
  )
  .join('\n')}

4. CITATION & DATA SOURCES
--------------------------------------------------------------------------------
Data provided by Scripps Institution of Oceanography, University of California San Diego (SIO/UCSD).
Model: Sandwell, D. T., and W. H. F. Smith, Global Marine Gravity from Retracked Geosat and ERS-1 Altimetry.
Web Application: TOPEX Interactive Downloader (https://topex-interactive.yufajjiru.work)

5. LICENSE & USAGE TERMS
--------------------------------------------------------------------------------
License: Free Commercial Use (No Commercial Redistribution).
- Free of charge for commercial exploration, geotechnical assessment, client deliverables, and academic research.
- Commercial redistribution, resale, or sublicensing of the software code or cloud platform as a paid product is strictly prohibited.
- Copyright (c) 2022-2026 Luthfi Yufajjiru Surya Dharma.
================================================================================`;

  zip.file('README_SURVEY_REPORT.txt', reportText);

  onProgress?.('Finalizing and compressing ZIP package...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(zipBlob);
  link.download = `topex_geophysical_full_suite_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
