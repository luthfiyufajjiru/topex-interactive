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

  // Compute min/max for gravity & derivatives
  let minGrav = 0, maxGrav = 0, hasGravity = false;
  let maxFhd = 0.1, maxAbsSvd = 0.01;

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
    if (p.simpleBouguer !== undefined) {
      hasGravity = true;
      if (p.simpleBouguer < minGrav) minGrav = p.simpleBouguer;
      if (p.simpleBouguer > maxGrav) maxGrav = p.simpleBouguer;
    }
    if (p.residual !== undefined) {
      hasGravity = true;
      if (p.residual < minGrav) minGrav = p.residual;
      if (p.residual > maxGrav) maxGrav = p.residual;
    }
    if (p.fhd !== undefined && p.fhd > maxFhd) maxFhd = p.fhd;
    if (p.svd !== undefined && Math.abs(p.svd) > maxAbsSvd) maxAbsSvd = Math.abs(p.svd);
  }
  const gravPad = Math.max(10, (maxGrav - minGrav) * 0.1);
  minGrav = Math.floor(minGrav - gravPad);
  maxGrav = Math.ceil(maxGrav + gravPad);
  maxFhd = Math.max(0.2, maxFhd * 1.2);
  maxAbsSvd = Math.max(0.02, maxAbsSvd * 1.25);

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
  const scaleYFhd = (val: number) =>
    margin.top + gravHeight - (Math.max(0, val) / maxFhd) * gravHeight;
  const scaleYSvd = (val: number) =>
    margin.top + gravHeight / 2 - (val / maxAbsSvd) * (gravHeight / 2);
  const scaleYTdr = (val: number) =>
    margin.top + gravHeight / 2 - (val / 90) * (gravHeight / 2);

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

  // Draw Gravity & Derivative Curves
  if (hasGravity) {
    // 1. Regional Trend (Grey Dashed)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    let startedReg = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].regional !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].regional!);
        if (!startedReg) { ctx.moveTo(x, y); startedReg = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Free-Air Anomaly FAA (Royal Blue)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let startedFaa = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].freeAir !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].freeAir!);
        if (!startedFaa) { ctx.moveTo(x, y); startedFaa = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();

    // 3. Simple Bouguer SBA (Golden Amber Dashed)
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    let startedSba = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].simpleBouguer !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].simpleBouguer!);
        if (!startedSba) { ctx.moveTo(x, y); startedSba = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Complete Bouguer CBA (Rich Amber)
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let startedBg = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].bouguer !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].bouguer!);
        if (!startedBg) { ctx.moveTo(x, y); startedBg = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();

    // 5. Residual Anomaly (Vibrant Purple)
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    let startedRes = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].residual !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYGrav(points[i].residual!);
        if (!startedRes) { ctx.moveTo(x, y); startedRes = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();

    // 6. First Horizontal Derivative FHD (Rose Crimson)
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let startedFhd = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].fhd !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYFhd(points[i].fhd!);
        if (!startedFhd) { ctx.moveTo(x, y); startedFhd = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();

    // 7. Second Vertical Derivative SVD (Teal Dashed)
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    let startedSvd = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].svd !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYSvd(points[i].svd!);
        if (!startedSvd) { ctx.moveTo(x, y); startedSvd = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 8. Tilt Derivative TDR (Gold Amber)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    let startedTdr = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].tdr !== undefined) {
        const x = scaleX(points[i].distanceKm);
        const y = scaleYTdr(points[i].tdr!);
        if (!startedTdr) { ctx.moveTo(x, y); startedTdr = true; } else { ctx.lineTo(x, y); }
      }
    }
    ctx.stroke();
  }

  // Draw Vertical Correlation Line & Pinned Pick Marker
  const targetPick = activePoint || points[Math.floor(points.length / 2)];
  if (targetPick) {
    const posX = scaleX(targetPick.distanceKm);

    // Full Vertical Dashed Correlation Line
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(posX, margin.top);
    ctx.lineTo(posX, topoTopY + topoHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Topo Picked Anchor Dot
    const yTopo = scaleYTopo(targetPick.elevation);
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(posX, yTopo, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bottom Distance Tag on Axis
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

  // Legends Suite (Multi-Channel Pills)
  const legX = margin.left;
  const legY = height - 55;
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'left';

  const legendItems = [
    { label: 'Residual', color: '#8b5cf6' },
    { label: 'Bouguer (CBA)', color: '#d97706' },
    { label: 'Simple (SBA)', color: '#b45309' },
    { label: 'Free-Air (FAA)', color: '#0284c7' },
    { label: 'FHD (Faults)', color: '#e11d48' },
    { label: 'SVD (Laplace)', color: '#0d9488' },
    { label: 'Tilt (TDR)', color: '#f59e0b' },
    { label: 'Regional', color: '#94a3b8' },
    { label: 'Topography', color: '#059669' },
  ];

  let currentLegX = legX;
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(currentLegX + 5, legY - 3, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, currentLegX + 14, legY);
    currentLegX += ctx.measureText(item.label).width + 28;
  }

  // Prominent Attribution Footer
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText(
    'TOPEX Interactive Downloader • Scripps Institution of Oceanography (SIO/UCSD)',
    width - margin.right,
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
