import React, { useState, useRef } from 'react';
import type { ProfilePoint, NamedProfileLine } from '@/types';
import { exportProfileToCsv } from '@/utils/geophysics/profile';
import { exportProfileGraphToPng } from '@/utils/exporters/profileImage';
import { Download, TrendingUp, Compass, Plus, Trash2, Image } from 'lucide-react';

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
  onSetPresetLine: (preset: 'we' | 'ns' | 'diag1' | 'diag2') => void;
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
  onSetPresetLine,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (points.length === 0) return null;

  const totalDist = points[points.length - 1].distanceKm;

  // Compute min/max for gravity
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
  const svgHeight = 360;
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

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const normX = (clientX / rect.width) * svgWidth;

    const clampedX = Math.max(margin.left, Math.min(margin.left + graphWidth, normX));
    const distRatio = (clampedX - margin.left) / graphWidth;
    const idx = Math.min(points.length - 1, Math.max(0, Math.round(distRatio * (points.length - 1))));

    setHoverIndex(idx);
    onHoverPoint(points[idx]);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    onHoverPoint(null);
  };

  const activePoint = hoverIndex !== null ? points[hoverIndex] : hoveredPoint;

  return (
    <div className="profile-graph-card">
      {/* Multi-Line Navigation Tabs */}
      <div className="profile-multiline-bar">
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

      <div className="profile-header-row">
        <div className="profile-title-group">
          <div className="icon-badge-sky">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="profile-title">
              2D Geophysical Cross-Section: {activeLine.name} ({activeLine.labelStart} &rarr; {activeLine.labelEnd})
            </h3>
            <p className="profile-desc">
              Total Length: <strong>{totalDist.toFixed(1)} km</strong> &bull; Start: ({activeLine.start.lat.toFixed(3)}&deg;, {activeLine.start.lon.toFixed(3)}&deg;) &bull; End: ({activeLine.end.lat.toFixed(3)}&deg;, {activeLine.end.lon.toFixed(3)}&deg;)
            </p>
          </div>
        </div>

        {/* Transect Preset Toolbar & Exporter */}
        <div className="profile-actions-group">
          <div className="preset-buttons-group">
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('we')}
              title="Align active line: West to East"
            >
              <Compass size={13} />
              <span>W &rarr; E</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('ns')}
              title="Align active line: North to South"
            >
              <Compass size={13} />
              <span>N &rarr; S</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('diag1')}
              title="Align active line: SW to NE diagonal"
            >
              <Compass size={13} />
              <span>SW &rarr; NE</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('diag2')}
              title="Align active line: NW to SE diagonal"
            >
              <Compass size={13} />
              <span>NW &rarr; SE</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-save-plot-png"
            onClick={() => exportProfileGraphToPng({ points, line: activeLine })}
            title="Download publication-ready 2D Cross-Section Plot (PNG)"
          >
            <Image size={14} />
            <span>Save Plot (PNG)</span>
          </button>

          <button
            type="button"
            className="btn-export-profile-csv"
            onClick={() => exportProfileToCsv(points, `${activeLine.name.toLowerCase().replace(/\s+/g, '_')}_profile.csv`)}
            title="Download Active Profile Data as CSV"
          >
            <Download size={14} />
            <span>Export Profile (.CSV)</span>
          </button>
        </div>
      </div>

      {/* SVG Interactive Profile Canvas (Clean Light Scientific Theme) */}
      <div className="svg-profile-wrapper" ref={containerRef}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="profile-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Topography Crust Gradient (Light Earth Sandstone) */}
            <linearGradient id="crustGradLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Clean Light Background */}
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#ffffff" rx={8} />

          {/* Gravity Box */}
          <rect
            x={margin.left}
            y={margin.top}
            width={graphWidth}
            height={gravHeight}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth={1}
          />

          {/* Horizontal grid lines for gravity */}
          <line
            x1={margin.left}
            y1={margin.top + gravHeight / 2}
            x2={margin.left + graphWidth}
            y2={margin.top + gravHeight / 2}
            stroke="#f1f5f9"
            strokeWidth={1}
          />

          {/* Zero Gravity Line */}
          {minGrav <= 0 && maxGrav >= 0 && (
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
          <text
            x={margin.left + graphWidth - 8}
            y={zeroElevY - 4}
            fill="#0284c7"
            fontSize="10"
            fontWeight="bold"
            textAnchor="end"
            fontFamily="monospace"
          >
            0 m Sea Level (MSL)
          </text>

          {/* Topography Crust Fill & Outline */}
          <path d={topoAreaPath} fill="url(#crustGradLight)" />
          <path d={topoLinePath} fill="none" stroke="#059669" strokeWidth={2.5} />

          {/* Gravity Anomaly Curves */}
          {hasGravity && (
            <>
              {/* Free Air Curve (Royal Sky Blue) */}
              <path d={faaPath} fill="none" stroke="#0284c7" strokeWidth={2.2} />
              {/* Bouguer Curve (Rich Amber Orange) */}
              <path d={bgPath} fill="none" stroke="#d97706" strokeWidth={2.5} />
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
            x={margin.left + graphWidth / 2}
            y={bottomY + 18}
            fill="#475569"
            fontSize="11"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {(totalDist / 2).toFixed(1)} km
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

          {/* Interactive Hover Tracker Line & Target Points */}
          {activePoint && (
            <>
              <line
                x1={scaleX(activePoint.distanceKm)}
                y1={margin.top}
                x2={scaleX(activePoint.distanceKm)}
                y2={bottomY}
                stroke="#0f172a"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />

              {/* Gravity Target Dots */}
              {activePoint.bouguer !== undefined && (
                <circle
                  cx={scaleX(activePoint.distanceKm)}
                  cy={scaleYGrav(activePoint.bouguer)}
                  r={5}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
              {activePoint.freeAir !== undefined && (
                <circle
                  cx={scaleX(activePoint.distanceKm)}
                  cy={scaleYGrav(activePoint.freeAir)}
                  r={4.5}
                  fill="#0284c7"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              )}

              {/* Topo Target Dot */}
              <circle
                cx={scaleX(activePoint.distanceKm)}
                cy={scaleYTopo(activePoint.elevation)}
                r={5}
                fill="#059669"
                stroke="#ffffff"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      </div>

      {/* Legend & Hover Data Bar (Clean Light Theme) */}
      <div className="profile-footer-bar">
        <div className="profile-legends">
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

        {activePoint ? (
          <div className="profile-probe-values">
            <span className="probe-highlight-dist">
              Dist: <strong>{activePoint.distanceKm.toFixed(1)} km</strong>
            </span>
            <span>
              Coord: <strong>{activePoint.latitude.toFixed(3)}&deg;, {activePoint.longitude.toFixed(3)}&deg;</strong>
            </span>
            <span>
              Topo: <strong className="text-emerald">{activePoint.elevation.toFixed(1)} m</strong>
            </span>
            <span>
              FAA: <strong className="text-sky">{activePoint.freeAir?.toFixed(1) ?? 'N/A'} mGal</strong>
            </span>
            <span>
              Bouguer: <strong className="text-amber">{activePoint.bouguer?.toFixed(1) ?? 'N/A'} mGal</strong>
            </span>
          </div>
        ) : (
          <div className="profile-probe-hint">
            Hover over the cross-section graph to probe continuous values along transect {activeLine.labelStart} &rarr; {activeLine.labelEnd}
          </div>
        )}
      </div>
    </div>
  );
};
