import type { ProfilePoint, NamedProfileLine } from '@/types';

export interface ProfileImageExportOptions {
  points: ProfilePoint[];
  line: NamedProfileLine;
  activePoint?: ProfilePoint | null;
  pinnedPoints?: ProfilePoint[];
  visibleChannels?: {
    cba?: boolean;
    sba?: boolean;
    faa?: boolean;
    residual?: boolean;
    regional?: boolean;
    fhd?: boolean;
    svd?: boolean;
    tdr?: boolean;
  };
  filename?: string;
}

export function exportProfileGraphToPng(options: ProfileImageExportOptions): void {
  const {
    points,
    line,
    activePoint,
    pinnedPoints = [],
    visibleChannels = {
      cba: true,
      sba: false,
      faa: true,
      residual: true,
      regional: false,
      fhd: true,
      svd: false,
      tdr: false,
    },
    filename = `topex_${line.name.toLowerCase().replace(/\s+/g, '_')}_cross_section.png`,
  } = options;

  if (points.length === 0) return;

  const width = 1600;
  const tableRowH = 26;
  const tableHeaderH = 34;
  const tableCardH = pinnedPoints.length > 0 ? 44 + tableHeaderH + pinnedPoints.length * tableRowH : 0;
  const height = 920 + tableCardH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 90, right: 80, bottom: 90 + tableCardH, left: 110 };
  const graphWidth = width - margin.left - margin.right;
  const totalDist = points[points.length - 1].distanceKm;

  // Split between gravity (top) and topo (bottom)
  const splitY = 460;
  const gravHeight = splitY - margin.top;
  const topoTopY = splitY + 40;
  const topoHeight = 920 - 90 - topoTopY;

  // Compute min/max for gravity & derivatives based ONLY on active visible channels
  let minGrav = 0, maxGrav = 0, hasGravity = false;
  let maxFhd = 0.1, maxAbsSvd = 0.01;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (visibleChannels.faa && p.freeAir !== undefined) {
      hasGravity = true;
      if (p.freeAir < minGrav) minGrav = p.freeAir;
      if (p.freeAir > maxGrav) maxGrav = p.freeAir;
    }
    if (visibleChannels.cba && p.bouguer !== undefined) {
      hasGravity = true;
      if (p.bouguer < minGrav) minGrav = p.bouguer;
      if (p.bouguer > maxGrav) maxGrav = p.bouguer;
    }
    if (visibleChannels.sba && p.simpleBouguer !== undefined) {
      hasGravity = true;
      if (p.simpleBouguer < minGrav) minGrav = p.simpleBouguer;
      if (p.simpleBouguer > maxGrav) maxGrav = p.simpleBouguer;
    }
    if (visibleChannels.residual && p.residual !== undefined) {
      hasGravity = true;
      if (p.residual < minGrav) minGrav = p.residual;
      if (p.residual > maxGrav) maxGrav = p.residual;
    }
    if (visibleChannels.regional && p.regional !== undefined) {
      hasGravity = true;
      if (p.regional < minGrav) minGrav = p.regional;
      if (p.regional > maxGrav) maxGrav = p.regional;
    }
    if (visibleChannels.fhd && p.fhd !== undefined && p.fhd > maxFhd) {
      maxFhd = p.fhd;
    }
    if (visibleChannels.svd && p.svd !== undefined && Math.abs(p.svd) > maxAbsSvd) {
      maxAbsSvd = Math.abs(p.svd);
    }
  }

  // Fallback defaults if no gravity curves active
  if (!hasGravity) {
    minGrav = -50;
    maxGrav = 50;
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

  // Draw ONLY Active Gravity & Derivative Curves
  // 1. Regional Trend (Grey Dashed)
  if (visibleChannels.regional) {
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
  }

  // 2. Free-Air Anomaly FAA (Royal Blue)
  if (visibleChannels.faa) {
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
  }

  // 3. Simple Bouguer SBA (Golden Amber Dashed)
  if (visibleChannels.sba) {
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
  }

  // 4. Complete Bouguer CBA (Rich Amber)
  if (visibleChannels.cba) {
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
  }

  // 5. Residual Anomaly (Vibrant Purple)
  if (visibleChannels.residual) {
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
  }

  // 6. First Horizontal Derivative FHD (Rose Crimson)
  if (visibleChannels.fhd) {
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
  }

  // 7. Second Vertical Derivative SVD (Teal Dashed)
  if (visibleChannels.svd) {
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
  }

  // 8. Tilt Derivative TDR (Gold Amber)
  if (visibleChannels.tdr) {
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

  // Draw ALL Pinned Picks (with #1, #2... badges) or fallback to single activePoint
  const picksToDraw: { point: ProfilePoint; pinNumber?: number }[] = [];
  if (pinnedPoints.length > 0) {
    pinnedPoints.forEach((p, idx) => {
      picksToDraw.push({ point: p, pinNumber: idx + 1 });
    });
  } else if (activePoint) {
    picksToDraw.push({ point: activePoint });
  }

  picksToDraw.forEach(({ point: pick, pinNumber }) => {
    const posX = scaleX(pick.distanceKm);

    // 1. Full Vertical Dashed Correlation Line
    ctx.strokeStyle = pinNumber ? '#d97706' : '#0284c7';
    ctx.lineWidth = pinNumber ? 2 : 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(posX, margin.top);
    ctx.lineTo(posX, topoTopY + topoHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Topo Picked Anchor Dot
    const yTopo = scaleYTopo(pick.elevation);
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(posX, yTopo, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Curve Anchor Dots on active curves
    if (visibleChannels.faa && pick.freeAir !== undefined) {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath(); ctx.arc(posX, scaleYGrav(pick.freeAir), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.cba && pick.bouguer !== undefined) {
      ctx.fillStyle = '#d97706';
      ctx.beginPath(); ctx.arc(posX, scaleYGrav(pick.bouguer), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.sba && pick.simpleBouguer !== undefined) {
      ctx.fillStyle = '#b45309';
      ctx.beginPath(); ctx.arc(posX, scaleYGrav(pick.simpleBouguer), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.residual && pick.residual !== undefined) {
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath(); ctx.arc(posX, scaleYGrav(pick.residual), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.fhd && pick.fhd !== undefined) {
      ctx.fillStyle = '#e11d48';
      ctx.beginPath(); ctx.arc(posX, scaleYFhd(pick.fhd), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.svd && pick.svd !== undefined) {
      ctx.fillStyle = '#0d9488';
      ctx.beginPath(); ctx.arc(posX, scaleYSvd(pick.svd), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (visibleChannels.tdr && pick.tdr !== undefined) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(posX, scaleYTdr(pick.tdr), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // 4. Bottom Pin Badge on Axis
    if (pinNumber) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(posX - 24, topoTopY + topoHeight + 4, 48, 20, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`#${pinNumber}`, posX, topoTopY + topoHeight + 18);
    } else {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(posX - 40, topoTopY + topoHeight + 4, 80, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${pick.distanceKm.toFixed(1)} km`, posX, topoTopY + topoHeight + 18);
    }
  });

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

  // Legends Suite - ONLY ACTIVE SELECTED CURVES
  const legX = margin.left;
  const legY = (pinnedPoints.length > 0 ? 920 - 55 : height - 55);
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'left';

  const legendCandidates: { key: keyof typeof visibleChannels | 'topo'; label: string; color: string }[] = [
    { key: 'residual', label: 'Residual', color: '#8b5cf6' },
    { key: 'cba', label: 'Bouguer (CBA)', color: '#d97706' },
    { key: 'sba', label: 'Simple (SBA)', color: '#b45309' },
    { key: 'faa', label: 'Free-Air (FAA)', color: '#0284c7' },
    { key: 'fhd', label: 'FHD (Faults)', color: '#e11d48' },
    { key: 'svd', label: 'SVD (Laplace)', color: '#0d9488' },
    { key: 'tdr', label: 'Tilt (TDR)', color: '#f59e0b' },
    { key: 'regional', label: 'Regional', color: '#94a3b8' },
    { key: 'topo', label: 'Topography', color: '#059669' },
  ];

  const activeLegendItems = legendCandidates.filter(
    (item) => item.key === 'topo' || visibleChannels[item.key as keyof typeof visibleChannels]
  );

  let currentLegX = legX;
  for (const item of activeLegendItems) {
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(currentLegX + 5, legY - 3, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, currentLegX + 14, legY);
    currentLegX += ctx.measureText(item.label).width + 28;
  }

  // Render Sounding Picks Inspection Table on Exported PNG if multi-picks exist
  if (pinnedPoints.length > 0) {
    const tableStartY = 920 - 32;
    const tableW = graphWidth;
    const tableX = margin.left;

    // Header Card Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(tableX, tableStartY, tableW, tableCardH - 12);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableX, tableStartY, tableW, tableCardH - 12);

    // Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Sounding Picks Inspection Table (${pinnedPoints.length} points)`, tableX + 14, tableStartY + 20);

    // Dynamic Columns
    const cols = [
      { label: '#', w: 45 },
      { label: 'Distance', w: 105 },
      { label: 'Coordinates', w: 145 },
      { label: 'Topography', w: 110 },
      { label: 'Residual', w: 110 },
      { label: 'Bouguer (CBA)', w: 125 },
      ...(visibleChannels.sba ? [{ label: 'Simple (SBA)', w: 115 }] : []),
      ...(visibleChannels.faa ? [{ label: 'Free-Air (FAA)', w: 115 }] : []),
      ...(visibleChannels.fhd ? [{ label: 'FHD (Faults)', w: 115 }] : []),
      ...(visibleChannels.svd ? [{ label: 'SVD (Laplace)', w: 120 }] : []),
      ...(visibleChannels.tdr ? [{ label: 'Tilt (TDR)', w: 95 }] : []),
      ...(visibleChannels.regional ? [{ label: 'Regional', w: 105 }] : []),
    ];

    // Table Header
    const thY = tableStartY + 30;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(tableX, thY, tableW, tableHeaderH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(tableX, thY, tableW, tableHeaderH);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px Inter, sans-serif';
    let curThX = tableX + 14;
    for (const c of cols) {
      ctx.fillText(c.label, curThX, thY + 21);
      curThX += c.w;
    }

    // Rows
    ctx.font = '11px "JetBrains Mono", monospace';
    pinnedPoints.forEach((p, rIdx) => {
      const rowY = thY + tableHeaderH + rIdx * tableRowH;
      ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(tableX, rowY, tableW, tableRowH);
      ctx.strokeStyle = '#f1f5f9';
      ctx.strokeRect(tableX, rowY, tableW, tableRowH);

      let colX = tableX + 14;

      // # Pin badge
      ctx.fillStyle = '#d97706';
      ctx.fillText(`#${rIdx + 1}`, colX, rowY + 18);
      colX += cols[0].w;

      // Dist
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`${p.distanceKm.toFixed(1)} km`, colX, rowY + 18);
      colX += cols[1].w;

      // Coords
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${p.latitude.toFixed(3)}°, ${p.longitude.toFixed(3)}°`, colX, rowY + 18);
      colX += cols[2].w;

      // Topo
      ctx.fillStyle = '#047857';
      ctx.fillText(`${p.elevation.toFixed(1)} m`, colX, rowY + 18);
      colX += cols[3].w;

      // Residual
      ctx.fillStyle = '#6d28d9';
      ctx.fillText(p.residual !== undefined ? `${p.residual.toFixed(1)} mGal` : '--', colX, rowY + 18);
      colX += cols[4].w;

      // CBA
      ctx.fillStyle = '#b45309';
      ctx.fillText(p.bouguer !== undefined ? `${p.bouguer.toFixed(1)} mGal` : '--', colX, rowY + 18);
      colX += cols[5].w;

      let cIdx = 6;
      if (visibleChannels.sba) {
        ctx.fillStyle = '#c2410c';
        ctx.fillText(p.simpleBouguer !== undefined ? `${p.simpleBouguer.toFixed(1)} mGal` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
      if (visibleChannels.faa) {
        ctx.fillStyle = '#0369a1';
        ctx.fillText(p.freeAir !== undefined ? `${p.freeAir.toFixed(1)} mGal` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
      if (visibleChannels.fhd) {
        ctx.fillStyle = '#be123c';
        ctx.fillText(p.fhd !== undefined ? `${p.fhd.toFixed(2)} mGal/km` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
      if (visibleChannels.svd) {
        ctx.fillStyle = '#0f766e';
        ctx.fillText(p.svd !== undefined ? `${p.svd.toFixed(3)} mGal/km²` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
      if (visibleChannels.tdr) {
        ctx.fillStyle = '#a16207';
        ctx.fillText(p.tdr !== undefined ? `${p.tdr.toFixed(1)}°` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
      if (visibleChannels.regional) {
        ctx.fillStyle = '#64748b';
        ctx.fillText(p.regional !== undefined ? `${p.regional.toFixed(1)} mGal` : '--', colX, rowY + 18);
        colX += cols[cIdx++].w;
      }
    });
  }

  // Prominent Attribution Footer
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText(
    'TOPEX Interactive Downloader • Scripps Institution of Oceanography (SIO/UCSD)',
    width - margin.right,
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

