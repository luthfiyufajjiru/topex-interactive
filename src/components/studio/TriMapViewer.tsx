import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ProcessedRecord, BoundingBox, InterpolationMethod, ProfileLine, ProfilePoint } from '@/types';
import { ColormapName } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, renderInterpolatedRasterToCanvas } from '@/utils/geophysics/interpolation';
import { extractProfilePoints } from '@/utils/geophysics/profile';
import { MapColorbar } from './MapColorbar';
import { ProfileGraph } from './ProfileGraph';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { exportMapToPng } from '@/utils/exporters/mapImage';
import { FileCode, Image, Crosshair, SlidersHorizontal, Pin, PinOff } from 'lucide-react';

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
  const [pinnedRecord, setPinnedRecord] = useState<ProcessedRecord | null>(null);
  const [hoveredProfilePoint, setHoveredProfilePoint] = useState<ProfilePoint | null>(null);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('bicubic');

  // Default transect line A -> A' across the center
  const [profileLine, setProfileLine] = useState<ProfileLine>(() => {
    const midLat = (bounds.north + bounds.south) / 2;
    const w = bounds.west + (bounds.east - bounds.west) * 0.1;
    const e = bounds.west + (bounds.east - bounds.west) * 0.9;
    return {
      start: { lat: midLat, lon: w },
      end: { lat: midLat, lon: e },
    };
  });

  const canvasTopoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFaaRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBgRef = useRef<HTMLCanvasElement | null>(null);

  // Active inspected record
  const activeRecord = pinnedRecord || hoveredRecord;

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

  // Extract Profile Points along line
  const profilePoints = useMemo(() => {
    return extractProfilePoints(profileLine, gridTopo, gridFaa, gridBg, bounds, interpolationMethod, 120);
  }, [profileLine, gridTopo, gridFaa, gridBg, bounds, interpolationMethod]);

  // Set Profile Line Presets
  const handleSetPresetLine = (preset: 'we' | 'ns' | 'diag1' | 'diag2') => {
    const midLat = (bounds.north + bounds.south) / 2;
    const midLon = (bounds.west + bounds.east) / 2;
    const padLat = (bounds.north - bounds.south) * 0.1;
    const padLon = (bounds.east - bounds.west) * 0.1;

    switch (preset) {
      case 'we': // West to East
        setProfileLine({
          start: { lat: midLat, lon: bounds.west + padLon },
          end: { lat: midLat, lon: bounds.east - padLon },
        });
        break;
      case 'ns': // North to South
        setProfileLine({
          start: { lat: bounds.north - padLat, lon: midLon },
          end: { lat: bounds.south + padLat, lon: midLon },
        });
        break;
      case 'diag1': // SW to NE
        setProfileLine({
          start: { lat: bounds.south + padLat, lon: bounds.west + padLon },
          end: { lat: bounds.north - padLat, lon: bounds.east - padLon },
        });
        break;
      case 'diag2': // NW to SE
        setProfileLine({
          start: { lat: bounds.north - padLat, lon: bounds.west + padLon },
          end: { lat: bounds.south + padLat, lon: bounds.east - padLon },
        });
        break;
    }
  };

  // Draw Crosshair Marker and Transect Line on Canvas
  const drawOverlayElements = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const lonRange = bounds.east - bounds.west || 1;
    const latRange = bounds.north - bounds.south || 1;

    // 1. Draw Transect Line A -> A'
    const xA = ((profileLine.start.lon - bounds.west) / lonRange) * w;
    const yA = ((bounds.north - profileLine.start.lat) / latRange) * h;
    const xB = ((profileLine.end.lon - bounds.west) / lonRange) * w;
    const yB = ((bounds.north - profileLine.end.lat) / latRange) * h;

    ctx.save();
    // Glowing underlay
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();

    // Main transect line
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(xA, yA);
    ctx.lineTo(xB, yB);
    ctx.stroke();
    ctx.setLineDash([]);

    // Endpoint A badge
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(xA, yA, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText('A', xA - 12, yA - 4);

    // Endpoint A' badge
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(xB, yB, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText("A'", xB + 6, yB - 4);

    // 2. If hovering over Profile Graph, highlight tracking point on map
    if (hoveredProfilePoint) {
      const xTrack = ((hoveredProfilePoint.longitude - bounds.west) / lonRange) * w;
      const yTrack = ((bounds.north - hoveredProfilePoint.latitude) / latRange) * h;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xTrack, yTrack, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 3. Draw active target reticle if soundings probe active
    if (activeRecord) {
      const px = Math.round(((activeRecord.longitude - bounds.west) / lonRange) * w);
      const py = Math.round(((bounds.north - activeRecord.latitude) / latRange) * h);

      // Outer ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();

      // Cross lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 11, py);
      ctx.lineTo(px - 4, py);
      ctx.moveTo(px + 4, py);
      ctx.lineTo(px + 11, py);
      ctx.moveTo(px, py - 11);
      ctx.lineTo(px, py - 4);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px, py + 11);
      ctx.stroke();
    }

    ctx.restore();
  };

  // Render Raster Heatmaps on Canvas using Selected Interpolation
  const renderAllCanvases = useCallback(() => {
    if (canvasTopoRef.current && gridTopo) {
      renderInterpolatedRasterToCanvas(canvasTopoRef.current, gridTopo, 'gebco', interpolationMethod);
      drawOverlayElements(canvasTopoRef.current);
    }
    if (canvasFaaRef.current && gridFaa) {
      renderInterpolatedRasterToCanvas(canvasFaaRef.current, gridFaa, 'coolwarm', interpolationMethod);
      drawOverlayElements(canvasFaaRef.current);
    }
    if (canvasBgRef.current && gridBg) {
      renderInterpolatedRasterToCanvas(canvasBgRef.current, gridBg, 'viridis', interpolationMethod);
      drawOverlayElements(canvasBgRef.current);
    }
  }, [gridTopo, gridFaa, gridBg, interpolationMethod, activeRecord, profileLine, hoveredProfilePoint]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

  // Find nearest sounding to a mouse coordinate
  const findNearestSounding = (e: React.MouseEvent<HTMLCanvasElement>): ProcessedRecord | null => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;

    const lon = bounds.west + xNorm * (bounds.east - bounds.west);
    const lat = bounds.north - yNorm * (bounds.north - bounds.south);

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

    return nearest;
  };

  // Synchronized Mouse Move Probe
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pinnedRecord) return;
    const nearest = findNearestSounding(e);
    setHoveredRecord(nearest);
  };

  // Interactive Click to Pin / Lock Sounding Point
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const nearest = findNearestSounding(e);
    if (nearest) {
      if (pinnedRecord && pinnedRecord.latitude === nearest.latitude && pinnedRecord.longitude === nearest.longitude) {
        setPinnedRecord(null);
      } else {
        setPinnedRecord(nearest);
      }
    }
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
            Multi-field comparative analysis of Topography, Free-Air, and Complete Bouguer anomalies with real-time spatial interpolation and 2D cross-section profiling.
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

      {/* Interpolation Control Dropdown Toolbar */}
      <div className="interpolation-toolbar-card">
        <div className="interp-label-group">
          <SlidersHorizontal size={17} className="text-primary-blue" />
          <span className="interp-title">Spatial Interpolation Filter:</span>
        </div>

        <div className="interp-select-wrapper">
          <select
            id="interp-method-select"
            className="form-control interp-select"
            value={interpolationMethod}
            onChange={(e) => setInterpolationMethod(e.target.value as InterpolationMethod)}
          >
            <option value="bicubic">Bicubic Spline (Continuous 1st Derivatives — Standard Potential Field)</option>
            <option value="spline">Thin Plate Spline (Minimum Curvature Harmonic Surface)</option>
            <option value="bilinear">Bilinear (2D Linear Mesh)</option>
            <option value="idw">Inverse Distance Weighting (IDW Power 2)</option>
            <option value="nearest">Nearest Neighbor (Raw Discrete Soundings)</option>
          </select>
        </div>
      </div>

      {/* Synchronized Probe HUD (Hover or Click to Pin) */}
      <div className={`probe-hud-card ${pinnedRecord ? 'is-pinned' : ''}`}>
        <div className="probe-icon-label">
          {pinnedRecord ? (
            <div className="pin-badge">
              <Pin size={15} className="text-emerald animate-bounce" />
              <span>Pinned Target:</span>
            </div>
          ) : (
            <div className="probe-badge">
              <Crosshair size={17} className="text-primary-blue animate-pulse" />
              <span>Probe Sounding:</span>
            </div>
          )}
        </div>

        {activeRecord ? (
          <div className="probe-values-row">
            <div className="probe-val-item">
              <span className="probe-key">Coordinate:</span>
              <strong>{activeRecord.latitude.toFixed(4)}°, {activeRecord.longitude.toFixed(4)}°</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Topography:</span>
              <strong className="text-emerald">{activeRecord.elevation?.toFixed(1) ?? 'N/A'} m</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Free-Air:</span>
              <strong className="text-sky">{activeRecord.gravity?.toFixed(1) ?? 'N/A'} mGal</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Bouguer:</span>
              <strong className="text-amber">{activeRecord.bouguer?.toFixed(1) ?? 'N/A'} mGal</strong>
            </div>
            <div className="probe-val-item">
              <span className="probe-key">Slab Correction:</span>
              <span style={{ color: '#94a3b8' }}>{activeRecord.slabCorrection?.toFixed(1) ?? 'N/A'} mGal</span>
            </div>

            {pinnedRecord && (
              <button
                type="button"
                className="btn-unpin"
                onClick={() => setPinnedRecord(null)}
                title="Unpin target and resume hover probing"
              >
                <PinOff size={13} />
                <span>Unpin</span>
              </button>
            )}
          </div>
        ) : (
          <div className="probe-placeholder">
            Click or hover on any of the 3 maps to inspect and pin synchronized values across all datasets.
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
              onClick={handleCanvasClick}
              onMouseLeave={() => !pinnedRecord && setHoveredRecord(null)}
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
              onClick={handleCanvasClick}
              onMouseLeave={() => !pinnedRecord && setHoveredRecord(null)}
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
              onClick={handleCanvasClick}
              onMouseLeave={() => !pinnedRecord && setHoveredRecord(null)}
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

      {/* 2D Geophysical Cross-Section Profile Graph */}
      <ProfileGraph
        points={profilePoints}
        line={profileLine}
        hoveredPoint={hoveredProfilePoint}
        onHoverPoint={setHoveredProfilePoint}
        onSetPresetLine={handleSetPresetLine}
      />
    </div>
  );
};
