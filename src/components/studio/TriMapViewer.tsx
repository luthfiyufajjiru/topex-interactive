import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ProcessedRecord, BoundingBox, BouguerParams, InterpolationMethod, NamedProfileLine, ProfilePoint } from '@/types';
import { ColormapName } from '@/utils/geophysics/colormaps';
import { buildRegularGrid, renderInterpolatedRasterToCanvas } from '@/utils/geophysics/interpolation';
import { extractProfilePoints } from '@/utils/geophysics/profile';
import { MapColorbar } from './MapColorbar';
import { ProfileGraph } from './ProfileGraph';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { exportMapToPng } from '@/utils/exporters/mapImage';
import { exportCompositeReportImage } from '@/utils/exporters/compositeReport';
import { ExportSuiteModal } from './ExportSuiteModal';
import { FileCode, Image, Crosshair, SlidersHorizontal, Pin, PinOff, Move, LayoutGrid, PackageCheck } from 'lucide-react';

interface SatelliteGravityStudioProps {
  records: ProcessedRecord[];
  bounds: BoundingBox;
  bouguerParams?: BouguerParams;
}

interface MapConfig {
  id: 'topography' | 'freeAir' | 'bouguer';
  title: string;
  unit: string;
  colormap: ColormapName;
  getValue: (r: ProcessedRecord) => number | undefined;
}

const LINE_COLORS = ['#f59e0b', '#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f97316'];
const LINE_LETTERS = [
  ['A', "A'"],
  ['B', "B'"],
  ['C', "C'"],
  ['D', "D'"],
  ['E', "E'"],
  ['F', "F'"],
  ['G', "G'"],
  ['H', "H'"],
];

export const TriMapViewer: React.FC<SatelliteGravityStudioProps> = ({
  records,
  bounds,
  bouguerParams = { crustalDensity: 2.67, waterDensity: 1.03, includeCurvatureBullardB: false },
}) => {
  const [hoveredRecord, setHoveredRecord] = useState<ProcessedRecord | null>(null);
  const [pinnedRecord, setPinnedRecord] = useState<ProcessedRecord | null>(null);
  const [hoveredProfilePoint, setHoveredProfilePoint] = useState<ProfilePoint | null>(null);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('bicubic');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Interactive Dragging State for Profile Line
  const [draggingMode, setDraggingMode] = useState<'start' | 'end' | 'draw' | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');

  // Initial Multi-Line Profiles
  const [lines, setLines] = useState<NamedProfileLine[]>(() => {
    const midLat = (bounds.north + bounds.south) / 2;
    const midLon = (bounds.west + bounds.east) / 2;
    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;

    return [
      {
        id: 'line-1',
        name: 'Line 1',
        labelStart: 'A',
        labelEnd: "A'",
        color: '#f59e0b',
        start: { lat: midLat, lon: bounds.west + lonSpan * 0.1 },
        end: { lat: midLat, lon: bounds.east - lonSpan * 0.1 },
      },
      {
        id: 'line-2',
        name: 'Line 2',
        labelStart: 'B',
        labelEnd: "B'",
        color: '#10b981',
        start: { lat: bounds.north - latSpan * 0.25, lon: bounds.west + lonSpan * 0.15 },
        end: { lat: bounds.north - latSpan * 0.25, lon: bounds.east - lonSpan * 0.15 },
      },
      {
        id: 'line-3',
        name: 'Line 3',
        labelStart: 'C',
        labelEnd: "C'",
        color: '#0284c7',
        start: { lat: bounds.north - latSpan * 0.1, lon: midLon },
        end: { lat: bounds.south + latSpan * 0.1, lon: midLon },
      },
    ];
  });

  const [activeLineId, setActiveLineId] = useState<string>('line-1');

  // Active line
  const activeLine = useMemo(() => {
    return lines.find((l) => l.id === activeLineId) || lines[0];
  }, [lines, activeLineId]);

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

  // Extract Profile Points for active line
  const profilePoints = useMemo(() => {
    return extractProfilePoints(
      { start: activeLine.start, end: activeLine.end },
      gridTopo,
      gridFaa,
      gridBg,
      bounds,
      interpolationMethod,
      120
    );
  }, [activeLine, gridTopo, gridFaa, gridBg, bounds, interpolationMethod]);

  // Add new Profile Line
  const handleAddLine = () => {
    const nextIdx = lines.length;
    const letterPair = LINE_LETTERS[nextIdx % LINE_LETTERS.length];
    const color = LINE_COLORS[nextIdx % LINE_COLORS.length];
    const latSpan = bounds.north - bounds.south;
    const lonSpan = bounds.east - bounds.west;
    const offsetFactor = 0.1 + (nextIdx * 0.15) % 0.6;

    const newLine: NamedProfileLine = {
      id: `line-${Date.now()}`,
      name: `Line ${nextIdx + 1}`,
      labelStart: letterPair[0],
      labelEnd: letterPair[1],
      color,
      start: {
        lat: bounds.south + latSpan * offsetFactor,
        lon: bounds.west + lonSpan * 0.1,
      },
      end: {
        lat: bounds.south + latSpan * offsetFactor,
        lon: bounds.east - lonSpan * 0.1,
      },
    };

    setLines([...lines, newLine]);
    setActiveLineId(newLine.id);
  };

  // Delete Profile Line
  const handleDeleteLine = (id: string) => {
    if (lines.length <= 1) return;
    const remaining = lines.filter((l) => l.id !== id);
    setLines(remaining);
    if (activeLineId === id) {
      setActiveLineId(remaining[0].id);
    }
  };

  // Set Profile Line Presets on Active Line
  const handleSetPresetLine = (preset: 'we' | 'ns' | 'diag1' | 'diag2') => {
    const midLat = (bounds.north + bounds.south) / 2;
    const midLon = (bounds.west + bounds.east) / 2;
    const padLat = (bounds.north - bounds.south) * 0.1;
    const padLon = (bounds.east - bounds.west) * 0.1;

    let newStart = { lat: midLat, lon: bounds.west + padLon };
    let newEnd = { lat: midLat, lon: bounds.east - padLon };

    switch (preset) {
      case 'we':
        newStart = { lat: midLat, lon: bounds.west + padLon };
        newEnd = { lat: midLat, lon: bounds.east - padLon };
        break;
      case 'ns':
        newStart = { lat: bounds.north - padLat, lon: midLon };
        newEnd = { lat: bounds.south + padLat, lon: midLon };
        break;
      case 'diag1':
        newStart = { lat: bounds.south + padLat, lon: bounds.west + padLon };
        newEnd = { lat: bounds.north - padLat, lon: bounds.east - padLon };
        break;
      case 'diag2':
        newStart = { lat: bounds.north - padLat, lon: bounds.west + padLon };
        newEnd = { lat: bounds.south + padLat, lon: bounds.east - padLon };
        break;
    }

    setLines(
      lines.map((l) => (l.id === activeLineId ? { ...l, start: newStart, end: newEnd } : l))
    );
  };

  // Convert client mouse event to Lat/Lon
  const getLatLonFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yNorm = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const lon = bounds.west + xNorm * (bounds.east - bounds.west);
    const lat = bounds.north - yNorm * (bounds.north - bounds.south);
    return { lat, lon, xNorm, yNorm, rect };
  };

  // Check proximity to endpoints
  const getEndpointProximity = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { xNorm, yNorm, rect } = getLatLonFromEvent(e);
    const lonRange = bounds.east - bounds.west || 1;
    const latRange = bounds.north - bounds.south || 1;

    const px = xNorm * rect.width;
    const py = yNorm * rect.height;

    const xA = ((activeLine.start.lon - bounds.west) / lonRange) * rect.width;
    const yA = ((bounds.north - activeLine.start.lat) / latRange) * rect.height;
    const distA = Math.sqrt((px - xA) ** 2 + (py - yA) ** 2);

    const xB = ((activeLine.end.lon - bounds.west) / lonRange) * rect.width;
    const yB = ((bounds.north - activeLine.end.lat) / latRange) * rect.height;
    const distB = Math.sqrt((px - xB) ** 2 + (py - yB) ** 2);

    if (distA <= 16) return 'start';
    if (distB <= 16) return 'end';
    return null;
  };

  // Interactive Mouse Down on Map Canvas (Drag Endpoint or Freehand Draw)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const endpoint = getEndpointProximity(e);
    const { lat, lon } = getLatLonFromEvent(e);

    if (endpoint === 'start') {
      setDraggingMode('start');
      setCursorStyle('grabbing');
    } else if (endpoint === 'end') {
      setDraggingMode('end');
      setCursorStyle('grabbing');
    } else {
      // Click-and-drag to freely draw a new line transect from this location
      setDraggingMode('draw');
      setCursorStyle('crosshair');
      setLines(
        lines.map((l) =>
          l.id === activeLineId
            ? { ...l, start: { lat, lon }, end: { lat, lon } }
            : l
        )
      );
    }
  };

  // Interactive Mouse Move on Map Canvas
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { lat, lon } = getLatLonFromEvent(e);

    if (draggingMode === 'start') {
      setLines(
        lines.map((l) => (l.id === activeLineId ? { ...l, start: { lat, lon } } : l))
      );
      return;
    } else if (draggingMode === 'end' || draggingMode === 'draw') {
      setLines(
        lines.map((l) => (l.id === activeLineId ? { ...l, end: { lat, lon } } : l))
      );
      return;
    }

    // Hover cursor feedback
    const endpoint = getEndpointProximity(e);
    if (endpoint) {
      setCursorStyle('grab');
    } else {
      setCursorStyle('crosshair');
    }

    // Sounding Probe
    if (!pinnedRecord) {
      const nearest = findNearestSounding(lat, lon);
      setHoveredRecord(nearest);
    }
  };

  // Mouse Up: Commit line
  const handleCanvasMouseUp = () => {
    setDraggingMode(null);
    setCursorStyle('crosshair');
  };

  // Find nearest sounding to coordinate
  const findNearestSounding = (lat: number, lon: number): ProcessedRecord | null => {
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

  // Interactive Click to Pin / Lock Sounding Point (only when not dragging line)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingMode) return;
    const { lat, lon } = getLatLonFromEvent(e);
    const nearest = findNearestSounding(lat, lon);
    if (nearest) {
      if (pinnedRecord && pinnedRecord.latitude === nearest.latitude && pinnedRecord.longitude === nearest.longitude) {
        setPinnedRecord(null);
      } else {
        setPinnedRecord(nearest);
      }
    }
  };

  // Draw Overlay Elements on Canvas
  const drawOverlayElements = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const lonRange = bounds.east - bounds.west || 1;
    const latRange = bounds.north - bounds.south || 1;

    ctx.save();

    // 1. Draw ALL Profile Lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLineActive = line.id === activeLineId;

      const xA = ((line.start.lon - bounds.west) / lonRange) * w;
      const yA = ((bounds.north - line.start.lat) / latRange) * h;
      const xB = ((line.end.lon - bounds.west) / lonRange) * w;
      const yB = ((bounds.north - line.end.lat) / latRange) * h;

      if (isLineActive) {
        // Glowing underlay
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.stroke();

        // Main active line
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Endpoint A handle
        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(xA, yA, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(line.labelStart, xA - 14, yA - 6);

        // Endpoint A' handle
        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(xB, yB, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.fillText(line.labelEnd, xB + 8, yB - 6);
      } else {
        // Inactive line
        ctx.strokeStyle = line.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = line.color;
        ctx.beginPath();
        ctx.arc(xA, yA, 4, 0, Math.PI * 2);
        ctx.arc(xB, yB, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Tracking point along line
    if (hoveredProfilePoint) {
      const xTrack = ((hoveredProfilePoint.longitude - bounds.west) / lonRange) * w;
      const yTrack = ((bounds.north - hoveredProfilePoint.latitude) / latRange) * h;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xTrack, yTrack, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = activeLine.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 3. Active target reticle
    if (activeRecord) {
      const px = Math.round(((activeRecord.longitude - bounds.west) / lonRange) * w);
      const py = Math.round(((bounds.north - activeRecord.latitude) / latRange) * h);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();

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

  // Render Raster Heatmaps on Canvas
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
  }, [gridTopo, gridFaa, gridBg, interpolationMethod, activeRecord, lines, activeLineId, hoveredProfilePoint, draggingMode]);

  useEffect(() => {
    renderAllCanvases();
  }, [renderAllCanvases]);

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
        activeLine,
      },
      `topex_${cfg.id}_${interpolationMethod}_map.png`
    );
  };

  // Export Full Suite Composite Single Image Report
  const handleExportFullSuiteImage = () => {
    exportCompositeReportImage({
      records,
      bounds,
      params: bouguerParams,
      lines,
      activeLine,
      profilePoints,
      activePoint: hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null),
      interpolationMethod,
    });
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
            Multi-field comparative analysis of Topography, Free-Air, and Complete Bouguer anomalies with real-time spatial interpolation, freely drawable 2D cross-section profiling, and full export suites.
          </p>
        </div>

        {/* Oasis Montaj & High-Res Export Suite */}
        <div className="studio-export-suite">
          {/* Checkbox Package Center Dialog Button */}
          <button
            type="button"
            className="btn-export-suite-modal"
            onClick={() => setIsExportModalOpen(true)}
            title="Open Geophysical Suite Export Center to pick datasets, grids, and reports"
          >
            <PackageCheck size={16} />
            <span>Export Suite (.ZIP)...</span>
          </button>

          {/* Full Suite Composite Single Image Report Button */}
          <button
            type="button"
            className="btn-export-full-suite"
            onClick={handleExportFullSuiteImage}
            title="Download complete single-image geophysical report plate (3 Maps + 2D Profile + Metadata in 1 Picture)"
          >
            <LayoutGrid size={16} />
            <span>Full Report (PNG)</span>
          </button>

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

      {/* Interpolation Control Dropdown Toolbar & Interactive Drawing Hint */}
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

        <div className="transect-drag-hint">
          <Move size={14} className="text-primary-blue" />
          <span>Click and drag on any map to freely draw or adjust cross-section transect ({activeLine.labelStart} &rarr; {activeLine.labelEnd})</span>
        </div>
      </div>

      {/* Synchronized Probe HUD */}
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
              <span style={{ color: '#64748b' }}>{activeRecord.slabCorrection?.toFixed(1) ?? 'N/A'} mGal</span>
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
            Click on any of the 3 maps to pin a sounding coordinate or drag to draw a cross-section line.
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
              title="Export Topography Map as PNG with Attribution & Transect"
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
              style={{ cursor: cursorStyle }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                if (!pinnedRecord) setHoveredRecord(null);
              }}
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
              title="Export Free-Air Map as PNG with Attribution & Transect"
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
              style={{ cursor: cursorStyle }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                if (!pinnedRecord) setHoveredRecord(null);
              }}
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
              title="Export Bouguer Map as PNG with Attribution & Transect"
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
              style={{ cursor: cursorStyle }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                if (!pinnedRecord) setHoveredRecord(null);
              }}
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

      {/* 2D Multi-Line Geophysical Cross-Section Profile Graph */}
      <ProfileGraph
        lines={lines}
        activeLineId={activeLineId}
        onSelectLine={setActiveLineId}
        onAddLine={handleAddLine}
        onDeleteLine={handleDeleteLine}
        points={profilePoints}
        activeLine={activeLine}
        hoveredPoint={hoveredProfilePoint}
        onHoverPoint={setHoveredProfilePoint}
        onSetPresetLine={handleSetPresetLine}
      />

      {/* Checkbox Export Suite Modal */}
      <ExportSuiteModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        records={records}
        bounds={bounds}
        params={bouguerParams}
        lines={lines}
        activeLine={activeLine}
        profilePoints={profilePoints}
        activePoint={hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null)}
        interpolationMethod={interpolationMethod}
      />
    </div>
  );
};
