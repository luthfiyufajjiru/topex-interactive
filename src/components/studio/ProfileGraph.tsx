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
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndices, setPinnedIndices] = useState<number[]>([]);
  const [isKebabOpen, setIsKebabOpen] = useState(false);
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
    if (p.residual !== undefined) {
      hasGravity = true;
      if (p.residual < minGrav) minGrav = p.residual;
      if (p.residual > maxGrav) maxGrav = p.residual;
    }
  }

  // Padding on gravity scale
  const gravPad = Math.max(10, (maxGrav - minGrav) * 0.1);
  minGrav = Math.floor(minGrav - gravPad);
  maxGrav = Math.ceil(maxGrav + gravPad);

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
  const margin = { top: 25, right: 35, bottom: 45, left: 65 };
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

  // Build SVG Path strings
  let faaPath = '';
  let bgPath = '';
  let residualPath = '';
  let regionalPath = '';
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

    if (p.residual !== undefined) {
      const yRes = scaleYGrav(p.residual);
      residualPath += (i === 0 ? `M ${x} ${yRes}` : ` L ${x} ${yRes}`);
    }

    if (p.regional !== undefined) {
      const yReg = scaleYGrav(p.regional);
      regionalPath += (i === 0 ? `M ${x} ${yReg}` : ` L ${x} ${yReg}`);
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

          {/* Gravity Anomaly Curves */}
          {hasGravity && (
            <>
              {/* Regional Trend (Slate Grey Dashed) */}
              {regionalPath && (
                <path d={regionalPath} fill="none" stroke="#94a3b8" strokeWidth={1.8} strokeDasharray="5 3" />
              )}
              {/* Free Air Curve (Royal Sky Blue) */}
              <path d={faaPath} fill="none" stroke="#0284c7" strokeWidth={2.0} />
              {/* Complete Bouguer Curve (Rich Amber Orange) */}
              <path d={bgPath} fill="none" stroke="#d97706" strokeWidth={2.4} />
              {/* Residual Anomaly Curve (Vibrant Violet/Purple) */}
              {residualPath && (
                <path d={residualPath} fill="none" stroke="#8b5cf6" strokeWidth={2.6} />
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

          {/* Render All Multiple Correlation Tracker Lines & Value Tags */}
          {correlationIndices.map(({ index, isPinned }) => {
            const point = points[index];
            if (!point) return null;

            const posX = scaleX(point.distanceKm);
            const isRightSide = posX > margin.left + graphWidth * 0.75;
            const badgeAnchor = isRightSide ? 'end' : 'start';
            const badgeOffset = isRightSide ? -10 : 10;

            const yCba = point.bouguer !== undefined ? scaleYGrav(point.bouguer) : null;
            const yFaa = point.freeAir !== undefined ? scaleYGrav(point.freeAir) : null;
            const yRes = point.residual !== undefined ? scaleYGrav(point.residual) : null;
            const yTopo = scaleYTopo(point.elevation);

            // Compute collision-free badge Y positions for gravity values
            const gravBadges = [
              { key: 'faa', anchorY: yFaa, y: yFaa, val: `${point.freeAir?.toFixed(1)} mGal`, color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', dotColor: '#0284c7' },
              { key: 'cba', anchorY: yCba, y: yCba, val: `${point.bouguer?.toFixed(1)} mGal`, color: '#b45309', bg: '#fffbeb', border: '#fde68a', dotColor: '#d97706' },
              { key: 'res', anchorY: yRes, y: yRes, val: `${point.residual?.toFixed(1)} mGal`, color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', dotColor: '#8b5cf6' },
            ].filter((b): b is { key: string; anchorY: number; y: number; val: string; color: string; bg: string; border: string; dotColor: string } => b.y !== null);

            // Sort by anchor Y
            gravBadges.sort((a, b) => a.y - b.y);

            // Maintain minimum 22px vertical clearance between badges
            for (let bIdx = 1; bIdx < gravBadges.length; bIdx++) {
              if (gravBadges[bIdx].y - gravBadges[bIdx - 1].y < 22) {
                gravBadges[bIdx].y = gravBadges[bIdx - 1].y + 22;
              }
            }
            // Keep within gravity chart bounds
            const maxGravY = splitY - 12;
            for (let bIdx = gravBadges.length - 1; bIdx >= 0; bIdx--) {
              if (gravBadges[bIdx].y > maxGravY) {
                gravBadges[bIdx].y = maxGravY;
                if (bIdx > 0 && gravBadges[bIdx].y - gravBadges[bIdx - 1].y < 22) {
                  gravBadges[bIdx - 1].y = gravBadges[bIdx].y - 22;
                }
              }
            }

            return (
              <g key={`pick-${index}-${isPinned ? 'pinned' : 'hover'}`} className="correlation-group">
                {/* 1. Full vertical correlation line */}
                <line
                  x1={posX}
                  y1={margin.top}
                  x2={posX}
                  y2={bottomY}
                  stroke={isPinned ? '#0f172a' : '#64748b'}
                  strokeWidth={isPinned ? 2 : 1.4}
                  strokeDasharray={isPinned ? '4 3' : '3 3'}
                  opacity={isPinned ? 1 : 0.85}
                />

                {/* 2. Topo Picked Anchor Dot & Value Tag */}
                <circle
                  cx={posX}
                  cy={yTopo}
                  r={isPinned ? 6 : 4.5}
                  fill="#059669"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                />
                <rect
                  x={isRightSide ? posX - 76 : posX + 8}
                  y={yTopo - 10}
                  width={68}
                  height={20}
                  rx={4}
                  fill="#f0fdf4"
                  stroke="#86efac"
                  strokeWidth={1}
                />
                <text
                  x={posX + badgeOffset}
                  y={yTopo + 4}
                  fill="#166534"
                  fontSize="10.5"
                  fontWeight="bold"
                  textAnchor={badgeAnchor}
                  fontFamily="monospace"
                >
                  {point.elevation.toFixed(1)} m
                </text>

                {/* 3. Anti-Colliding Gravity Badges & Curve Anchors */}
                {gravBadges.map((badge) => (
                  <React.Fragment key={badge.key}>
                    {/* Anchor dot on curve */}
                    <circle
                      cx={posX}
                      cy={badge.anchorY}
                      r={isPinned ? 5.5 : 4}
                      fill={badge.dotColor}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    {/* Connector line if displaced due to collision */}
                    {Math.abs(badge.y - badge.anchorY) > 2 && (
                      <line
                        x1={posX}
                        y1={badge.anchorY}
                        x2={isRightSide ? posX - 8 : posX + 8}
                        y2={badge.y}
                        stroke={badge.border}
                        strokeWidth={1}
                        strokeDasharray="2 2"
                      />
                    )}
                    {/* Non-overlapping Badge */}
                    <rect
                      x={isRightSide ? posX - 84 : posX + 8}
                      y={badge.y - 10}
                      width={76}
                      height={20}
                      rx={4}
                      fill={badge.bg}
                      stroke={badge.border}
                      strokeWidth={1}
                    />
                    <text
                      x={posX + badgeOffset}
                      y={badge.y + 4}
                      fill={badge.color}
                      fontSize="10.5"
                      fontWeight="bold"
                      textAnchor={badgeAnchor}
                      fontFamily="monospace"
                    >
                      {badge.val}
                    </text>
                  </React.Fragment>
                ))}

                {/* 4. Bottom Distance Callout Tag */}
                <rect
                  x={posX - 38}
                  y={bottomY + 4}
                  width={76}
                  height={18}
                  rx={3}
                  fill={isPinned ? '#0f172a' : '#475569'}
                />
                <text
                  x={posX}
                  y={bottomY + 17}
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {point.distanceKm.toFixed(1)} km
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Clean Legend & Pinned Picks Action Bar */}
      <div className="profile-footer-bar">
        <div className="profile-legends">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#8b5cf6' }} />
            <span className="legend-label">Residual Gravity Anomaly</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#d97706' }} />
            <span className="legend-label">Complete Bouguer Anomaly (CBA)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#0284c7' }} />
            <span className="legend-label">Free-Air Gravity Anomaly (FAA)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#059669' }} />
            <span className="legend-label">Seafloor Bathymetry / Topography</span>
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
    </div>
  );
};
