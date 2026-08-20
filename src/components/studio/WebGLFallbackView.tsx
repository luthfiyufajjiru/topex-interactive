import React from 'react';
import type { ProcessedRecord, BoundingBox } from '@/types';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { MonitorX, Download, FileCode, ArrowLeft, Database, ShieldAlert } from 'lucide-react';

interface WebGLFallbackViewProps {
  records: ProcessedRecord[];
  bounds: BoundingBox;
  reason?: string;
  onBackToExtract: () => void;
}

export const WebGLFallbackView: React.FC<WebGLFallbackViewProps> = ({
  records,
  bounds,
  reason,
  onBackToExtract,
}) => {
  // Export CSV
  const handleDownloadCsv = () => {
    const headers = ['latitude', 'longitude', 'elevation_m', 'faa_mgal', 'bouguer_mgal'];
    const lines = [headers.join(',')];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const elev = r.elevation !== undefined ? r.elevation.toFixed(2) : '0.00';
      const faa = r.gravity !== undefined ? r.gravity.toFixed(2) : '0.00';
      const bg = r.bouguer !== undefined ? r.bouguer.toFixed(2) : '0.00';
      lines.push(
        `${r.latitude.toFixed(5)},${r.longitude.toFixed(5)},${elev},${faa},${bg}`
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topex_soundings_${bounds.north}_${bounds.south}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export JSON
  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topex_soundings_${bounds.north}_${bounds.south}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="webgl-fallback-container">
      <div className="webgl-fallback-card">
        <div className="webgl-fallback-icon-wrapper">
          <MonitorX size={48} className="text-amber-500" />
        </div>

        <h2 className="webgl-fallback-title">Hardware Graphics Acceleration Required</h2>

        <p className="webgl-fallback-desc">
          Your browser or device does not meet the minimum WebGL hardware acceleration standard required to compute and render real-time interactive 2D potential field raster heatmaps.
        </p>

        {reason && (
          <div className="webgl-fallback-reason-box">
            <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
            <span>{reason}</span>
          </div>
        )}

        <div className="webgl-fallback-stats">
          <Database size={16} className="text-primary-blue" />
          <span>
            <strong>{records.length.toLocaleString()}</strong> processed soundings are safely loaded and ready for direct export.
          </span>
        </div>

        {/* Direct Download Suite */}
        <div className="webgl-fallback-downloads-grid">
          <button
            type="button"
            className="btn-fallback-download primary"
            onClick={handleDownloadCsv}
          >
            <Download size={18} />
            <div>
              <div className="btn-dl-title">Download Soundings (.CSV)</div>
              <div className="btn-dl-sub">Full dataset with Topo, FAA & Bouguer</div>
            </div>
          </button>

          <button
            type="button"
            className="btn-fallback-download"
            onClick={() => exportToOasisMontajXYZ(records)}
          >
            <FileCode size={18} />
            <div>
              <div className="btn-dl-title">Oasis Montaj (.XYZ)</div>
              <div className="btn-dl-sub">Industry-standard Geosoft XYZ format</div>
            </div>
          </button>

          <button
            type="button"
            className="btn-fallback-download"
            onClick={() => exportToGeosoftGXF(records, bounds, 'bouguer')}
          >
            <FileCode size={18} />
            <div>
              <div className="btn-dl-title">Geosoft Grid (.GXF)</div>
              <div className="btn-dl-sub">Complete Bouguer Anomaly Grid</div>
            </div>
          </button>

          <button
            type="button"
            className="btn-fallback-download"
            onClick={handleDownloadJson}
          >
            <FileCode size={18} />
            <div>
              <div className="btn-dl-title">Raw JSON Package (.JSON)</div>
              <div className="btn-dl-sub">Structured array for Python / MATLAB</div>
            </div>
          </button>
        </div>

        <div className="webgl-fallback-actions">
          <button
            type="button"
            className="btn-fallback-back"
            onClick={onBackToExtract}
          >
            <ArrowLeft size={16} />
            <span>Return to Grid Extractor</span>
          </button>
        </div>
      </div>
    </div>
  );
};
