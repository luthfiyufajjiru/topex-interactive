import React from 'react';
import type { BouguerParams, ProcessedRecord, GeophysicsSummaryStats } from '@/types';
import { ArrowRight, RotateCcw, Info, Sliders } from 'lucide-react';

interface BouguerControlPanelProps {
  params: BouguerParams;
  onParamsChange: (newParams: BouguerParams) => void;
  stats: GeophysicsSummaryStats;
  records: ProcessedRecord[];
  onProceedToStudio: () => void;
}

export const BouguerControlPanel: React.FC<BouguerControlPanelProps> = ({
  params,
  onParamsChange,
  stats,
  records,
  onProceedToStudio,
}) => {
  const handleReset = () => {
    onParamsChange({
      crustalDensity: 2.67,
      waterDensity: 1.03,
      includeCurvatureBullardB: false,
    });
  };

  const deltaRho = Number((params.crustalDensity - params.waterDensity).toFixed(2));

  return (
    <div className="processing-panel-card">
      <div className="processing-panel-header">
        <div className="processing-title-group">
          <div className="icon-badge-blue">
            <Sliders size={20} />
          </div>
          <div>
            <h2 className="processing-title">Bouguer Gravity Anomaly Reduction Engine</h2>
            <p className="processing-desc">
              Calculate complete marine & continental Bouguer anomaly by compensating for the crustal slab and seawater mass deficiency.
            </p>
          </div>
        </div>

        <button type="button" className="btn-reset-params" onClick={handleReset} title="Reset to standard defaults">
          <RotateCcw size={15} />
          <span>Reset Defaults</span>
        </button>
      </div>

      <div className="processing-grid">
        {/* Left Column: Parameter Inputs & Sliders */}
        <div className="processing-controls-col">
          <h3 className="control-group-title">Geophysical Density Parameters</h3>

          {/* Crustal Density */}
          <div className="density-field">
            <div className="density-label-row">
              <label htmlFor="crustal-density">
                Standard Crustal Density (&rho;<sub>c</sub>)
              </label>
              <span className="density-value-badge">{params.crustalDensity.toFixed(2)} g/cm³</span>
            </div>
            <div className="slider-input-row">
              <input
                id="crustal-density"
                type="range"
                min="2.20"
                max="3.00"
                step="0.01"
                value={params.crustalDensity}
                onChange={(e) =>
                  onParamsChange({ ...params, crustalDensity: parseFloat(e.target.value) })
                }
                className="density-slider"
              />
              <input
                type="number"
                min="2.00"
                max="3.50"
                step="0.01"
                value={params.crustalDensity}
                onChange={(e) =>
                  onParamsChange({ ...params, crustalDensity: parseFloat(e.target.value) || 2.67 })
                }
                className="form-control density-number-input"
              />
            </div>
            <div className="field-hint">Standard continental reference crust: 2.67 g/cm³</div>
          </div>

          {/* Ocean Water Density */}
          <div className="density-field">
            <div className="density-label-row">
              <label htmlFor="water-density">
                Ocean Seawater Density (&rho;<sub>w</sub>)
              </label>
              <span className="density-value-badge">{params.waterDensity.toFixed(2)} g/cm³</span>
            </div>
            <div className="slider-input-row">
              <input
                id="water-density"
                type="range"
                min="1.00"
                max="1.06"
                step="0.01"
                value={params.waterDensity}
                onChange={(e) =>
                  onParamsChange({ ...params, waterDensity: parseFloat(e.target.value) })
                }
                className="density-slider"
              />
              <input
                type="number"
                min="0.90"
                max="1.15"
                step="0.01"
                value={params.waterDensity}
                onChange={(e) =>
                  onParamsChange({ ...params, waterDensity: parseFloat(e.target.value) || 1.03 })
                }
                className="form-control density-number-input"
              />
            </div>
            <div className="field-hint">Standard global seawater reference: 1.03 g/cm³</div>
          </div>

          {/* Density Contrast Summary */}
          <div className="density-contrast-box">
            <div className="contrast-header">
              <span>Marine Density Contrast (&Delta;&rho; = &rho;<sub>c</sub> - &rho;<sub>w</sub>)</span>
              <strong>{deltaRho.toFixed(2)} g/cm³</strong>
            </div>
            <div className="formula-box">
              <code>BA = FAA - 0.04193 &bull; ({params.crustalDensity.toFixed(2)} - {params.waterDensity.toFixed(2)}) &bull; h</code>
            </div>
          </div>
        </div>

        {/* Right Column: Comparative Statistics Table */}
        <div className="processing-stats-col">
          <h3 className="control-group-title">
            Sounding Statistics Comparison ({records.length.toLocaleString()} points)
          </h3>

          <div className="stats-cards-grid">
            {/* Topography Card */}
            <div className="stat-card">
              <div className="stat-card-title">Topography / Bathymetry</div>
              <div className="stat-metric-primary">
                {stats.topography.mean.toFixed(1)} <span className="stat-unit">m</span>
              </div>
              <div className="stat-sub-metrics">
                <div>Min: <strong>{stats.topography.min.toFixed(1)} m</strong></div>
                <div>Max: <strong>{stats.topography.max.toFixed(1)} m</strong></div>
                <div>StdDev: <strong>&plusmn;{stats.topography.stdDev.toFixed(1)} m</strong></div>
              </div>
            </div>

            {/* Free Air Anomaly Card */}
            <div className="stat-card">
              <div className="stat-card-title">Free-Air Gravity Anomaly</div>
              <div className="stat-metric-primary">
                {stats.freeAir ? `${stats.freeAir.mean.toFixed(1)}` : 'N/A'}{' '}
                <span className="stat-unit">mGal</span>
              </div>
              {stats.freeAir && (
                <div className="stat-sub-metrics">
                  <div>Min: <strong>{stats.freeAir.min.toFixed(1)} mGal</strong></div>
                  <div>Max: <strong>{stats.freeAir.max.toFixed(1)} mGal</strong></div>
                  <div>StdDev: <strong>&plusmn;{stats.freeAir.stdDev.toFixed(1)} mGal</strong></div>
                </div>
              )}
            </div>

            {/* Complete Bouguer Anomaly Card */}
            <div className="stat-card highlight-bouguer">
              <div className="stat-card-title">Complete Bouguer Anomaly</div>
              <div className="stat-metric-primary text-primary-blue">
                {stats.bouguer ? `${stats.bouguer.mean.toFixed(1)}` : 'N/A'}{' '}
                <span className="stat-unit">mGal</span>
              </div>
              {stats.bouguer && (
                <div className="stat-sub-metrics">
                  <div>Min: <strong>{stats.bouguer.min.toFixed(1)} mGal</strong></div>
                  <div>Max: <strong>{stats.bouguer.max.toFixed(1)} mGal</strong></div>
                  <div>StdDev: <strong>&plusmn;{stats.bouguer.stdDev.toFixed(1)} mGal</strong></div>
                </div>
              )}
            </div>
          </div>

          <div className="scientific-formula-note">
            <Info size={16} />
            <span>
              In ocean basins (h &lt; 0), replacing low-density seawater (&rho;<sub>w</sub>) with standard crustal rock (&rho;<sub>c</sub>) yields a positive Bouguer correction, revealing deep crust-mantle Moho structure.
            </span>
          </div>

          {/* Action Button */}
          <div className="processing-action-bar">
            <button type="button" className="btn-proceed-studio" onClick={onProceedToStudio}>
              <span>Launch 3-Map Studio & Oasis Montaj Suite</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
