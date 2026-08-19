import React, { useState, useRef } from 'react';
import type { ProfilePoint, ProfileLine } from '@/types';
import { exportProfileToCsv } from '@/utils/geophysics/profile';
import { Download, TrendingUp, Compass } from 'lucide-react';

interface ProfileGraphProps {
  points: ProfilePoint[];
  line: ProfileLine;
  onHoverPoint: (point: ProfilePoint | null) => void;
  hoveredPoint: ProfilePoint | null;
  onSetPresetLine: (preset: 'we' | 'ns' | 'diag1' | 'diag2') => void;
}

export const ProfileGraph: React.FC<ProfileGraphProps> = ({
  points,
  line,
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

  // Topography Area Polygon (filled to bottom of chart)
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
      <div className="profile-header-row">
        <div className="profile-title-group">
          <div className="icon-badge-sky">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="profile-title">
              2D Geophysical Cross-Section Profile (Transect A &rarr; A&prime;)
            </h3>
            <p className="profile-desc">
              Total Length: <strong>{totalDist.toFixed(1)} km</strong> &bull; Start: ({line.start.lat.toFixed(3)}&deg;, {line.start.lon.toFixed(3)}&deg;) &bull; End: ({line.end.lat.toFixed(3)}&deg;, {line.end.lon.toFixed(3)}&deg;)
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
              title="West to East horizontal transect"
            >
              <Compass size={13} />
              <span>W &rarr; E</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('ns')}
              title="North to South vertical transect"
            >
              <Compass size={13} />
              <span>N &rarr; S</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('diag1')}
              title="South-West to North-East diagonal transect"
            >
              <Compass size={13} />
              <span>SW &rarr; NE</span>
            </button>
            <button
              type="button"
              className="btn-preset-transect"
              onClick={() => onSetPresetLine('diag2')}
              title="North-West to South-East diagonal transect"
            >
              <Compass size={13} />
              <span>NW &rarr; SE</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-export-profile-csv"
            onClick={() => exportProfileToCsv(points)}
            title="Download Profile Data as CSV for GM-SYS / Oasis Montaj"
          >
            <Download size={14} />
            <span>Export Profile (.CSV)</span>
          </button>
        </div>
      </div>

      {/* SVG Interactive Profile Canvas */}
      <div className="svg-profile-wrapper" ref={containerRef}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="profile-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Topography Crust Gradient */}
            <linearGradient id="crustGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
            </linearGradient>
            {/* Water Gradient */}
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Background */}
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="#0b1329" rx={8} />

          {/* Grid lines & Boundaries */}
          {/* Gravity Box */}
          <rect
            x={margin.left}
            y={margin.top}
            width={graphWidth}
            height={gravHeight}
            fill="#060b19"
            stroke="#1e293b"
            strokeWidth={1}
          />

          {/* Zero Gravity Line */}
          {minGrav <= 0 && maxGrav >= 0 && (
            <line
              x1={margin.left}
              y1={zeroGravY}
              x2={margin.left + graphWidth}
              y2={zeroGravY}
              stroke="#475569"
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
            fill="#060b19"
            stroke="#1e293b"
            strokeWidth={1}
          />

          {/* Sea Level 0m Line */}
          <line
            x1={margin.left}
            y1={zeroElevY}
            x2={margin.left + graphWidth}
            y2={zeroElevY}
            stroke="#38bdf8"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={margin.left + graphWidth - 6}
            y={zeroElevY - 4}
            fill="#38bdf8"
            fontSize="10"
            textAnchor="end"
            fontFamily="monospace"
          >
            0 m Sea Level (MSL)
          </text>

          {/* Topography Crust Fill & Outline */}
          <path d={topoAreaPath} fill="url(#crustGrad)" />
          <path d={topoLinePath} fill="none" stroke="#10b981" strokeWidth={2.5} />

          {/* Gravity Anomaly Curves */}
          {hasGravity && (
            <>
              {/* Free Air Curve (Sky Blue) */}
              <path d={faaPath} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
              {/* Bouguer Curve (Amber) */}
              <path d={bgPath} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
            </>
          )}

          {/* Y Axis: Gravity (mGal) */}
          <text
            x={margin.left - 10}
            y={margin.top + 12}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {maxGrav}
          </text>
          <text
            x={margin.left - 10}
            y={margin.top + gravHeight}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {minGrav}
          </text>
          <text
            x={margin.left - 36}
            y={margin.top + gravHeight / 2}
            fill="#e2e8f0"
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
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {maxElev}
          </text>
          <text
            x={margin.left - 10}
            y={splitY + 20 + topoHeight}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {minElev}
          </text>
          <text
            x={margin.left - 36}
            y={splitY + 20 + topoHeight / 2}
            fill="#e2e8f0"
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
            stroke="#475569"
            strokeWidth={1}
          />
          <text
            x={margin.left}
            y={bottomY + 18}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="start"
            fontFamily="monospace"
          >
            0 km (A)
          </text>
          <text
            x={margin.left + graphWidth / 2}
            y={bottomY + 18}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {(totalDist / 2).toFixed(1)} km
          </text>
          <text
            x={margin.left + graphWidth}
            y={bottomY + 18}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="end"
            fontFamily="monospace"
          >
            {totalDist.toFixed(1)} km (A&prime;)
          </text>
          <text
            x={margin.left + graphWidth / 2}
            y={bottomY + 36}
            fill="#e2e8f0"
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
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />

              {/* Gravity Target Dots */}
              {activePoint.bouguer !== undefined && (
                <circle
                  cx={scaleX(activePoint.distanceKm)}
                  cy={scaleYGrav(activePoint.bouguer)}
                  r={5}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
              {activePoint.freeAir !== undefined && (
                <circle
                  cx={scaleX(activePoint.distanceKm)}
                  cy={scaleYGrav(activePoint.freeAir)}
                  r={4.5}
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              )}

              {/* Topo Target Dot */}
              <circle
                cx={scaleX(activePoint.distanceKm)}
                cy={scaleYTopo(activePoint.elevation)}
                r={5}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      </div>

      {/* Legend & Hover Data Bar */}
      <div className="profile-footer-bar">
        <div className="profile-legends">
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#f59e0b' }} />
            <span className="legend-label">Complete Bouguer Anomaly (CBA)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#38bdf8' }} />
            <span className="legend-label">Free-Air Gravity Anomaly (FAA)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ background: '#10b981' }} />
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
            Hover over the cross-section graph to probe continuous values along transect A &rarr; A&prime;
          </div>
        )}
      </div>
    </div>
  );
};
