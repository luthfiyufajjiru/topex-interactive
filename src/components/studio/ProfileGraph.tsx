import React, { useState, useRef, useEffect } from 'react';
import type { ProfilePoint, NamedProfileLine } from '@/types';
import { exportProfileToCsv } from '@/utils/geophysics/profile';
import { exportProfileGraphToPng } from '@/utils/exporters/profileImage';
import { Download, TrendingUp, Plus, Trash2, Image, PinOff, MoreVertical } from 'lucide-react';

interface ProfileGraphProps {
  lines: NamedProfileLine[];
  activeLineId: string;
  onSelectLine: (id: string) => void;
  onAddLine: () => void;
  onDeleteLine: (id: string) => void;
  points: ProfilePoint[];
  activeLine: NamedProfileLine;
  onHoverPoint: (point: ProfilePoint | null) => void;
  hoveredPoint: ProfilePoint | null;
  onPinnedPointsChange?: (points: ProfilePoint[]) => void;
  onSetPresetLine?: (preset: 'we' | 'ns' | 'diag1' | 'diag2') => void;
}

export const ProfileGraph: React.FC<ProfileGraphProps> = ({
  lines,
  activeLineId,
  onSelectLine,
  onAddLine,
  onDeleteLine,
  points,
  activeLine,
  onHoverPoint,
  hoveredPoint,
  onPinnedPointsChange,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndices, setPinnedIndices] = useState<number[]>([]);
  const [isKebabOpen, setIsKebabOpen] = useState(false);

  // Sync pinned points up to parent TriMapViewer so all points appear on the map
  useEffect(() => {
    if (onPinnedPointsChange) {
      const pinned = pinnedIndices.map((idx) => points[idx]).filter(Boolean);
      onPinnedPointsChange(pinned);
    }
  }, [pinnedIndices, points, onPinnedPointsChange]);

  const [visibleChannels, setVisibleChannels] = useState<{
    cba: boolean;
    sba: boolean;
    faa: boolean;
    residual: boolean;
    regional: boolean;
    fhd: boolean;
    svd: boolean;
    tdr: boolean;
  }>({
    cba: true,
    sba: false,
    faa: true,
    residual: true,
    regional: false,
    fhd: true,
    svd: false,
    tdr: false,
  });

  const toggleChannel = (key: keyof typeof visibleChannels) => {
    setVisibleChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const kebabRef = useRef<HTMLDivElement | null>(null);

  // Close kebab menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setIsKebabOpen(false);
      }
    };
    if (isKebabOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isKebabOpen]);

  if (points.length === 0) return null;

  const totalDist = points[points.length - 1].distanceKm;

  // Compute min/max for gravity (including Free-Air, Bouguer, and Residual)
  let minGrav = 0;
  let maxGrav = 0;
  let hasGravity = false;
  let maxFhd = 0.1;
  let maxAbsSvd = 0.01;

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
    if (p.fhd !== undefined && p.fhd > maxFhd) {
      maxFhd = p.fhd;
    }
    if (p.svd !== undefined) {
      const absS = Math.abs(p.svd);
      if (absS > maxAbsSvd) maxAbsSvd = absS;
    }
  }

  // Padding on gravity scale
  const gravPad = Math.max(10, (maxGrav - minGrav) * 0.1);
  minGrav = Math.floor(minGrav - gravPad);
  maxGrav = Math.ceil(maxGrav + gravPad);

  maxFhd = Math.max(0.2, maxFhd * 1.2);
  maxAbsSvd = Math.max(0.02, maxAbsSvd * 1.25);

  // Compute min/max for elevation
  let minElev = 0;
  let maxElev = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.elevation < minElev) minElev = p.elevation;
    if (p.elevation > maxElev) maxElev = p.elevation;
  }
  const elevPad = Math.max(100, (maxElev - minElev) * 0.1);
  minElev = Math.floor(minElev - elevPad);
  maxElev = Math.ceil(maxElev + elevPad);

  // SVG Dimensions
  const svgWidth = 1000;
  const svgHeight = 370;
  const margin = { top: 25, right: 45, bottom: 45, left: 65 };
  const graphWidth = svgWidth - margin.left - margin.right;
  const splitY = 165; // Height split between gravity (top) and topo (bottom)

  const gravHeight = splitY - margin.top;
  const topoHeight = svgHeight - margin.bottom - (splitY + 20);

  // Scale helpers
  const scaleX = (dist: number) => margin.left + (dist / (totalDist || 1)) * graphWidth;
  const scaleYGrav = (val: number) =>
    margin.top + gravHeight - ((val - minGrav) / ((maxGrav - minGrav) || 1)) * gravHeight;
  const scaleYTopo = (val: number) =>
    splitY + 20 + topoHeight - ((val - minElev) / ((maxElev - minElev) || 1)) * topoHeight;

  // Derivative Scale Helpers
  const scaleYFhd = (val: number) =>
    margin.top + gravHeight - (Math.max(0, val) / maxFhd) * gravHeight;
  const scaleYSvd = (val: number) =>
    margin.top + gravHeight / 2 - (val / maxAbsSvd) * (gravHeight / 2);
  const scaleYTdr = (val: number) =>
    margin.top + gravHeight / 2 - (val / 90) * (gravHeight / 2);

  // Build SVG Path strings
  let faaPath = '';
  let bgPath = '';
  let sbaPath = '';
  let residualPath = '';
  let regionalPath = '';
  let fhdPath = '';
  let svdPath = '';
  let tdrPath = '';
  let topoLinePath = '';
  let topoAreaPath = '';

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = scaleX(p.distanceKm);

    if (p.freeAir !== undefined) {
      const yFaa = scaleYGrav(p.freeAir);
      faaPath += (i === 0 ? `M ${x} ${yFaa}` : ` L ${x} ${yFaa}`);
    }

    if (p.bouguer !== undefined) {
      const yBg = scaleYGrav(p.bouguer);
      bgPath += (i === 0 ? `M ${x} ${yBg}` : ` L ${x} ${yBg}`);
    }

    if (p.simpleBouguer !== undefined) {
      const ySba = scaleYGrav(p.simpleBouguer);
      sbaPath += (i === 0 ? `M ${x} ${ySba}` : ` L ${x} ${ySba}`);
    }

    if (p.residual !== undefined) {
      const yRes = scaleYGrav(p.residual);
      residualPath += (i === 0 ? `M ${x} ${yRes}` : ` L ${x} ${yRes}`);
    }

    if (p.regional !== undefined) {
      const yReg = scaleYGrav(p.regional);
      regionalPath += (i === 0 ? `M ${x} ${yReg}` : ` L ${x} ${yReg}`);
    }

    if (p.fhd !== undefined) {
      const yFhd = scaleYFhd(p.fhd);
      fhdPath += (i === 0 ? `M ${x} ${yFhd}` : ` L ${x} ${yFhd}`);
    }

    if (p.svd !== undefined) {
      const ySvd = scaleYSvd(p.svd);
      svdPath += (i === 0 ? `M ${x} ${ySvd}` : ` L ${x} ${ySvd}`);
    }

    if (p.tdr !== undefined) {
      const yTdr = scaleYTdr(p.tdr);
      tdrPath += (i === 0 ? `M ${x} ${yTdr}` : ` L ${x} ${yTdr}`);
    }

    const yTopo = scaleYTopo(p.elevation);
    topoLinePath += (i === 0 ? `M ${x} ${yTopo}` : ` L ${x} ${yTopo}`);
  }

  // Topography Area Polygon
  const bottomY = splitY + 20 + topoHeight;
  topoAreaPath = `${topoLinePath} L ${scaleX(totalDist)} ${bottomY} L ${scaleX(0)} ${bottomY} Z`;

  // Sea Level line (0m elevation)
  const zeroElevY = Math.max(splitY + 20, Math.min(bottomY, scaleYTopo(0)));
  // Zero Gravity line (0 mGal)
  const zeroGravY = Math.max(margin.top, Math.min(margin.top + gravHeight, scaleYGrav(0)));

  // Calculate index from mouse client X
  const getIndexFromMouseEvent = (e: React.MouseEvent<SVGSVGElement>): number => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = (clientX / rect.width) * svgWidth;
    const clampedX = Math.max(margin.left, Math.min(margin.left + graphWidth, normX));
    const distRatio = (clampedX - margin.left) / graphWidth;
    return Math.min(points.length - 1, Math.max(0, Math.round(distRatio * (points.length - 1))));
  };

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const idx = getIndexFromMouseEvent(e);
    setHoverIndex(idx);
    onHoverPoint(points[idx]);
  };

  // Click handler: Toggle Multiple Pinned Correlation Lines
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const idx = getIndexFromMouseEvent(e);
    setPinnedIndices((prev) => {
      // Toggle off if clicked within proximity of an existing pin
      const nearIdx = prev.findIndex((p) => Math.abs(p - idx) <= Math.max(2, Math.round(points.length * 0.015)));
      if (nearIdx !== -1) {
        return prev.filter((_, i) => i !== nearIdx);
      }
      // Add up to 8 pinned sounding targets along the transect
      if (prev.length >= 8) {
        return [...prev.slice(1), idx];
      }
      return [...prev, idx];
    });
    onHoverPoint(points[idx]);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    if (pinnedIndices.length > 0) {
      onHoverPoint(points[pinnedIndices[pinnedIndices.length - 1]]);
    } else {
      onHoverPoint(null);
    }
  };

  // Active Sounding Record to display in stats footer
  const activeIdx = hoverIndex !== null
    ? hoverIndex
    : pinnedIndices.length > 0
    ? pinnedIndices[pinnedIndices.length - 1]
    : Math.floor(points.length / 2);
  const activePoint = points[activeIdx] || hoveredPoint;

  // Collect all points to render correlation lines for
  const correlationIndices: { index: number; isPinned: boolean }[] = [];
  pinnedIndices.forEach((idx) => {
    correlationIndices.push({ index: idx, isPinned: true });
  });
  if (hoverIndex !== null && !pinnedIndices.includes(hoverIndex)) {
    correlationIndices.push({ index: hoverIndex, isPinned: false });
  }

  return (
    <div className="profile-graph-card">
      {/* Multi-Line Navigation Tabs */}
      <div className="profile-multiline-bar">
        <div className="multiline-tabs-scroll-area">
          <div className="multiline-tabs-group">
            {lines.map((line) => {
              const isLineActive = line.id === activeLineId;
              return (
                <div key={line.id} className="multiline-tab-wrapper">
                  <button
                    type="button"
                    className={`btn-multiline-tab ${isLineActive ? 'active' : ''}`}
                    onClick={() => onSelectLine(line.id)}
                    style={{ borderLeftColor: line.color }}
                  >
                    <span className="line-color-dot" style={{ backgroundColor: line.color }} />
                    <span className="line-tab-name">{line.name}</span>
                    <span className="line-tab-labels">({line.labelStart}&rarr;{line.labelEnd})</span>
                  </button>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="btn-delete-line"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLine(line.id);
                      }}
                      title={`Delete ${line.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="btn-add-profile-line"
              onClick={onAddLine}
              title="Add a new survey profile line"
            >
              <Plus size={14} />
              <span>Add Line</span>
            </button>
          </div>
        </div>

        {/* Quick Transect Jump Selector for Multi-Line Surveys */}
        {lines.length >= 4 && (
          <div className="line-quick-dropdown-wrapper">
            <span className="quick-select-label">Jump to:</span>
            <select
              className="line-quick-select"
              value={activeLineId}
              onChange={(e) => onSelectLine(e.target.value)}
              title="Jump to survey transect line"
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.labelStart} → {l.labelEnd})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="profile-header-row">
        <div className="profile-title-group">
          <div className="icon-badge-sky">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="profile-title">
              2D Cross-Section: {activeLine.name} ({activeLine.labelStart} &rarr; {activeLine.labelEnd})
            </h3>
            <span className="profile-subtitle">
              Total Length: {totalDist.toFixed(1)} km &bull; {points.length} soundings &bull; Click anywhere on profile to add multiple picks
            </span>
          </div>
        </div>

        {/* Kebab 3-Dot Export Dropdown Menu */}
        <div className="profile-actions-group" ref={kebabRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-kebab-menu"
            onClick={() => setIsKebabOpen((prev) => !prev)}
            title="Profile export options (PNG / CSV)"
            aria-label="Profile actions"
          >
            <MoreVertical size={16} />
          </button>

          {isKebabOpen && (
            <div className="kebab-dropdown-menu">
              <button
                type="button"
                className="kebab-dropdown-item"
                onClick={() => {
                  setIsKebabOpen(false);
                  exportProfileGraphToPng({ points, line: activeLine, activePoint });
                }}
              >
                <Image size={14} />
                <span>Save Profile Image (PNG)</span>
              </button>
              <button
                type="button"
                className="kebab-dropdown-item"
                onClick={() => {
                  setIsKebabOpen(false);
                  exportProfileToCsv(
                    points,
                    `profile_${activeLine.name.toLowerCase().replace(/\s+/g, '_')}.csv`
                  );
                }}
              >
                <Download size={14} />
                <span>Export Profile Data (CSV)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SVG Interactive Profile Canvas */}
      <div className="profile-svg-container" ref={containerRef}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="profile-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ cursor: 'crosshair' }}
        >
          <defs>
            {/* Topography Crust Gradient */}
            <linearGradient id="crustGradLight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {/* Grid Background Lines (Gravity Panel) */}
          <rect
            x={margin.left}
            y={margin.top}
            width={graphWidth}
            height={gravHeight}
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          {/* Zero Gravity Line */}
          {hasGravity && (
            <line
              x1={margin.left}
              y1={zeroGravY}
              x2={margin.left + graphWidth}
              y2={zeroGravY}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* Topography Box */}
          <rect
            x={margin.left}
            y={splitY + 20}
            width={graphWidth}
            height={topoHeight}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          {/* Sea Level 0m Line */}
          <line
            x1={margin.left}
            y1={zeroElevY}
            x2={margin.left + graphWidth}
            y2={zeroElevY}
            stroke="#0284c7"
            strokeWidth={1.2}
            strokeDasharray="5 3"
          />

          {/* Topography Crust Fill & Outline */}
          <path d={topoAreaPath} fill="url(#crustGradLight)" />
          <path d={topoLinePath} fill="none" stroke="#059669" strokeWidth={2.5} />

          {/* Gravity Anomaly & Derivative Curves */}
          {hasGravity && (
            <>
              {/* Regional Trend (Slate Grey Dashed) */}
              {visibleChannels.regional && regionalPath && (
                <path d={regionalPath} fill="none" stroke="#94a3b8" strokeWidth={1.8} strokeDasharray="5 3" />
              )}
              {/* Free Air Curve (Royal Sky Blue) */}
              {visibleChannels.faa && (
                <path d={faaPath} fill="none" stroke="#0284c7" strokeWidth={2.0} />
              )}
              {/* Complete Bouguer Curve (Rich Amber Orange) */}
              {visibleChannels.cba && (
                <path d={bgPath} fill="none" stroke="#d97706" strokeWidth={2.4} />
              )}
              {/* Simple Bouguer Curve (Dashed Golden Amber) */}
              {visibleChannels.sba && sbaPath && (
                <path d={sbaPath} fill="none" stroke="#b45309" strokeWidth={2.0} strokeDasharray="4 3" />
              )}
              {/* Residual Anomaly Curve (Vibrant Violet/Purple) */}
              {visibleChannels.residual && residualPath && (
                <path d={residualPath} fill="none" stroke="#8b5cf6" strokeWidth={2.6} />
              )}
              {/* First Horizontal Derivative (FHD: Rose Crimson) */}
              {visibleChannels.fhd && fhdPath && (
                <path d={fhdPath} fill="none" stroke="#e11d48" strokeWidth={2.4} />
              )}
              {/* Second Vertical Derivative (SVD: Teal Dashed) */}
              {visibleChannels.svd && svdPath && (
                <path d={svdPath} fill="none" stroke="#0d9488" strokeWidth={2.2} strokeDasharray="4 2" />
              )}
              {/* Tilt Derivative (TDR: Gold Amber) */}
              {visibleChannels.tdr && tdrPath && (
                <path d={tdrPath} fill="none" stroke="#f59e0b" strokeWidth={2.2} />
              )}
            </>
          )}

          {/* Y Axis: Gravity (mGal) */}
          <text
            x={margin.left - 10}
            y={margin.top + 12}
            fill="#475569"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {maxGrav}
          </text>
          <text
            x={margin.left - 10}
            y={margin.top + gravHeight}
            fill="#475569"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {minGrav}
          </text>
          <text
            x={margin.left - 36}
            y={margin.top + gravHeight / 2}
            fill="#0f172a"
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 ${margin.left - 36} ${margin.top + gravHeight / 2})`}
          >
            Gravity (mGal)
          </text>

          {/* Y Axis: Topography (m) */}
          <text
            x={margin.left - 10}
            y={splitY + 32}
            fill="#475569"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {maxElev}
          </text>
          <text
            x={margin.left - 10}
            y={splitY + 20 + topoHeight}
            fill="#475569"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {minElev}
          </text>
          <text
            x={margin.left - 36}
            y={splitY + 20 + topoHeight / 2}
            fill="#0f172a"
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 ${margin.left - 36} ${splitY + 20 + topoHeight / 2})`}
          >
            Elevation (m)
          </text>

          {/* X Axis: Distance (km) */}
          <line
            x1={margin.left}
            y1={bottomY}
            x2={margin.left + graphWidth}
            y2={bottomY}
            stroke="#cbd5e1"
            strokeWidth={1.5}
          />
          <text
            x={margin.left}
            y={bottomY + 18}
            fill="#475569"
            fontSize="11"
            textAnchor="start"
            fontFamily="monospace"
          >
            0 km ({activeLine.labelStart})
          </text>
          <text
            x={margin.left + graphWidth}
            y={bottomY + 18}
            fill="#475569"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {totalDist.toFixed(1)} km ({activeLine.labelEnd})
          </text>
          <text
            x={margin.left + graphWidth / 2}
            y={bottomY + 36}
            fill="#0f172a"
            fontSize="12"
            fontWeight="bold"
            textAnchor="middle"
          >
            Profile Distance (km)
          </text>

          {/* Render All Multiple Correlation Tracker Lines & Subtle Pinned Markers */}
          {correlationIndices.map(({ index, isPinned }) => {
            const point = points[index];
            if (!point) return null;

            const posX = scaleX(point.distanceKm);
            const yCba = point.bouguer !== undefined ? scaleYGrav(point.bouguer) : null;
            const yFaa = point.freeAir !== undefined ? scaleYGrav(point.freeAir) : null;
            const yRes = point.residual !== undefined ? scaleYGrav(point.residual) : null;
            const ySba = point.simpleBouguer !== undefined ? scaleYGrav(point.simpleBouguer) : null;
            const yFhd = point.fhd !== undefined ? scaleYFhd(point.fhd) : null;
            const ySvd = point.svd !== undefined ? scaleYSvd(point.svd) : null;
            const yTdr = point.tdr !== undefined ? scaleYTdr(point.tdr) : null;
            const yTopo = scaleYTopo(point.elevation);

            const pinNumber = isPinned ? pinnedIndices.indexOf(index) + 1 : null;

            return (
              <g key={`pick-${index}-${isPinned ? 'pinned' : 'hover'}`} className="correlation-group">
                {/* 1. Full vertical correlation line */}
                <line
                  x1={posX}
                  y1={margin.top}
                  x2={posX}
                  y2={bottomY}
                  stroke={isPinned ? '#d97706' : '#0284c7'}
                  strokeWidth={isPinned ? 2 : 1.5}
                  strokeDasharray={isPinned ? '5 3' : '3 3'}
                  opacity={isPinned ? 0.95 : 0.85}
                />

                {/* 2. Topo Picked Anchor Dot */}
                <circle
                  cx={posX}
                  cy={yTopo}
                  r={isPinned ? 5.5 : 4}
                  fill="#059669"
                  stroke="#ffffff"
                  strokeWidth={2}
                />

                {/* 3. Curve Anchor Dots (Subtle, non-overlapping) */}
                {visibleChannels.faa && yFaa !== null && (
                  <circle cx={posX} cy={yFaa} r={isPinned ? 4.5 : 3.5} fill="#0284c7" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.cba && yCba !== null && (
                  <circle cx={posX} cy={yCba} r={isPinned ? 4.5 : 3.5} fill="#d97706" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.sba && ySba !== null && (
                  <circle cx={posX} cy={ySba} r={isPinned ? 4.5 : 3.5} fill="#b45309" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.residual && yRes !== null && (
                  <circle cx={posX} cy={yRes} r={isPinned ? 4.5 : 3.5} fill="#8b5cf6" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.fhd && yFhd !== null && (
                  <circle cx={posX} cy={yFhd} r={isPinned ? 4.5 : 3.5} fill="#e11d48" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.svd && ySvd !== null && (
                  <circle cx={posX} cy={ySvd} r={isPinned ? 4.5 : 3.5} fill="#0d9488" stroke="#ffffff" strokeWidth={1.5} />
                )}
                {visibleChannels.tdr && yTdr !== null && (
                  <circle cx={posX} cy={yTdr} r={isPinned ? 4.5 : 3.5} fill="#f59e0b" stroke="#ffffff" strokeWidth={1.5} />
                )}

                {/* 4. Bottom Pin Badge */}
                {isPinned ? (
                  <g>
                    <rect
                      x={posX - 24}
                      y={bottomY + 4}
                      width={48}
                      height={20}
                      rx={10}
                      fill="#0f172a"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                    />
                    <text
                      x={posX}
                      y={bottomY + 18}
                      fill="#fef08a"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      #{pinNumber}
                    </text>
                  </g>
                ) : (
                  <g>
                    <rect
                      x={posX - 35}
                      y={bottomY + 4}
                      width={70}
                      height={18}
                      rx={4}
                      fill="#0284c7"
                    />
                    <text
                      x={posX}
                      y={bottomY + 17}
                      fill="#ffffff"
                      fontSize="9.5"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {point.distanceKm.toFixed(1)} km
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Unified Hover HUD Readout Box in the Top Graph Corner (Clean Light Theme) */}
          {hoverIndex !== null && points[hoverIndex] && (
            <g className="unified-profile-hud" transform={`translate(${graphWidth + margin.left - 245}, ${margin.top + 8})`}>
              <rect
                width={235}
                height={126}
                rx={6}
                fill="rgba(255, 255, 255, 0.96)"
                stroke="#cbd5e1"
                strokeWidth={1.5}
              />
              <text x={10} y={18} fill="#0284c7" fontSize="11" fontWeight="bold" fontFamily="Inter, sans-serif">
                Distance: {points[hoverIndex].distanceKm.toFixed(1)} km &bull; Elev: {points[hoverIndex].elevation.toFixed(0)} m
              </text>
              <line x1={10} y1={25} x2={225} y2={25} stroke="#e2e8f0" strokeWidth={1} />
              
              <text x={10} y={42} fill="#6d28d9" fontSize="10" fontWeight="600" fontFamily="monospace">
                Residual: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].residual?.toFixed(1) ?? '--'} mGal</tspan>
              </text>
              <text x={122} y={42} fill="#b45309" fontSize="10" fontWeight="600" fontFamily="monospace">
                CBA: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].bouguer?.toFixed(1) ?? '--'} mGal</tspan>
              </text>

              <text x={10} y={60} fill="#0369a1" fontSize="10" fontWeight="600" fontFamily="monospace">
                Free-Air: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].freeAir?.toFixed(1) ?? '--'} mGal</tspan>
              </text>
              <text x={122} y={60} fill="#c2410c" fontSize="10" fontWeight="600" fontFamily="monospace">
                SBA: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].simpleBouguer?.toFixed(1) ?? '--'} mGal</tspan>
              </text>

              <text x={10} y={78} fill="#be123c" fontSize="10" fontWeight="600" fontFamily="monospace">
                FHD: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].fhd?.toFixed(2) ?? '--'} mGal/km</tspan>
              </text>
              <text x={10} y={96} fill="#0f766e" fontSize="10" fontWeight="600" fontFamily="monospace">
                SVD: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].svd?.toFixed(3) ?? '--'} mGal/km²</tspan>
              </text>
              <text x={122} y={96} fill="#a16207" fontSize="10" fontWeight="600" fontFamily="monospace">
                Tilt: <tspan fontWeight="bold" fill="#0f172a">{points[hoverIndex].tdr?.toFixed(1) ?? '--'}°</tspan>
              </text>
              <text x={10} y={115} fill="#64748b" fontSize="8.5" fontFamily="Inter, sans-serif">
                Coord: {points[hoverIndex].latitude.toFixed(3)}&deg;N, {points[hoverIndex].longitude.toFixed(3)}&deg;E
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Clean Interactive Legend & Channel Toggles */}
      <div className="profile-footer-bar">
        <div className="profile-legends-header">
          <span className="profile-legends-title">Toggle Cross-Section Curves:</span>
        </div>
        <div className="profile-legends">
          <button
            type="button"
            className={`legend-item-btn legend-btn-res ${visibleChannels.residual ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('residual')}
            title="Toggle Residual Gravity Anomaly"
          >
            <span className="legend-indicator">{visibleChannels.residual ? '✓' : ''}</span>
            <span className="legend-dot dot-res" />
            <span className="legend-label">Residual</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-cba ${visibleChannels.cba ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('cba')}
            title="Toggle Complete Bouguer Anomaly (CBA = SBA + TC)"
          >
            <span className="legend-indicator">{visibleChannels.cba ? '✓' : ''}</span>
            <span className="legend-dot dot-cba" />
            <span className="legend-label">Bouguer (CBA)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-sba ${visibleChannels.sba ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('sba')}
            title="Toggle Simple Bouguer Anomaly (SBA = FAA - Slab)"
          >
            <span className="legend-indicator">{visibleChannels.sba ? '✓' : ''}</span>
            <span className="legend-dot dot-sba" />
            <span className="legend-label">Simple (SBA)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-faa ${visibleChannels.faa ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('faa')}
            title="Toggle Free-Air Gravity Anomaly (FAA)"
          >
            <span className="legend-indicator">{visibleChannels.faa ? '✓' : ''}</span>
            <span className="legend-dot dot-faa" />
            <span className="legend-label">Free-Air (FAA)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-fhd ${visibleChannels.fhd ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('fhd')}
            title="Toggle First Horizontal Derivative (FHD - Fault Edges)"
          >
            <span className="legend-indicator">{visibleChannels.fhd ? '✓' : ''}</span>
            <span className="legend-dot dot-fhd" />
            <span className="legend-label">FHD (Faults)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-svd ${visibleChannels.svd ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('svd')}
            title="Toggle Second Vertical Derivative (SVD - Zero Crossings)"
          >
            <span className="legend-indicator">{visibleChannels.svd ? '✓' : ''}</span>
            <span className="legend-dot dot-svd" />
            <span className="legend-label">SVD (Laplace)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-tdr ${visibleChannels.tdr ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('tdr')}
            title="Toggle Tilt Angle Derivative (TDR)"
          >
            <span className="legend-indicator">{visibleChannels.tdr ? '✓' : ''}</span>
            <span className="legend-dot dot-tdr" />
            <span className="legend-label">Tilt (TDR)</span>
          </button>
          <button
            type="button"
            className={`legend-item-btn legend-btn-reg ${visibleChannels.regional ? 'active' : 'inactive'}`}
            onClick={() => toggleChannel('regional')}
            title="Toggle Regional Trend"
          >
            <span className="legend-indicator">{visibleChannels.regional ? '✓' : ''}</span>
            <span className="legend-dot dot-reg" />
            <span className="legend-label">Regional</span>
          </button>
          <div className="legend-item static legend-btn-topo">
            <span className="legend-dot dot-topo" />
            <span className="legend-label">Topography</span>
          </div>
        </div>

        {pinnedIndices.length > 0 && (
          <div className="profile-footer-actions">
            <button
              type="button"
              className="btn-unpin"
              onClick={() => setPinnedIndices([])}
              title="Clear all pinned correlation picks"
            >
              <PinOff size={13} />
              <span>Clear Picks ({pinnedIndices.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Sounding Picks Inspection & Comparison Table */}
      {pinnedIndices.length > 0 && (
        <div className="profile-picks-table-card">
          <div className="picks-table-header">
            <div className="picks-title-group">
              <span className="picks-table-title">Sounding Picks Inspection Table ({pinnedIndices.length} points)</span>
              <span className="picks-table-subtitle">Compare anomalies, derivative gradients, and fault contacts across survey picks</span>
            </div>
            <div className="picks-table-actions">
              <button
                type="button"
                className="btn-picks-export"
                onClick={() => {
                  const pinnedPts = pinnedIndices.map((idx) => points[idx]).filter(Boolean);
                  exportProfileToCsv(pinnedPts, `picks_${activeLine.name.toLowerCase().replace(/\s+/g, '_')}.csv`);
                }}
                title="Export selected picks to CSV"
              >
                <Download size={13} />
                <span>Export Picks (CSV)</span>
              </button>
              <button
                type="button"
                className="btn-unpin-all"
                onClick={() => setPinnedIndices([])}
                title="Clear all pinned picks"
              >
                <PinOff size={13} />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          <div className="picks-table-scroll-container">
            <table className="picks-data-table">
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th>Distance</th>
                  <th>Coordinates</th>
                  <th>Elevation</th>
                  <th>Residual</th>
                  <th>Bouguer (CBA)</th>
                  <th>Simple (SBA)</th>
                  <th>Free-Air (FAA)</th>
                  <th>FHD (Faults)</th>
                  <th>SVD (Laplace)</th>
                  <th>Tilt (TDR)</th>
                  <th>Elkins (1951) Verdict</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {pinnedIndices.map((ptIdx, rowIdx) => {
                  const p = points[ptIdx];
                  if (!p) return null;

                  // Evaluate Elkins (1951) Structural Boundary & Curvature Rule
                  const fhd = p.fhd ?? 0;
                  const svd = p.svd ?? 0;
                  const tdr = p.tdr ?? 0;
                  const validFhds = points.map((pt) => pt.fhd || 0).filter((v) => v > 0);
                  const avgFhd = validFhds.length > 0 ? validFhds.reduce((a, b) => a + b, 0) / validFhds.length : 0.05;
                  const isHighGradient = fhd >= avgFhd * 1.15 || fhd > 0.08;
                  const isZeroCrossing = Math.abs(tdr) <= 18 || Math.abs(svd) <= 0.005;

                  let verdict = {
                    label: 'Homogeneous Basement',
                    className: 'verdict-stable',
                    tooltip: 'Elkins (1951): Low gradient, quiescent regional basement',
                  };

                  if (isHighGradient && isZeroCrossing) {
                    verdict = {
                      label: '⚡ Fault Contact / Edge',
                      className: 'verdict-fault',
                      tooltip: 'Elkins (1951): SVD/TDR Zero-Crossing with Peak FHD (Fault Plane)',
                    };
                  } else if (tdr > 20 || (svd > 0.005 && (p.residual ?? 0) > 0)) {
                    verdict = {
                      label: '▲ Upthrown / Dense Block',
                      className: 'verdict-upthrown',
                      tooltip: 'Elkins (1951): Positive curvature over mass excess (Hanging Wall / Horst)',
                    };
                  } else if (tdr < -20 || (svd < -0.005 && (p.residual ?? 0) < 0)) {
                    verdict = {
                      label: '▼ Downthrown / Graben',
                      className: 'verdict-downthrown',
                      tooltip: 'Elkins (1951): Negative curvature over mass deficit (Footwall / Basin)',
                    };
                  }

                  return (
                    <tr key={`pick-row-${ptIdx}`}>
                      <td>
                        <span className="pick-row-badge">#{rowIdx + 1}</span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.distanceKm.toFixed(1)} km</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#64748b' }}>
                        {p.latitude.toFixed(3)}&deg;, {p.longitude.toFixed(3)}&deg;
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#047857' }}>{p.elevation.toFixed(1)} m</td>
                      <td style={{ fontFamily: 'monospace', color: '#6d28d9', fontWeight: 600 }}>{p.residual !== undefined ? `${p.residual.toFixed(1)} mGal` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#b45309', fontWeight: 600 }}>{p.bouguer !== undefined ? `${p.bouguer.toFixed(1)} mGal` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#c2410c' }}>{p.simpleBouguer !== undefined ? `${p.simpleBouguer.toFixed(1)} mGal` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#0369a1' }}>{p.freeAir !== undefined ? `${p.freeAir.toFixed(1)} mGal` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#be123c', fontWeight: 700 }}>{p.fhd !== undefined ? `${p.fhd.toFixed(2)} mGal/km` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#0f766e' }}>{p.svd !== undefined ? `${p.svd.toFixed(3)} mGal/km²` : '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#a16207' }}>{p.tdr !== undefined ? `${p.tdr.toFixed(1)}°` : '--'}</td>
                      <td>
                        <span className={`verdict-badge ${verdict.className}`} title={verdict.tooltip}>
                          {verdict.label}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-delete-pick"
                          onClick={() => setPinnedIndices((prev) => prev.filter((_, i) => i !== rowIdx))}
                          title={`Remove pick #${rowIdx + 1}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
