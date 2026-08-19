import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ProcessedRecord, BoundingBox, InterpolationMethod } from '@/types';
import { ColormapName } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, renderInterpolatedRasterToCanvas } from '@/utils/geophysics/interpolation';
import { MapColorbar } from './MapColorbar';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { exportMapToPng } from '@/utils/exporters/mapImage';
import { FileCode, Image, Crosshair, Sparkles, SlidersHorizontal } from 'lucide-react';

interface SatelliteGravityStudioProps {
  records: ProcessedRecord[];
  bounds: BoundingBox;
}

interface MapConfig {
  id: 'topography' | 'freeAir' | 'bouguer';
  title: string;
  unit: string;
  colormap: ColormapName;
  getValue: (r: ProcessedRecord) => number | undefined;
}

export const TriMapViewer: React.FC<SatelliteGravityStudioProps> = ({ records, bounds }) => {
  const [hoveredRecord, setHoveredRecord] = useState<ProcessedRecord | null>(null);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('bicubic');

  const canvasTopoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFaaRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBgRef = useRef<HTMLCanvasElement | null>(null);

  // Build Regular Grids for each variable
  const gridTopo = useMemo(
    () => buildRegularGrid(records, bounds, (r) => r.elevation),
    [records, bounds]
  );
  const gridFaa = useMemo(
    () => buildRegularGrid(records, bounds, (r) => r.gravity),
    [records, bounds]
  );
  const gridBg = useMemo(
    () => buildRegularGrid(records, bounds, (r) => r.bouguer),
    [records, bounds]
  );

  // Render Raster Heatmaps on Canvas using Selected Interpolation
  const renderAllCanvases = useCallback(() => {
    if (canvasTopoRef.current && gridTopo) {
      renderInterpolatedRasterToCanvas(canvasTopoRef.current, gridTopo, 'gebco', interpolationMethod);
    }
    if (canvasFaaRef.current && gridFaa) {
      renderInterpolatedRasterToCanvas(canvasFaaRef.current, gridFaa, 'coolwarm', interpolationMethod);
    }
    if (canvasBgRef.current && gridBg) {
      renderInterpolatedRasterToCanvas(canvasBgRef.current, gridBg, 'viridis', interpolationMethod);
    }
  }, [gridTopo, gridFaa, gridBg, interpolationMethod]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  // Synchronized Mouse Probe
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;

    const lon = bounds.west + xNorm * (bounds.east - bounds.west);
    const lat = bounds.north - yNorm * (bounds.north - bounds.south);

    // Find nearest sounding
    let nearest: ProcessedRecord | null = null;
    let minDist = Infinity;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const dist = (r.latitude - lat) ** 2 + (r.longitude - lon) ** 2;
      if (dist < minDist) {
        minDist = dist;
        nearest = r;
      }
    }

    setHoveredRecord(nearest);
  };

  const handleExportMap = (cfg: MapConfig) => {
    exportMapToPng(
      {
        title: `TOPEX ${cfg.title}`,
        variable: cfg.id,
        unit: cfg.unit,
        colormap: cfg.colormap,
        interpolationMethod,
        bounds,
        records,
      },
      `topex_${cfg.id}_${interpolationMethod}_map.png`
    );
  };

  const mapConfigs: MapConfig[] = [
    {
      id: 'topography',
      title: 'Topography / Bathymetry',
      unit: 'm',
      colormap: 'gebco',
      getValue: (r) => r.elevation,
    },
    {
      id: 'freeAir',
      title: 'Free-Air Gravity Anomaly',
      unit: 'mGal',
      colormap: 'coolwarm',
      getValue: (r) => r.gravity,
    },
    {
      id: 'bouguer',
      title: 'Complete Bouguer Anomaly',
      unit: 'mGal',
      colormap: 'viridis',
      getValue: (r) => r.bouguer,
    },
  ];

  return (
    <div className="trimap-studio-container">
      {/* Studio Header & Global Exporters */}
      <div className="studio-header">
        <div>
          <div className="studio-badge-row">
            <h2 className="studio-title">Satellite Gravity Studio</h2>
            <span className="badge-live-geophysics">Live Geophysics</span>
          </div>
          <p className="studio-desc">
            Simultaneous comparative visualization of Topography, Free-Air Gravity, and Complete Bouguer Anomaly with scientific interpolation.
          </p>
        </div>

        {/* Oasis Montaj & High-Res Export Suite */}
        <div className="studio-export-suite">
          <button
            type="button"
            className="btn-export-oasis"
            onClick={() => exportToOasisMontajXYZ(records)}
            title="Download Oasis Montaj Geosoft XYZ File"
          >
            <FileCode size={16} />
            <span>Oasis Montaj (.XYZ)</span>
          </button>

          <button
            type="button"
            className="btn-export-gxf"
            onClick={() => exportToGeosoftGXF(records, bounds, 'bouguer')}
            title="Download Geosoft Grid File (.gxf)"
          >
            <FileCode size={16} />
            <span>Geosoft Grid (.GXF)</span>
          </button>
        </div>
      </div>

      {/* Interpolation Control Toolbar */}
      <div className="interpolation-toolbar-card">
        <div className="interp-label-group">
          <SlidersHorizontal size={17} className="text-primary-blue" />
          <span className="interp-title">Spatial Interpolation Filter:</span>
        </div>

        <div className="interp-options-group">
          <button
            type="button"
            className={`btn-interp-option ${interpolationMethod === 'bicubic' ? 'active' : ''}`}
            onClick={() => setInterpolationMethod('bicubic')}
            title="Bicubic Hermite/Catmull-Rom Spline (Continuous 1st derivatives, standard potential field)"
          >
            <Sparkles size={14} />
            <span>Bicubic Spline</span>
          </button>

          <button
            type="button"
            className={`btn-interp-option ${interpolationMethod === 'spline' ? 'active' : ''}`}
            onClick={() => setInterpolationMethod('spline')}
            title="Thin Plate Spline / Minimum Curvature (Harmonic potential field surface)"
          >
            <span>Thin Plate Spline</span>
          </button>

          <button
            type="button"
            className={`btn-interp-option ${interpolationMethod === 'bilinear' ? 'active' : ''}`}
            onClick={() => setInterpolationMethod('bilinear')}
            title="Bilinear 2D Linear Mesh"
          >
            <span>Bilinear</span>
          </button>

          <button
            type="button"
            className={`btn-interp-option ${interpolationMethod === 'idw' ? 'active' : ''}`}
            onClick={() => setInterpolationMethod('idw')}
            title="Inverse Distance Weighting (IDW Power 2)"
          >
            <span>IDW</span>
          </button>

          <button
            type="button"
            className={`btn-interp-option ${interpolationMethod === 'nearest' ? 'active' : ''}`}
            onClick={() => setInterpolationMethod('nearest')}
            title="Nearest Neighbor (Discrete raw sounding points)"
          >
            <span>Nearest (Raw)</span>
          </button>
        </div>
      </div>

      {/* Synchronized Hover Probe HUD */}
      <div className="probe-hud-card">
        <div className="probe-icon-label">
          <Crosshair size={18} className="text-primary-blue animate-pulse" />
          <span>Synchronized Probe:</span>
        </div>
        {hoveredRecord ? (
          <div className="probe-values-row">
            <div className="probe-val-item">
              <span className="probe-key">Lat / Lon:</span>
              <strong>{hoveredRecord.latitude.toFixed(4)}°, {hoveredRecord.longitude.toFixed(4)}°</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Topography:</span>
              <strong className="text-emerald">{hoveredRecord.elevation?.toFixed(1) ?? 'N/A'} m</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Free-Air:</span>
              <strong className="text-sky">{hoveredRecord.gravity?.toFixed(1) ?? 'N/A'} mGal</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Bouguer:</span>
              <strong className="text-amber">{hoveredRecord.bouguer?.toFixed(1) ?? 'N/A'} mGal</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Slab Correction:</span>
              <span style={{ color: '#94a3b8' }}>{hoveredRecord.slabCorrection?.toFixed(1) ?? 'N/A'} mGal</span>
            </div>
          </div>
        ) : (
          <div className="probe-placeholder">
            Hover over any of the 3 maps to probe synchronized values across all datasets.
          </div>
        )}
      </div>

      {/* 3 Map Viewports Grid */}
      <div className="trimap-grid">
        {/* Map 1: Topography */}
        <div className="map-view-card">
          <div className="map-view-header">
            <div className="map-view-title">Topography / Bathymetry</div>
            <button
              type="button"
              className="btn-map-save-png"
              onClick={() => handleExportMap(mapConfigs[0])}
              title="Export Topography Map as PNG"
            >
              <Image size={14} />
              <span>Save PNG</span>
            </button>
          </div>
          <div className="canvas-wrapper">
            <canvas
              ref={canvasTopoRef}
              width={480}
              height={360}
              className="raster-canvas"
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredRecord(null)}
            />
          </div>
          {gridTopo && (
            <MapColorbar
              colormap="gebco"
              min={gridTopo.minVal}
              max={gridTopo.maxVal}
              unit="m"
              label="Elevation"
            />
          )}
        </div>

        {/* Map 2: Free Air Anomaly */}
        <div className="map-view-card">
          <div className="map-view-header">
            <div className="map-view-title">Free-Air Gravity Anomaly</div>
            <button
              type="button"
              className="btn-map-save-png"
              onClick={() => handleExportMap(mapConfigs[1])}
              title="Export Free-Air Map as PNG"
            >
              <Image size={14} />
              <span>Save PNG</span>
            </button>
          </div>
          <div className="canvas-wrapper">
            <canvas
              ref={canvasFaaRef}
              width={480}
              height={360}
              className="raster-canvas"
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredRecord(null)}
            />
          </div>
          {gridFaa && (
            <MapColorbar
              colormap="coolwarm"
              min={gridFaa.minVal}
              max={gridFaa.maxVal}
              unit="mGal"
              label="Free-Air"
            />
          )}
        </div>

        {/* Map 3: Bouguer Anomaly */}
        <div className="map-view-card highlight-border">
          <div className="map-view-header">
            <div className="map-view-title text-primary-blue">Complete Bouguer Anomaly</div>
            <button
              type="button"
              className="btn-map-save-png"
              onClick={() => handleExportMap(mapConfigs[2])}
              title="Export Bouguer Map as PNG"
            >
              <Image size={14} />
              <span>Save PNG</span>
            </button>
          </div>
          <div className="canvas-wrapper">
            <canvas
              ref={canvasBgRef}
              width={480}
              height={360}
              className="raster-canvas"
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={() => setHoveredRecord(null)}
            />
          </div>
          {gridBg && (
            <MapColorbar
              colormap="viridis"
              min={gridBg.minVal}
              max={gridBg.maxVal}
              unit="mGal"
              label="Bouguer"
            />
          )}
        </div>
      </div>
    </div>
  );
};
