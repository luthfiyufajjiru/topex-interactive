import type { ProfilePoint, NamedProfileLine } from '@/types';

export interface ProfileImageExportOptions {
  points: ProfilePoint[];
  line: NamedProfileLine;
  activePoint?: ProfilePoint | null;
  filename?: string;
}

export function exportProfileGraphToPng(options: ProfileImageExportOptions): void {
  const { points, line, activePoint, filename = `topex_${line.name.toLowerCase().replace(/\s+/g, '_')}_cross_section.png` } = options;

  if (points.length === 0) return;

  const canvas = document.createElement('canvas');
  const width = 1600;
  const height = 920;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 90, right: 80, bottom: 90, left: 110 };
  const graphWidth = width - margin.left - margin.right;
  const totalDist = points[points.length - 1].distanceKm;

  // Split between gravity (top) and topo (bottom)
  const splitY = 460;
  const gravHeight = splitY - margin.top;
  const topoTopY = splitY + 40;
  const topoHeight = height - margin.bottom - topoTopY;

  // Compute min/max for gravity
  let minGrav = 0, maxGrav = 0, hasGravity = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.freeAir !== undefined) {
      hasGravity = true;
      if (p.freeAir < minGrav) minGrav = p.freeAir;
      if (p.freeAir > maxGrav) maxGrav = p.freeAir;
    }
    if (p.bouguer !== undefined) {
      hasGravity = true;
      if (p.bouguer < minGrav) minGrav = p.bouguer;
      if (p.bouguer > maxGrav) maxGrav = p.bouguer;
    }
  }
  const gravPad = Math.max(10, (maxGrav - minGrav) * 0.1);
  minGrav = Math.floor(minGrav - gravPad);
  maxGrav = Math.ceil(maxGrav + gravPad);

  // Compute min/max for elevation
  let minElev = 0, maxElev = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.elevation < minElev) minElev = p.elevation;
    if (p.elevation > maxElev) maxElev = p.elevation;
  }
  const elevPad = Math.max(100, (maxElev - minElev) * 0.1);
  minElev = Math.floor(minElev - elevPad);
  maxElev = Math.ceil(maxElev + elevPad);

  const scaleX = (dist: number) => margin.left + (dist / (totalDist || 1)) * graphWidth;
  const scaleYGrav = (val: number) =>
    margin.top + gravHeight - ((val - minGrav) / ((maxGrav - minGrav) || 1)) * gravHeight;
  const scaleYTopo = (val: number) =>
    topoTopY + topoHeight - ((val - minElev) / ((maxElev - minElev) || 1)) * topoHeight;

  // Draw Gravity Box
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(margin.left, margin.top, graphWidth, gravHeight);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, margin.top, graphWidth, gravHeight);

  // Zero Gravity Line
  if (minGrav <= 0 && maxGrav >= 0) {
    const zeroY = scaleYGrav(0);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(margin.left + graphWidth, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw Topo Box
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(margin.left, topoTopY, graphWidth, topoHeight);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, topoTopY, graphWidth, topoHeight);

  // Zero Elevation (Sea Level) Line
  const zeroElevY = Math.max(topoTopY, Math.min(topoTopY + topoHeight, scaleYTopo(0)));
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(margin.left, zeroElevY);
  ctx.lineTo(margin.left + graphWidth, zeroElevY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('0 m MSL (Sea Level)', margin.left + graphWidth - 10, zeroElevY - 6);

  // Draw Topography Crust Fill
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleYTopo(points[0].elevation));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(scaleX(points[i].distanceKm), scaleYTopo(points[i].elevation));
  }
  ctx.lineTo(margin.left + graphWidth, topoTopY + topoHeight);
  ctx.lineTo(margin.left, topoTopY + topoHeight);
  ctx.closePath();
  ctx.fill();

  // Draw Topography Line
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(scaleX(0), scaleYTopo(points[0].elevation));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(scaleX(points[i].distanceKm), scaleYTopo(points[i].elevation));
  }
  ctx.stroke();

  // Draw Gravity Curves
  if (hasGravity) {
    // FAA (Royal Blue)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let startedFaa = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].freeAir !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].freeAir!);
        if (!startedFaa) {
          ctx.moveTo(x, y);
          startedFaa = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    // CBA (Amber)
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let startedBg = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].bouguer !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].bouguer!);
        if (!startedBg) {
          ctx.moveTo(x, y);
          startedBg = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
  }

  // Draw Vertical Correlation Line & Picked Value Tags if activePoint present
  const targetPick = activePoint || points[Math.floor(points.length / 2)];
  if (targetPick) {
    const posX = scaleX(targetPick.distanceKm);
    const isRightSide = posX > margin.left + graphWidth * 0.75;
    const badgeOffset = isRightSide ? -100 : 12;

    // 1. Full Vertical Dashed Correlation Line
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(posX, margin.top);
    ctx.lineTo(posX, topoTopY + topoHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Topo Picked Anchor Dot & Value Tag
    const yTopo = scaleYTopo(targetPick.elevation);
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(posX, yTopo, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Topo Tag box
    ctx.fillStyle = '#f0fdf4';
    ctx.fillRect(posX + badgeOffset, yTopo - 12, 90, 24);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(posX + badgeOffset, yTopo - 12, 90, 24);

    ctx.fillStyle = '#166534';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.elevation.toFixed(1)} m`, posX + badgeOffset + 45, yTopo + 4);

    // 3. FAA Picked Anchor Dot & Value Tag
    if (targetPick.freeAir !== undefined) {
      const yFaa = scaleYGrav(targetPick.freeAir);
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(posX, yFaa, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#f0f9ff';
      ctx.fillRect(posX + badgeOffset, yFaa - 12, 95, 24);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + badgeOffset, yFaa - 12, 95, 24);

      ctx.fillStyle = '#0369a1';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.freeAir.toFixed(1)} mGal`, posX + badgeOffset + 47, yFaa + 4);
    }

    // 4. CBA Picked Anchor Dot & Value Tag
    if (targetPick.bouguer !== undefined) {
      const yCba = scaleYGrav(targetPick.bouguer);
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(posX, yCba, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(posX + badgeOffset, yCba - 12, 95, 24);
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX + badgeOffset, yCba - 12, 95, 24);

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${targetPick.bouguer.toFixed(1)} mGal`, posX + badgeOffset + 47, yCba + 4);
    }

    // 5. Bottom Distance Tag on Axis
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(posX - 45, topoTopY + topoHeight + 4, 90, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${targetPick.distanceKm.toFixed(1)} km`, posX, topoTopY + topoHeight + 19);
  }

  // Axis Labels & Ticks
  ctx.fillStyle = '#334155';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';

  // Gravity Y Ticks
  ctx.fillText(`${maxGrav}`, margin.left - 12, margin.top + 14);
  ctx.fillText(`${minGrav}`, margin.left - 12, margin.top + gravHeight);

  // Topo Y Ticks
  ctx.fillText(`${maxElev} m`, margin.left - 12, topoTopY + 14);
  ctx.fillText(`${minElev} m`, margin.left - 12, topoTopY + topoHeight);

  // Y Titles
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';

  ctx.save();
  ctx.translate(margin.left - 55, margin.top + gravHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Gravity (mGal)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(margin.left - 55, topoTopY + topoHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (m)', 0, 0);
  ctx.restore();

  // X Axis Ticks & Distance
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';
  ctx.fillText(`0 km (${line.labelStart})`, margin.left, topoTopY + topoHeight + 22);

  ctx.textAlign = 'right';
  ctx.fillText(`${totalDist.toFixed(1)} km (${line.labelEnd})`, margin.left + graphWidth, topoTopY + topoHeight + 22);

  // Header Title & Transect Info
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(`2D Geophysical Cross-Section: ${line.name} (${line.labelStart} → ${line.labelEnd})`, margin.left, 42);

  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(
    `Transect Length: ${totalDist.toFixed(1)} km • Start: (${line.start.lat.toFixed(4)}°, ${line.start.lon.toFixed(4)}°) • End: (${line.end.lat.toFixed(4)}°, ${line.end.lon.toFixed(4)}°)`,
    margin.left,
    66
  );

  // Legends
  const legX = width - 480;
  const legY = 46;
  ctx.font = 'bold 12px Inter, sans-serif';

  // CBA
  ctx.fillStyle = '#d97706';
  ctx.fillRect(legX, legY - 8, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Complete Bouguer (CBA)', legX + 18, legY + 2);

  // FAA
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(legX + 180, legY - 8, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Free-Air (FAA)', legX + 198, legY + 2);

  // Bathymetry
  ctx.fillStyle = '#059669';
  ctx.fillRect(legX + 300, legY - 8, 12, 12);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Topography', legX + 318, legY + 2);

  // Prominent Attribution Footer
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Data source: Scripps Institution of Oceanography, UC San Diego (SIO/UCSD) • Sandwell & Smith Satellite Altimetry Model',
    width / 2,
    height - 40
  );

  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(
    'Generated with TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
    width / 2,
    height - 20
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
