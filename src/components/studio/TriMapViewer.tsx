import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ProcessedRecord, BoundingBox } from '@/types';
import { getInterpolatedColor, ColormapName } from '@/utils/geophysics/colormaps';
import { MapColorbar } from './MapColorbar';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { exportMapToPng } from '@/utils/exporters/mapImage';
import { FileCode, Image, Crosshair } from 'lucide-react';

interface TriMapViewerProps {
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

export const TriMapViewer: React.FC<TriMapViewerProps> = ({ records, bounds }) => {
  const [hoveredRecord, setHoveredRecord] = useState<ProcessedRecord | null>(null);

  const canvasTopoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFaaRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBgRef = useRef<HTMLCanvasElement | null>(null);

  // Compute min and max for each dataset
  const [stats, setStats] = useState({
    topo: { min: -6000, max: 2000 },
    faa: { min: -100, max: 100 },
    bg: { min: -50, max: 250 },
  });

  useEffect(() => {
    if (records.length === 0) return;

    let tMin = Infinity, tMax = -Infinity;
    let fMin = Infinity, fMax = -Infinity;
    let bMin = Infinity, bMax = -Infinity;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (r.elevation !== undefined) {
        if (r.elevation < tMin) tMin = r.elevation;
        if (r.elevation > tMax) tMax = r.elevation;
      }

      if (r.gravity !== undefined) {
        if (r.gravity < fMin) fMin = r.gravity;
        if (r.gravity > fMax) fMax = r.gravity;
      }

      if (r.bouguer !== undefined) {
        if (r.bouguer < bMin) bMin = r.bouguer;
        if (r.bouguer > bMax) bMax = r.bouguer;
      }
    }

    setStats({
      topo: { min: tMin === Infinity ? -1000 : tMin, max: tMax === -Infinity ? 1000 : tMax },
      faa: { min: fMin === Infinity ? -50 : fMin, max: fMax === -Infinity ? 50 : fMax },
      bg: { min: bMin === Infinity ? 0 : bMin, max: bMax === -Infinity ? 100 : bMax },
    });
  }, [records]);

  // Render Raster Heatmaps on Canvas
  const drawHeatmap = useCallback(
    (canvas: HTMLCanvasElement | null, getValue: (r: ProcessedRecord) => number | undefined, min: number, max: number, colormap: ColormapName) => {
      if (!canvas || records.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Dark background for oceanic aesthetic
      ctx.fillStyle = '#060b14';
      ctx.fillRect(0, 0, w, h);

      const lonRange = bounds.east - bounds.west || 1;
      const latRange = bounds.north - bounds.south || 1;

      const stepX = Math.max(3, Math.ceil(w / 100));
      const stepY = Math.max(3, Math.ceil(h / 100));

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const val = getValue(r);
        if (val === undefined || isNaN(val)) continue;

        const xNorm = (r.longitude - bounds.west) / lonRange;
        const yNorm = (bounds.north - r.latitude) / latRange;

        const px = Math.round(xNorm * w);
        const py = Math.round(yNorm * h);

        const [red, green, blue] = getInterpolatedColor(val, min, max, colormap);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(px - stepX / 2, py - stepY / 2, stepX, stepY);
      }
    },
    [records, bounds]
  );

  useEffect(() => {
    drawHeatmap(canvasTopoRef.current, (r) => r.elevation, stats.topo.min, stats.topo.max, 'gebco');
    drawHeatmap(canvasFaaRef.current, (r) => r.gravity, stats.faa.min, stats.faa.max, 'coolwarm');
    drawHeatmap(canvasBgRef.current, (r) => r.bouguer, stats.bg.min, stats.bg.max, 'viridis');
  }, [drawHeatmap, stats]);

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
    exportMapToPng({
      title: `TOPEX ${cfg.title}`,
      variable: cfg.id,
      unit: cfg.unit,
      colormap: cfg.colormap,
      bounds,
      records,
    }, `topex_${cfg.id}_map.png`);
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
          <h2 className="studio-title">Tri-Map Geophysical Studio</h2>
          <p className="studio-desc">
            Simultaneous comparative visualization of Topography, Free-Air Gravity, and Complete Bouguer Anomaly.
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
          <MapColorbar
            colormap="gebco"
            min={stats.topo.min}
            max={stats.topo.max}
            unit="m"
            label="Elevation"
          />
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
          <MapColorbar
            colormap="coolwarm"
            min={stats.faa.min}
            max={stats.faa.max}
            unit="mGal"
            label="Free-Air"
          />
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
          <MapColorbar
            colormap="viridis"
            min={stats.bg.min}
            max={stats.bg.max}
            unit="mGal"
            label="Bouguer"
          />
        </div>
      </div>
    </div>
  );
};
