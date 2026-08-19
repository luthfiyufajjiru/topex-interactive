import React, { useMemo, useState } from 'react';
import type { ProcessedRecord, BouguerParams } from '@/types';
import { computeDensityLinearRegression, BOUGUER_GRAV_FACTOR } from '@/utils/geophysics/bouguer';
import { TrendingUp, BookOpen, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface NettletonRegressionPlotProps {
  records: ProcessedRecord[];
  params: BouguerParams;
  onParamsChange: (newParams: BouguerParams) => void;
}

export const NettletonRegressionPlot: React.FC<NettletonRegressionPlotProps> = ({
  records,
  params,
  onParamsChange,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number } | null>(null);
  const [showCitations, setShowCitations] = useState<boolean>(true);

  // Compute Linear Regression
  const regression = useMemo(() => {
    return computeDensityLinearRegression(records, params.waterDensity, 600);
  }, [records, params.waterDensity]);

  if (!regression || regression.samplePoints.length === 0) {
    return null;
  }

  // Plot Dimensions
  const W = 680;
  const H = 340;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 50;

  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  // Domain & Ranges with padding
  const xSpan = regression.xMax - regression.xMin || 1;
  const ySpan = regression.yMax - regression.yMin || 1;

  const xMinPad = regression.xMin - xSpan * 0.05;
  const xMaxPad = regression.xMax + xSpan * 0.05;
  const yMinPad = regression.yMin - ySpan * 0.08;
  const yMaxPad = regression.yMax + ySpan * 0.08;

  const scaleX = (x: number) => padLeft + ((x - xMinPad) / (xMaxPad - xMinPad || 1)) * chartW;
  const scaleY = (y: number) => padTop + chartH - ((y - yMinPad) / (yMaxPad - yMinPad || 1)) * chartH;

  // Regression Line Coordinates (xMinPad to xMaxPad)
  const regY1 = regression.slope * xMinPad + regression.intercept;
  const regY2 = regression.slope * xMaxPad + regression.intercept;

  // Active Manual Density Line (passing through data mean)
  const isMarine = regression.meanX < 0;
  const manualSlope = isMarine
    ? BOUGUER_GRAV_FACTOR * (params.crustalDensity - params.waterDensity)
    : BOUGUER_GRAV_FACTOR * params.crustalDensity;

  const manualY1 = regression.meanY + manualSlope * (xMinPad - regression.meanX);
  const manualY2 = regression.meanY + manualSlope * (xMaxPad - regression.meanX);

  const isMatching = Math.abs(params.crustalDensity - regression.empiricalDensity) < 0.02;

  const handleApplyRegressionDensity = () => {
    onParamsChange({
      ...params,
      crustalDensity: regression.empiricalDensity,
    });
  };

  // Generate 5 grid ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMinPad + (xMaxPad - xMinPad) * f);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMinPad + (yMaxPad - yMinPad) * f);

  return (
    <div className="regression-card">
      <div className="regression-header">
        <div className="regression-title-group">
          <div className="icon-badge-teal">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="regression-title">Parasnis / Nettleton Linear Regression Scatter Plot</h3>
            <p className="regression-subtitle">
              Empirical least-squares estimation of in-situ crustal density (&rho;<sub>c</sub>) from Topography vs. Free-Air Anomaly correlation.
            </p>
          </div>
        </div>

        <div className="regression-header-actions">
          <button
            type="button"
            className={`btn-apply-regression ${isMatching ? 'is-active' : ''}`}
            onClick={handleApplyRegressionDensity}
            title="Set crustal density parameter to optimal regression result"
          >
            {isMatching ? <Check size={14} /> : <TrendingUp size={14} />}
            <span>Apply Regression &rho; = {regression.empiricalDensity.toFixed(2)} g/cm³</span>
          </button>
        </div>
      </div>

      {/* Regression Metrics Summary Badges */}
      <div className="regression-metrics-grid">
        <div className="reg-metric-box">
          <div className="reg-metric-label">Regression Slope (m)</div>
          <div className="reg-metric-value text-emerald">
            {regression.slope >= 0 ? `+${regression.slope.toFixed(4)}` : regression.slope.toFixed(4)}{' '}
            <span className="reg-metric-unit">mGal/m</span>
          </div>
          <div className="reg-metric-sub">&Delta;FAA / &Delta;h</div>
        </div>

        <div className="reg-metric-box">
          <div className="reg-metric-label">Empirical Density (&rho;<sub>reg</sub>)</div>
          <div className="reg-metric-value text-emerald">
            {regression.empiricalDensity.toFixed(2)}{' '}
            <span className="reg-metric-unit">g/cm³</span>
          </div>
          <div className="reg-metric-sub">Optimal Parasnis fit</div>
        </div>

        <div className="reg-metric-box">
          <div className="reg-metric-label">Active Manual Density (&rho;<sub>c</sub>)</div>
          <div className="reg-metric-value text-primary-blue">
            {params.crustalDensity.toFixed(2)}{' '}
            <span className="reg-metric-unit">g/cm³</span>
          </div>
          <div className="reg-metric-sub">Active slab reduction</div>
        </div>

        <div className="reg-metric-box">
          <div className="reg-metric-label">Goodness of Fit (R²)</div>
          <div className="reg-metric-value text-slate">
            {regression.rSquared.toFixed(3)}
          </div>
          <div className="reg-metric-sub">{regression.pointCount.toLocaleString()} soundings</div>
        </div>
      </div>

      {/* Interactive SVG Scatter & Line Plot */}
      <div className="regression-svg-container">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="regression-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background Grid */}
          <rect x={padLeft} y={padTop} width={chartW} height={chartH} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />

          {/* Grid Lines */}
          {xTicks.map((xVal, i) => {
            const px = scaleX(xVal);
            return (
              <g key={`xtick-${i}`}>
                <line x1={px} y1={padTop} x2={px} y2={padTop + chartH} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={px} y={padTop + chartH + 18} textAnchor="middle" fontSize="11" fill="#64748b" fontFamily="JetBrains Mono, monospace">
                  {xVal.toFixed(0)} m
                </text>
              </g>
            );
          })}

          {yTicks.map((yVal, i) => {
            const py = scaleY(yVal);
            return (
              <g key={`ytick-${i}`}>
                <line x1={padLeft} y1={py} x2={padLeft + chartW} y2={py} stroke="#e2e8f0" strokeDasharray="3,3" />
                <text x={padLeft - 8} y={py + 4} textAnchor="end" fontSize="11" fill="#64748b" fontFamily="JetBrains Mono, monospace">
                  {yVal.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Zero FAA line if in view */}
          {yMinPad <= 0 && yMaxPad >= 0 && (
            <line
              x1={padLeft}
              y1={scaleY(0)}
              x2={padLeft + chartW}
              y2={scaleY(0)}
              stroke="#94a3b8"
              strokeWidth="1.2"
              strokeDasharray="5,3"
            />
          )}

          {/* Scatter Points (Soundings) */}
          {regression.samplePoints.map((pt, idx) => {
            const cx = scaleX(pt.x);
            const cy = scaleY(pt.y);
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="3.2"
                fill="rgba(14, 165, 233, 0.45)"
                stroke="#0284c7"
                strokeWidth="0.75"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}

          {/* 1. Best-Fit Regression Line (Green dashed) */}
          <line
            x1={scaleX(xMinPad)}
            y1={scaleY(regY1)}
            x2={scaleX(xMaxPad)}
            y2={scaleY(regY2)}
            stroke="#10b981"
            strokeWidth="3"
            strokeDasharray="6,4"
          />

          {/* 2. Active Manual Density Line (Blue solid) */}
          <line
            x1={scaleX(xMinPad)}
            y1={scaleY(manualY1)}
            x2={scaleX(xMaxPad)}
            y2={scaleY(manualY2)}
            stroke="#0284c7"
            strokeWidth="2.5"
          />

          {/* Axis Titles */}
          <text
            x={padLeft + chartW / 2}
            y={H - 8}
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#334155"
            fontFamily="Inter, sans-serif"
          >
            Topography / Bathymetry Elevation h (meters)
          </text>

          <text
            x={-H / 2}
            y="18"
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#334155"
            fontFamily="Inter, sans-serif"
          >
            Free-Air Anomaly FAA (mGal)
          </text>
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div className="regression-hover-tooltip">
            <div>Elev: <strong>{hoveredPoint.x.toFixed(1)} m</strong></div>
            <div>FAA: <strong>{hoveredPoint.y.toFixed(2)} mGal</strong></div>
          </div>
        )}
      </div>

      {/* Plot Legend Bar */}
      <div className="regression-legend-bar">
        <div className="reg-legend-item">
          <span className="legend-dot-teal" />
          <span>Soundings Data Cloud ({regression.pointCount.toLocaleString()} points)</span>
        </div>
        <div className="reg-legend-item">
          <span className="legend-line-dashed-green" />
          <span>Best-Fit Regression Line (&rho;<sub>reg</sub> = {regression.empiricalDensity.toFixed(2)} g/cm³)</span>
        </div>
        <div className="reg-legend-item">
          <span className="legend-line-solid-blue" />
          <span>Active Manual Density Line (&rho;<sub>c</sub> = {params.crustalDensity.toFixed(2)} g/cm³)</span>
        </div>
      </div>

      {/* Scientific Formula & Academic Literature Citations */}
      <div className="citations-card">
        <div
          className="citations-header"
          onClick={() => setShowCitations(!showCitations)}
          role="button"
          tabIndex={0}
        >
          <div className="citations-title">
            <BookOpen size={16} className="text-primary-blue" />
            <span>Mathematical Formulation & Academic References</span>
          </div>
          <span className="citations-toggle-hint">
            <span>{showCitations ? 'Hide' : 'Show Sources'}</span>
            {showCitations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>

        {showCitations && (
          <div className="citations-body">
            <div className="formula-explanation-box">
              <div className="formula-item">
                <span className="formula-tag">Parasnis (1962) Least-Squares Formulation:</span>
                <code>&Delta;g<sub>FAA</sub> = 2&pi;G &bull; &rho;<sub>c</sub> &bull; h + &Delta;g<sub>BG</sub> = m &bull; h + c</code>
              </div>
              <div className="formula-item">
                <span className="formula-tag">Empirical Density Derivation:</span>
                <code>&rho;<sub>c</sub> = m / (2&pi;G) = m / 0.04193 g/cm³</code> (where <code>2&pi;G = 0.04193 mGal&bull;cm³/g&bull;m</code>)
              </div>
            </div>

            <div className="citations-list">
              <h4 className="citations-list-title">Peer-Reviewed Papers & Classical Geophysics References:</h4>
              <ul className="academic-references">
                <li>
                  <strong>Parasnis, D. S. (1952)</strong>. <em>A study of rock densities in the English Midlands</em>. <strong>Monthly Notices of the Royal Astronomical Society: Geophysical Supplements</strong>, 6(5), 252–271. doi:10.1111/j.1365-246X.1952.tb03013.x
                </li>
                <li>
                  <strong>Parasnis, D. S. (1962)</strong>. <em>Principles of Applied Geophysics</em>. Chapman &amp; Hall, London, pp. 25–48.
                </li>
                <li>
                  <strong>Nettleton, L. L. (1939)</strong>. <em>Determination of density for reduction of gravimeter observations</em>. <strong>Geophysics</strong>, 4(3), 176–183. doi:10.1190/1.1440490
                </li>
                <li>
                  <strong>Telford, W. M., Geldart, L. P., &amp; Sheriff, R. E. (1990)</strong>. <em>Applied Geophysics</em> (2nd ed.). Cambridge University Press, Chapter 2 (Gravity Methods, pp. 12–25).
                </li>
                <li>
                  <strong>Sandwell, D. T., &amp; Smith, W. H. F. (1997)</strong>. <em>Marine gravity anomaly from Geosat and ERS 1 satellite altimetry</em>. <strong>Journal of Geophysical Research: Solid Earth</strong>, 102(B5), 10039–10054. doi:10.1029/96JB03223
                </li>
                <li>
                  <strong>Blakely, R. J. (1996)</strong>. <em>Potential Theory in Gravity and Magnetic Applications</em>. Cambridge University Press, pp. 138–145.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
