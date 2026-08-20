import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
import type { ProcessedRecord, BoundingBox, BouguerParams, InterpolationMethod, NamedProfileLine, ProfilePoint, RegionalResidualConfig } from '@/types';
import { ColormapName } from '@/utils/geophysics/colormaps';
import { buildAllRegularGrids, buildResidualAndRegionalGrids, renderInterpolatedRasterToCanvas, AllGridsResult } from '@/utils/geophysics/interpolation';
import { extractProfilePoints } from '@/utils/geophysics/profile';
import { separateRegionalResidual } from '@/utils/geophysics/regionalResidual';
import { checkWebGLSupport } from '@/utils/webgl/webglDetector';
import { renderWebGL2Raster } from '@/utils/webgl/webglRenderer';
import { WebGLFallbackView } from './WebGLFallbackView';
import { MapColorbar } from './MapColorbar';
import { ProfileGraph } from './ProfileGraph';
import { exportToOasisMontajXYZ, exportToGeosoftGXF } from '@/utils/exporters/geosoft';
import { exportMapToPng } from '@/utils/exporters/mapImage';
import { exportCompositeReportImage } from '@/utils/exporters/compositeReport';
import { ExportSuiteModal } from './ExportSuiteModal';
import { CitationsModal } from '../modals/CitationsModal';
import {
  FileCode,
  Image,
  SlidersHorizontal,
  Layers,
  Move,
  LayoutGrid,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  BookOpen,
} from 'lucide-react';

interface SatelliteGravityStudioProps {
  records: ProcessedRecord[];
  bounds: BoundingBox;
  bouguerParams?: BouguerParams;
  onBackToExtract?: () => void;
}

interface MapConfig {
  id: 'topography' | 'freeAir' | 'bouguer' | 'residual' | 'regional';
  title: string;
  unit: string;
  colormap: ColormapName;
  getValue?: (r: ProcessedRecord) => number | undefined;
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
  onBackToExtract,
}) => {
  // 1. WebGL Standard & Hardware Acceleration Check
  const webglSupport = useMemo(() => checkWebGLSupport(), []);

  const [hoveredRecord, setHoveredRecord] = useState<ProcessedRecord | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; mapId: string } | null>(null);
  const [hoveredProfilePoint, setHoveredProfilePoint] = useState<ProfilePoint | null>(null);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>('bicubic');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMapsCollapsed, setIsMapsCollapsed] = useState<boolean>(false);
  const [isRenderingMap3, setIsRenderingMap3] = useState<boolean>(false);

  // Regional-Residual Separation Configuration
  const [residualConfig, setResidualConfig] = useState<RegionalResidualConfig>({
    method: 'gaussian',
    radiusKm: 35,
  });

  // Local temporary slider values to update UI instantly without calculating heavy math on every micro-drag
  const [tempRadiusKm, setTempRadiusKm] = useState<number>(residualConfig.radiusKm ?? 35);
  const [tempGridWindow, setTempGridWindow] = useState<number>(residualConfig.gridWindowCells ?? 3);

  // Sync temp values if residualConfig changes from presets or external triggers
  useEffect(() => {
    if (residualConfig.radiusKm !== undefined) {
      setTempRadiusKm(residualConfig.radiusKm);
    }
    if (residualConfig.gridWindowCells !== undefined) {
      setTempGridWindow(residualConfig.gridWindowCells);
    }
  }, [residualConfig]);

  const commitRadius = (val: number) => {
    setResidualConfig((prev) => {
      if (prev.radiusKm === val) return prev;
      return { ...prev, radiusKm: val };
    });
  };

  const commitGridWindow = (val: number) => {
    setResidualConfig((prev) => {
      if (prev.gridWindowCells === val) return prev;
      return { ...prev, gridWindowCells: val };
    });
  };

  // 1. Build Base Static Grids (Topography, Free-Air, Bouguer) ONLY ONCE when records or bounds change
  const baseGrids = useMemo(() => {
    return buildAllRegularGrids(records, bounds);
  }, [records, bounds]);

  const [processedWithResidual, setProcessedWithResidual] = useState<ProcessedRecord[]>(records);
  const [residualGrids, setResidualGrids] = useState<{
    residual: AllGridsResult['residual'];
    regional: AllGridsResult['regional'];
  }>({
    residual: baseGrids.residual,
    regional: baseGrids.regional,
  });

  // 2. High-performance asynchronous update ONLY for Residual & Regional matrices
  useEffect(() => {
    let cancelled = false;
    setIsRenderingMap3(true);

    const timer = setTimeout(() => {
      try {
        const separated = separateRegionalResidual(records, residualConfig);
        const resGrids = buildResidualAndRegionalGrids(separated, baseGrids);
        if (!cancelled) {
          setProcessedWithResidual(separated);
          setResidualGrids(resGrids);
        }
      } finally {
        if (!cancelled) {
          setIsRenderingMap3(false);
        }
      }
    }, 15);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [records, residualConfig, baseGrids]);

  // Active sounding record: hover probe
  const activeRecord = hoveredRecord;

  // Single default profile line A -> A' across the center
  const [lines, setLines] = useState<NamedProfileLine[]>(() => {
    const lonSpan = bounds.east - bounds.west;
    const midLat = (bounds.north + bounds.south) / 2;

    return [
      {
        id: 'line-default-1',
        name: 'Line 1',
        labelStart: 'A',
        labelEnd: "A'",
        color: '#f59e0b',
        start: { lat: midLat, lon: bounds.west + lonSpan * 0.1 },
        end: { lat: midLat, lon: bounds.east - lonSpan * 0.1 },
      },
    ];
  });

  const [activeLineId, setActiveLineId] = useState<string>(lines[0].id);

  // Active line object
  const activeLine = useMemo(() => {
    return lines.find((l) => l.id === activeLineId) || lines[0];
  }, [lines, activeLineId]);

  // Dragging state for transect endpoints
  const [draggingMode, setDraggingMode] = useState<'start' | 'end' | 'draw' | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');

  // Canvas Refs for Map 1, 2, 3 (Dual Layer: WebGL 2.0 Base + 2D Overlay)
  const canvasTopoWebglRef = useRef<HTMLCanvasElement | null>(null);
  const canvasTopoOverlayRef = useRef<HTMLCanvasElement | null>(null);

  // Satellite / Basemap layer under All 3 Maps
  const [topoBasemap, setTopoBasemap] = useState<'google-hybrid' | 'google-sat' | 'esri-ocean' | 'none'>('google-hybrid');
  const [topoOpacity, setTopoOpacity] = useState<number>(0.70);

  const leafletTopoContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletTopoMapRef = useRef<L.Map | null>(null);
  const leafletTopoTileLayerRef = useRef<L.TileLayer | null>(null);

  const canvasFaaWebglRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFaaOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const leafletFaaContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletFaaMapRef = useRef<L.Map | null>(null);
  const leafletFaaTileLayerRef = useRef<L.TileLayer | null>(null);

  const canvasBgWebglRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBgOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const leafletBgContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletBgMapRef = useRef<L.Map | null>(null);
  const leafletBgTileLayerRef = useRef<L.TileLayer | null>(null);

  const gridTopo = baseGrids.topo;
  const gridFaa = baseGrids.faa;
  const gridBg = baseGrids.bouguer;
  const gridResidual = residualGrids.residual ?? baseGrids.residual;
  const gridRegional = residualGrids.regional ?? baseGrids.regional;

  // Map 3 Anomaly Display Mode: 'residual' | 'bouguer' | 'regional'
  const [bouguerViewMode, setBouguerViewMode] = useState<'residual' | 'bouguer' | 'regional'>('residual');

  const activeMap3Grid = bouguerViewMode === 'residual' ? gridResidual : bouguerViewMode === 'regional' ? gridRegional : gridBg;
  const activeMap3Colormap: ColormapName = bouguerViewMode === 'residual' ? 'coolwarm' : 'viridis';

  // Extract Profile Points for active line
  const profilePoints = useMemo(() => {
    return extractProfilePoints(
      { start: activeLine.start, end: activeLine.end },
      gridTopo,
      gridFaa,
      gridBg,
      gridResidual,
      gridRegional,
      bounds,
      interpolationMethod,
      120
    );
  }, [activeLine, gridTopo, gridFaa, gridBg, gridResidual, gridRegional, bounds, interpolationMethod]);

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

  // Quick preset alignments
  const handleSetPresetLine = (preset: 'we' | 'ns' | 'diag1' | 'diag2') => {
    const lonSpan = bounds.east - bounds.west;
    const latSpan = bounds.north - bounds.south;
    const midLat = (bounds.north + bounds.south) / 2;
    const midLon = (bounds.west + bounds.east) / 2;

    let newStart = { ...activeLine.start };
    let newEnd = { ...activeLine.end };

    if (preset === 'we') {
      newStart = { lat: midLat, lon: bounds.west + lonSpan * 0.1 };
      newEnd = { lat: midLat, lon: bounds.east - lonSpan * 0.1 };
    } else if (preset === 'ns') {
      newStart = { lat: bounds.north - latSpan * 0.1, lon: midLon };
      newEnd = { lat: bounds.south + latSpan * 0.1, lon: midLon };
    } else if (preset === 'diag1') {
      newStart = { lat: bounds.north - latSpan * 0.1, lon: bounds.west + lonSpan * 0.1 };
      newEnd = { lat: bounds.south + latSpan * 0.1, lon: bounds.east - lonSpan * 0.1 };
    } else if (preset === 'diag2') {
      newStart = { lat: bounds.south + latSpan * 0.1, lon: bounds.west + lonSpan * 0.1 };
      newEnd = { lat: bounds.north - latSpan * 0.1, lon: bounds.east - lonSpan * 0.1 };
    }

    setLines(
      lines.map((l) =>
        l.id === activeLineId ? { ...l, start: newStart, end: newEnd } : l
      )
    );
  };

  // Convert screen coordinates to geographic coordinates
  const getLatLonFromEvent = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const lonRange = bounds.east - bounds.west || 1;
    const latRange = bounds.north - bounds.south || 1;

    const lon = bounds.west + (x / rect.width) * lonRange;
    const lat = bounds.north - (y / rect.height) * latRange;

    return { lat, lon, x, y };
  };

  // Proximity check for line endpoints (pixel radius)
  const getEndpointProximity = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    isTouch = false
  ): 'start' | 'end' | null => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return null;
    }

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const lonRange = bounds.east - bounds.west || 1;
    const latRange = bounds.north - bounds.south || 1;

    const startX = ((activeLine.start.lon - bounds.west) / lonRange) * rect.width;
    const startY = ((bounds.north - activeLine.start.lat) / latRange) * rect.height;

    const endX = ((activeLine.end.lon - bounds.west) / lonRange) * rect.width;
    const endY = ((bounds.north - activeLine.end.lat) / latRange) * rect.height;

    const distStart = Math.hypot(mouseX - startX, mouseY - startY);
    const distEnd = Math.hypot(mouseX - endX, mouseY - endY);

    const HIT_RADIUS = isTouch ? 28 : 18;

    if (distStart <= HIT_RADIUS) return 'start';
    if (distEnd <= HIT_RADIUS) return 'end';
    return null;
  };

  // Mouse Down: Start dragging endpoint if clicked on handle A or A', or probe sounding
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, mapId: string) => {
    const endpoint = getEndpointProximity(e);
    if (endpoint === 'start') {
      setDraggingMode('start');
      setCursorStyle('grabbing');
    } else if (endpoint === 'end') {
      setDraggingMode('end');
      setCursorStyle('grabbing');
    } else {
      // Probing sounding: does NOT mutate the transect line!
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { lat, lon } = getLatLonFromEvent(e);
      const nearest = findNearestSounding(lat, lon);
      if (nearest) {
        setHoveredRecord(nearest);
        setHoverPos({ x, y, mapId });
      }
    }
  };

  // Interactive Mouse Move on Map Canvas
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, mapId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { lat, lon } = getLatLonFromEvent(e);

    if (draggingMode === 'start') {
      setLines(
        lines.map((l) => (l.id === activeLineId ? { ...l, start: { lat, lon } } : l))
      );
      return;
    } else if (draggingMode === 'end') {
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
    const nearest = findNearestSounding(lat, lon);
    setHoveredRecord(nearest);
    setHoverPos({ x, y, mapId });
  };

  // Mouse Up: Commit line
  const handleCanvasMouseUp = () => {
    setDraggingMode(null);
    setCursorStyle('crosshair');
  };

  // Touch Events for Mobile PWA & Touchscreens (Purely probes soundings — never mutates cross-section line)
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>, mapId: string) => {
    if (e.touches.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const { lat, lon } = getLatLonFromEvent(e);
    const nearest = findNearestSounding(lat, lon);
    if (nearest) {
      setHoveredRecord(nearest);
      setHoverPos({ x, y, mapId });
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>, mapId: string) => {
    if (e.touches.length !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const { lat, lon } = getLatLonFromEvent(e);
    const nearest = findNearestSounding(lat, lon);
    if (nearest) {
      setHoveredRecord(nearest);
      setHoverPos({ x, y, mapId });
    }
  };

  const handleCanvasTouchEnd = () => {
    setDraggingMode(null);
    setCursorStyle('crosshair');
  };

  // Find nearest sounding to coordinate (uses processedWithResidual to access live regional/residual values)
  const findNearestSounding = (lat: number, lon: number): ProcessedRecord | null => {
    let nearest: ProcessedRecord | null = null;
    let minDist = Infinity;
    const sourceRecords = processedWithResidual.length > 0 ? processedWithResidual : records;

    for (let i = 0; i < sourceRecords.length; i++) {
      const r = sourceRecords[i];
      const dist = (r.latitude - lat) ** 2 + (r.longitude - lon) ** 2;
      if (dist < minDist) {
        minDist = dist;
        nearest = r;
      }
    }

    return nearest;
  };

  // Draw Overlay Elements on 2D Annotation Canvas
  const drawOverlayElements = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear transparent overlay without affecting underlying WebGL canvas
    ctx.clearRect(0, 0, w, h);

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

    // 2. Correlation Tracking point along transect line
    const effectivePickedPoint = hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null);
    if (effectivePickedPoint) {
      const xTrack = ((effectivePickedPoint.longitude - bounds.west) / lonRange) * w;
      const yTrack = ((bounds.north - effectivePickedPoint.latitude) / latRange) * h;

      // Glow halo
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(xTrack, yTrack, 9, 0, Math.PI * 2);
      ctx.stroke();

      // White circle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(xTrack, yTrack, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Center blue reticle dot
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(xTrack, yTrack, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Active target / hovered sounding reticle (crystal-clear unshaded geophysical reticle)
    const probeRecord = hoveredRecord || activeRecord;
    if (probeRecord) {
      const px = Math.round(((probeRecord.longitude - bounds.west) / lonRange) * w);
      const py = Math.round(((bounds.north - probeRecord.latitude) / latRange) * h);

      // Glowing outer ring
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Bright Cyan inner ring
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Center crosshair with dark shadow
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px - 12, py);
      ctx.lineTo(px - 4, py);
      ctx.moveTo(px + 4, py);
      ctx.lineTo(px + 12, py);
      ctx.moveTo(px, py - 12);
      ctx.lineTo(px, py - 4);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px, py + 12);
      ctx.stroke();

      // Center crosshair white lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 12, py);
      ctx.lineTo(px - 4, py);
      ctx.moveTo(px + 4, py);
      ctx.lineTo(px + 12, py);
      ctx.moveTo(px, py - 12);
      ctx.lineTo(px, py - 4);
      ctx.moveTo(px, py + 4);
      ctx.lineTo(px, py + 12);
      ctx.stroke();
    }

    ctx.restore();
  }, [bounds, lines, activeLineId, hoveredProfilePoint, profilePoints, activeRecord, hoveredRecord]);

  // Synchronously update all 3 overlay layers on mouse move / hover / draw
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isInfoPopupOpen, setIsInfoPopupOpen] = useState(false);
  const [isCitationsModalOpen, setIsCitationsModalOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    if (isExportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportDropdownOpen]);

  // Synchronously update all 3 overlay layers on mouse move / hover / draw
  const updateAllOverlays = useCallback(() => {
    drawOverlayElements(canvasTopoOverlayRef.current);
    drawOverlayElements(canvasFaaOverlayRef.current);
    drawOverlayElements(canvasBgOverlayRef.current);
  }, [drawOverlayElements]);

  useEffect(() => {
    updateAllOverlays();
  }, [updateAllOverlays]);

  // Synchronize Leaflet Basemap Underlay for All 3 Maps (Topography, Free-Air, Bouguer/Residual)
  useEffect(() => {
    const mapSlots = [
      { container: leafletTopoContainerRef.current, mapRef: leafletTopoMapRef, tileRef: leafletTopoTileLayerRef },
      { container: leafletFaaContainerRef.current, mapRef: leafletFaaMapRef, tileRef: leafletFaaTileLayerRef },
      { container: leafletBgContainerRef.current, mapRef: leafletBgMapRef, tileRef: leafletBgTileLayerRef },
    ];

    if (topoBasemap === 'none' || isMapsCollapsed) {
      mapSlots.forEach(({ mapRef, tileRef }) => {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
          tileRef.current = null;
        }
      });
      return;
    }

    mapSlots.forEach(({ container, mapRef, tileRef }) => {
      if (!container) return;

      if (!mapRef.current) {
        mapRef.current = L.map(container, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        });
      }

      const map = mapRef.current;

      // Switch Tile Layer
      if (tileRef.current) {
        map.removeLayer(tileRef.current);
        tileRef.current = null;
      }

      if (topoBasemap === 'google-hybrid') {
        tileRef.current = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          maxZoom: 20,
        }).addTo(map);
      } else if (topoBasemap === 'google-sat') {
        tileRef.current = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          maxZoom: 20,
        }).addTo(map);
      } else if (topoBasemap === 'esri-ocean') {
        tileRef.current = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 13 }
        ).addTo(map);
      }

      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { animate: false, padding: [0, 0] }
      );
    });

    const timer = setTimeout(() => {
      mapSlots.forEach(({ mapRef }) => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
          mapRef.current.fitBounds(
            [
              [bounds.south, bounds.west],
              [bounds.north, bounds.east],
            ],
            { animate: false, padding: [0, 0] }
          );
        }
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [bounds, topoBasemap, isMapsCollapsed]);

  // Clean up all Leaflet instances on unmount
  useEffect(() => {
    return () => {
      [leafletTopoMapRef, leafletFaaMapRef, leafletBgMapRef].forEach((ref) => {
        if (ref.current) {
          ref.current.remove();
          ref.current = null;
        }
      });
    };
  }, []);

  // 1. Render Map 1: Topography / Bathymetry (Runs ONLY when topo grid or method changes)
  useEffect(() => {
    if (isMapsCollapsed || !canvasTopoWebglRef.current || !gridTopo) return;
    const rendered = renderWebGL2Raster(canvasTopoWebglRef.current, gridTopo, 'gebco', interpolationMethod);
    if (!rendered && canvasTopoOverlayRef.current) {
      renderInterpolatedRasterToCanvas(canvasTopoOverlayRef.current, gridTopo, 'gebco', interpolationMethod);
    }
  }, [gridTopo, interpolationMethod, isMapsCollapsed]);

  // 2. Render Map 2: Free-Air Gravity Anomaly (Runs ONLY when FAA grid or method changes)
  useEffect(() => {
    if (isMapsCollapsed || !canvasFaaWebglRef.current || !gridFaa) return;
    const rendered = renderWebGL2Raster(canvasFaaWebglRef.current, gridFaa, 'coolwarm', interpolationMethod);
    if (!rendered && canvasFaaOverlayRef.current) {
      renderInterpolatedRasterToCanvas(canvasFaaOverlayRef.current, gridFaa, 'coolwarm', interpolationMethod);
    }
  }, [gridFaa, interpolationMethod, isMapsCollapsed]);

  // 3. Render Map 3: Bouguer / Residual / Regional (Runs when active Anomaly grid, colormap or method changes)
  useEffect(() => {
    if (isMapsCollapsed || !canvasBgWebglRef.current || !activeMap3Grid) return;
    const rendered = renderWebGL2Raster(canvasBgWebglRef.current, activeMap3Grid, activeMap3Colormap, interpolationMethod);
    if (!rendered && canvasBgOverlayRef.current) {
      renderInterpolatedRasterToCanvas(canvasBgOverlayRef.current, activeMap3Grid, activeMap3Colormap, interpolationMethod);
    }
  }, [activeMap3Grid, activeMap3Colormap, interpolationMethod, isMapsCollapsed]);

  const handleExportMap = (cfg: MapConfig) => {
    exportMapToPng(
      {
        title: `TOPEX ${cfg.title}`,
        variable: cfg.id,
        unit: cfg.unit,
        colormap: cfg.colormap,
        interpolationMethod,
        bounds,
        records: processedWithResidual,
        activeLine,
        activePoint: hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null),
        basemap: topoBasemap,
        basemapOpacity: topoOpacity,
      },
      `topex_${cfg.id}_${interpolationMethod}_map.png`
    );
  };

  // Export Full Suite Composite Single Image Report
  const handleExportFullSuiteImage = () => {
    exportCompositeReportImage({
      records: processedWithResidual,
      bounds,
      params: bouguerParams,
      lines,
      activeLine,
      profilePoints,
      activePoint: hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null),
      interpolationMethod,
      basemap: topoBasemap,
      basemapOpacity: topoOpacity,
    });
  };

  // If WebGL standard is not supported on this device/browser, show fallback download view
  if (!webglSupport.isSupported) {
    return (
      <WebGLFallbackView
        records={processedWithResidual}
        bounds={bounds}
        reason={webglSupport.reason}
        onBackToExtract={onBackToExtract || (() => {})}
      />
    );
  }

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
        <div className="studio-title-block">
          <div className="studio-title-row">
            <h2 className="studio-title">Satellite Gravity Studio</h2>
            <button
              type="button"
              className="btn-info-icon"
              onClick={() => setIsInfoPopupOpen((prev) => !prev)}
              title="Toggle Studio Information"
              aria-label="Studio Info"
            >
              <Info size={15} />
            </button>
            <button
              type="button"
              className="citation-chip-badge"
              onClick={() => setIsCitationsModalOpen(true)}
              title="Open Geophysical Methodology & Citations"
            >
              <BookOpen size={12} />
              <span>Citations</span>
            </button>
          </div>
          {isInfoPopupOpen && (
            <div className="studio-info-popover">
              Multi-field comparative analysis of Topography, Free-Air, and Complete Bouguer anomalies with real-time WebGL 2.0 GPU gridding, freely draggable 2D cross-section profiling, and full geodetic export suites.
            </div>
          )}
        </div>

        {/* Unified Export Suite Dropdown */}
        <div className="studio-export-dropdown-wrapper" ref={exportDropdownRef}>
          <button
            type="button"
            className="btn-export-suite-main"
            onClick={() => setIsExportDropdownOpen((prev) => !prev)}
            disabled={isRenderingMap3}
            title="Download geophysical datasets, maps, and reports"
          >
            <PackageCheck size={16} />
            <span>Export Suite</span>
            <ChevronDown size={14} className={isExportDropdownOpen ? 'rotate-180' : ''} />
          </button>

          {isExportDropdownOpen && (
            <div className="studio-export-dropdown-menu">
              <button
                type="button"
                className="export-dropdown-item"
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  setIsExportModalOpen(true);
                }}
              >
                <PackageCheck size={16} className="text-primary-blue" />
                <div className="export-item-text">
                  <strong>Export Package (.ZIP)...</strong>
                  <span>Custom bundle with grids, metadata & profiles</span>
                </div>
              </button>

              <button
                type="button"
                className="export-dropdown-item"
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  handleExportFullSuiteImage();
                }}
              >
                <LayoutGrid size={16} className="text-emerald-500" />
                <div className="export-item-text">
                  <strong>Full Report Plate (PNG)</strong>
                  <span>3 Maps + 2D Profile Composite</span>
                </div>
              </button>

              <div className="export-dropdown-divider" />

              <button
                type="button"
                className="export-dropdown-item"
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  exportToOasisMontajXYZ(processedWithResidual);
                }}
              >
                <FileCode size={16} className="text-amber-500" />
                <div className="export-item-text">
                  <strong>Oasis Montaj (.XYZ)</strong>
                  <span>Industry-standard Geosoft ASCII table</span>
                </div>
              </button>

              <button
                type="button"
                className="export-dropdown-item"
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  exportToGeosoftGXF(processedWithResidual, bounds, 'bouguer');
                }}
              >
                <FileCode size={16} className="text-purple-500" />
                <div className="export-item-text">
                  <strong>Geosoft Grid (.GXF)</strong>
                  <span>Standard 2D raster grid format</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Interpolation Control Dropdown Toolbar & Interactive Drawing Hint */}
      <div className={`interpolation-toolbar-card ${isRenderingMap3 ? 'is-rendering-active' : ''}`}>
        <div className="interp-left-group">
          {/* Gridding Algorithm */}
          <div className="interp-control-item">
            <div className="interp-label-group">
              <SlidersHorizontal size={15} className="text-primary-blue" />
              <span className="interp-title">Gridding:</span>
            </div>
            <div className="interp-select-wrapper">
              <select
                id="interp-method-select"
                className="form-control interp-select"
                value={interpolationMethod}
                onChange={(e) => setInterpolationMethod(e.target.value as InterpolationMethod)}
                disabled={isRenderingMap3}
                title="2D Potential field interpolation algorithm"
              >
                <option value="bicubic">Bicubic Spline (Potential Field Standard)</option>
                <option value="spline">Thin Plate Spline (Minimum Curvature)</option>
                <option value="bilinear">Bilinear (Linear Mesh)</option>
                <option value="idw">IDW (Inverse Distance Power 2)</option>
                <option value="nearest">Nearest (Raw Discrete)</option>
              </select>
            </div>
          </div>

          <div className="interp-divider" />

          {/* Global Basemap Underlay & Opacity Controls for All 3 Maps */}
          <div className="interp-control-item">
            <div className="interp-label-group">
              <Layers size={15} className="text-primary-blue" />
              <span className="interp-title">Basemap:</span>
            </div>
            <div className="interp-select-wrapper">
              <select
                className="form-control interp-select"
                value={topoBasemap}
                onChange={(e) => setTopoBasemap(e.target.value as any)}
                title="Satellite / terrain basemap underlay for all 3 maps"
              >
                <option value="google-hybrid">Google Hybrid</option>
                <option value="google-sat">Google Satellite</option>
                <option value="esri-ocean">ESRI Ocean</option>
                <option value="none">Pure Colormap</option>
              </select>
            </div>
          </div>

          {topoBasemap !== 'none' && (
            <div className="regional-radius-control-group">
              <span className="interp-title">Opacity:</span>
              <input
                type="range"
                min="0.10"
                max="1.0"
                step="0.05"
                value={topoOpacity}
                onChange={(e) => setTopoOpacity(parseFloat(e.target.value))}
                className="density-slider radius-slider-bar"
                style={{ width: 65 }}
                title={`Basemap overlay opacity: ${Math.round(topoOpacity * 100)}%`}
              />
              <span className="radius-value-pill">{Math.round(topoOpacity * 100)}%</span>
            </div>
          )}

          <div className="interp-divider" />

          {/* Regional Separation Method */}
          <div className="interp-control-item">
            <div className="interp-label-group">
              <span className="interp-title">Regional Filter:</span>
            </div>
            <div className="interp-select-wrapper">
              <select
                className="form-control interp-select"
                value={residualConfig.method}
                onChange={(e) =>
                  setResidualConfig((prev) => ({
                    ...prev,
                    method: e.target.value as RegionalResidualConfig['method'],
                  }))
                }
                disabled={isRenderingMap3}
                title="Regional-Residual separation algorithm (Griffin 1949 / Gaussian filter / Polynomial)"
              >
                <option value="gaussian">Gaussian Low-Pass Filter (Smooth Regional)</option>
                <option value="moving_avg">Moving Average Window (Griffin Boxcar)</option>
                <option value="poly2">2nd-Order Polynomial (Paraboloid Surface)</option>
                <option value="poly1">1st-Order Polynomial (Planar Trend)</option>
                <option value="none">None (Total Bouguer Only)</option>
              </select>
            </div>
          </div>

          {/* Gaussian Filter Window Radius Slider (in km) */}
          {residualConfig.method === 'gaussian' && (
            <div className="regional-radius-control-group">
              <span className="interp-title">Radius:</span>
              <input
                type="range"
                min="10"
                max="150"
                step="5"
                value={tempRadiusKm}
                onChange={(e) => setTempRadiusKm(parseInt(e.target.value, 10) || 35)}
                onPointerUp={(e) => commitRadius(parseInt((e.target as HTMLInputElement).value, 10) || 35)}
                onMouseUp={(e) => commitRadius(parseInt((e.target as HTMLInputElement).value, 10) || 35)}
                onTouchEnd={(e) => commitRadius(parseInt((e.target as HTMLInputElement).value, 10) || 35)}
                onKeyUp={(e) => commitRadius(parseInt((e.target as HTMLInputElement).value, 10) || 35)}
                disabled={isRenderingMap3}
                className="density-slider radius-slider-bar"
                title={`Gaussian filter radius: ${tempRadiusKm} km (drag to adjust, release to apply)`}
              />
              <span className="radius-value-pill">{tempRadiusKm} km</span>
            </div>
          )}

          {/* Moving Average Discrete Grid Window Slider (k = 1, 2, 3...) */}
          {residualConfig.method === 'moving_avg' && (
            <div className="regional-radius-control-group">
              <span className="interp-title">Grid Window:</span>
              <input
                type="range"
                min="1"
                max="12"
                step="1"
                value={tempGridWindow}
                onChange={(e) => setTempGridWindow(parseInt(e.target.value, 10) || 1)}
                onPointerUp={(e) => commitGridWindow(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
                onMouseUp={(e) => commitGridWindow(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
                onTouchEnd={(e) => commitGridWindow(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
                onKeyUp={(e) => commitGridWindow(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
                disabled={isRenderingMap3}
                className="density-slider radius-slider-bar"
                title={`Moving average grid box size: ${2 * tempGridWindow + 1}×${2 * tempGridWindow + 1} cells`}
              />
              <span className="radius-value-pill">
                {2 * tempGridWindow + 1}×{2 * tempGridWindow + 1} (k={tempGridWindow})
              </span>
            </div>
          )}

          {/* Rendering In-Progress Indicator Pill */}
          {isRenderingMap3 && (
            <div className="interp-rendering-pill">
              <Loader2 size={13} style={{ animation: 'rotate 1s linear infinite' }} />
              <span>Calculating Anomaly...</span>
            </div>
          )}
        </div>

        <div className="interp-right-group">
          <div className="transect-drag-hint">
            <Move size={14} className="text-primary-blue" />
            <span>Draw transect ({activeLine.labelStart} &rarr; {activeLine.labelEnd})</span>
          </div>

          <button
            type="button"
            className={`btn-toggle-maps-collapse ${isMapsCollapsed ? 'is-collapsed' : ''}`}
            onClick={() => setIsMapsCollapsed(!isMapsCollapsed)}
            disabled={isRenderingMap3}
            title={isMapsCollapsed ? "Expand Maps" : "Collapse Maps to maximize 2D profile workspace"}
          >
            {isMapsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            <span>{isMapsCollapsed ? 'Expand Maps' : 'Collapse Maps'}</span>
          </button>
        </div>
      </div>

      {/* 3 Map Viewports Grid (Collapsible via CSS) */}
      <div
        className={`trimap-grid ${isMapsCollapsed ? 'collapsed' : ''}`}
        style={{ display: isMapsCollapsed ? 'none' : 'grid' }}
      >
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
            {topoBasemap !== 'none' && (
              <div
                ref={leafletTopoContainerRef}
                className="map-leaflet-underlay"
              />
            )}
            {!gridTopo && (
              <div className="map-skeleton-overlay">
                <div className="skeleton-shimmer" />
                <div className="skeleton-content">
                  <Loader2 className="skeleton-spinner animate-spin" size={24} />
                  <span className="skeleton-label">Rendering Topography...</span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasTopoWebglRef}
              width={480}
              height={360}
              className="raster-webgl-canvas"
              style={{
                opacity: topoBasemap !== 'none' ? topoOpacity : 1,
                transition: 'opacity 0.12s ease',
              }}
            />
            <canvas
              ref={canvasTopoOverlayRef}
              width={480}
              height={360}
              className="raster-overlay-canvas"
              style={{ cursor: cursorStyle, touchAction: 'none' }}
              onMouseDown={(e) => handleCanvasMouseDown(e, 'topo')}
              onMouseMove={(e) => handleCanvasMouseMove(e, 'topo')}
              onMouseUp={handleCanvasMouseUp}
              onTouchStart={(e) => handleCanvasTouchStart(e, 'topo')}
              onTouchMove={(e) => handleCanvasTouchMove(e, 'topo')}
              onTouchEnd={handleCanvasTouchEnd}
              onTouchCancel={handleCanvasTouchEnd}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                setHoveredRecord(null);
                setHoverPos(null);
              }}
            />
            {hoverPos && hoverPos.mapId === 'topo' && hoveredRecord && (
              <div className="map-corner-probe-hud">
                <div className="tooltip-coord-row">
                  <span>{hoveredRecord.latitude.toFixed(4)}°, {hoveredRecord.longitude.toFixed(4)}°</span>
                </div>
                <div className="tooltip-data-grid">
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Topo:</span>
                    <span className="tooltip-val text-emerald">{hoveredRecord.elevation?.toFixed(1) ?? 'N/A'} m</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">FAA:</span>
                    <span className="tooltip-val text-sky">{hoveredRecord.gravity?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Bouguer:</span>
                    <span className="tooltip-val text-amber">{hoveredRecord.bouguer?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Regional:</span>
                    <span className="tooltip-val" style={{ color: '#0284c7' }}>
                      {hoveredRecord.regional !== undefined ? `${hoveredRecord.regional.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Residual:</span>
                    <span className="tooltip-val" style={{ color: '#7c3aed' }}>
                      {hoveredRecord.residual !== undefined ? `${hoveredRecord.residual.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
            {topoBasemap !== 'none' && (
              <div
                ref={leafletFaaContainerRef}
                className="map-leaflet-underlay"
              />
            )}
            {!gridFaa && (
              <div className="map-skeleton-overlay">
                <div className="skeleton-shimmer" />
                <div className="skeleton-content">
                  <Loader2 className="skeleton-spinner animate-spin" size={24} />
                  <span className="skeleton-label">Rendering Free-Air Field...</span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasFaaWebglRef}
              width={480}
              height={360}
              className="raster-webgl-canvas"
              style={{
                opacity: topoBasemap !== 'none' ? topoOpacity : 1,
                transition: 'opacity 0.12s ease',
              }}
            />
            <canvas
              ref={canvasFaaOverlayRef}
              width={480}
              height={360}
              className="raster-overlay-canvas"
              style={{ cursor: cursorStyle, touchAction: 'none' }}
              onMouseDown={(e) => handleCanvasMouseDown(e, 'faa')}
              onMouseMove={(e) => handleCanvasMouseMove(e, 'faa')}
              onMouseUp={handleCanvasMouseUp}
              onTouchStart={(e) => handleCanvasTouchStart(e, 'faa')}
              onTouchMove={(e) => handleCanvasTouchMove(e, 'faa')}
              onTouchEnd={handleCanvasTouchEnd}
              onTouchCancel={handleCanvasTouchEnd}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                setHoveredRecord(null);
                setHoverPos(null);
              }}
            />
            {hoverPos && hoverPos.mapId === 'faa' && hoveredRecord && (
              <div className="map-corner-probe-hud">
                <div className="tooltip-coord-row">
                  <span>{hoveredRecord.latitude.toFixed(4)}°, {hoveredRecord.longitude.toFixed(4)}°</span>
                </div>
                <div className="tooltip-data-grid">
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Topo:</span>
                    <span className="tooltip-val text-emerald">{hoveredRecord.elevation?.toFixed(1) ?? 'N/A'} m</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">FAA:</span>
                    <span className="tooltip-val text-sky">{hoveredRecord.gravity?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Bouguer:</span>
                    <span className="tooltip-val text-amber">{hoveredRecord.bouguer?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Regional:</span>
                    <span className="tooltip-val" style={{ color: '#0284c7' }}>
                      {hoveredRecord.regional !== undefined ? `${hoveredRecord.regional.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Residual:</span>
                    <span className="tooltip-val" style={{ color: '#7c3aed' }}>
                      {hoveredRecord.residual !== undefined ? `${hoveredRecord.residual.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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

        {/* Map 3: Bouguer / Residual Anomaly */}
        <div className="map-view-card highlight-border">
          <div className="map-view-header">
            <div className="map-view-title-group">
              <div className="map-view-title text-primary-blue">
                {bouguerViewMode === 'residual'
                  ? 'Residual Gravity Anomaly'
                  : bouguerViewMode === 'regional'
                  ? 'Regional Gravity Field'
                  : 'Complete Bouguer Anomaly'}
              </div>
              <div className="bouguer-mode-pill-group">
                <button
                  type="button"
                  className={`btn-mode-pill ${bouguerViewMode === 'residual' ? 'active' : ''}`}
                  onClick={() => setBouguerViewMode('residual')}
                  title="Residual Anomaly: 2D polynomial trend removed to isolate shallow targets & faults"
                >
                  Residual
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill ${bouguerViewMode === 'bouguer' ? 'active' : ''}`}
                  onClick={() => setBouguerViewMode('bouguer')}
                  title="Total Complete Bouguer Anomaly"
                >
                  Total Bouguer
                </button>
                <button
                  type="button"
                  className={`btn-mode-pill ${bouguerViewMode === 'regional' ? 'active' : ''}`}
                  onClick={() => setBouguerViewMode('regional')}
                  title="Regional Trend: Deep background crust/Moho field"
                >
                  Regional
                </button>
              </div>
            </div>
            <button
              type="button"
              className="btn-map-save-png"
              onClick={() => handleExportMap(mapConfigs[2])}
              title="Export Anomaly Map as PNG with Attribution & Transect"
            >
              <Image size={14} />
              <span>Save PNG</span>
            </button>
          </div>
          <div className="canvas-wrapper">
            {topoBasemap !== 'none' && (
              <div
                ref={leafletBgContainerRef}
                className="map-leaflet-underlay"
              />
            )}
            {(!activeMap3Grid || isRenderingMap3) && (
              <div className="map-skeleton-overlay">
                <div className="skeleton-shimmer" />
                <div className="skeleton-content">
                  <Loader2 className="skeleton-spinner animate-spin" size={24} />
                  <span className="skeleton-label">
                    {bouguerViewMode === 'residual'
                      ? 'Rendering Residual Anomaly...'
                      : bouguerViewMode === 'regional'
                      ? 'Rendering Regional Field...'
                      : 'Rendering Bouguer Anomaly...'}
                  </span>
                </div>
              </div>
            )}
            <canvas
              ref={canvasBgWebglRef}
              width={480}
              height={360}
              className="raster-webgl-canvas"
              style={{
                opacity: topoBasemap !== 'none' ? topoOpacity : 1,
                transition: 'opacity 0.12s ease',
              }}
            />
            <canvas
              ref={canvasBgOverlayRef}
              width={480}
              height={360}
              className="raster-overlay-canvas"
              style={{ cursor: cursorStyle, touchAction: 'none' }}
              onMouseDown={(e) => handleCanvasMouseDown(e, 'bouguer')}
              onMouseMove={(e) => handleCanvasMouseMove(e, 'bouguer')}
              onMouseUp={handleCanvasMouseUp}
              onTouchStart={(e) => handleCanvasTouchStart(e, 'bouguer')}
              onTouchMove={(e) => handleCanvasTouchMove(e, 'bouguer')}
              onTouchEnd={handleCanvasTouchEnd}
              onTouchCancel={handleCanvasTouchEnd}
              onMouseLeave={() => {
                handleCanvasMouseUp();
                setHoveredRecord(null);
                setHoverPos(null);
              }}
            />
            {hoverPos && hoverPos.mapId === 'bouguer' && hoveredRecord && (
              <div className="map-corner-probe-hud">
                <div className="tooltip-coord-row">
                  <span>{hoveredRecord.latitude.toFixed(4)}°, {hoveredRecord.longitude.toFixed(4)}°</span>
                </div>
                <div className="tooltip-data-grid">
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Topo:</span>
                    <span className="tooltip-val text-emerald">{hoveredRecord.elevation?.toFixed(1) ?? 'N/A'} m</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">FAA:</span>
                    <span className="tooltip-val text-sky">{hoveredRecord.gravity?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Bouguer:</span>
                    <span className="tooltip-val text-amber">{hoveredRecord.bouguer?.toFixed(1) ?? 'N/A'} mGal</span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Regional:</span>
                    <span className="tooltip-val" style={{ color: '#0284c7' }}>
                      {hoveredRecord.regional !== undefined ? `${hoveredRecord.regional.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                  <div className="tooltip-data-item">
                    <span className="tooltip-label">Residual:</span>
                    <span className="tooltip-val" style={{ color: '#7c3aed' }}>
                      {hoveredRecord.residual !== undefined ? `${hoveredRecord.residual.toFixed(1)} mGal` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          {activeMap3Grid && (
            <MapColorbar
              colormap={activeMap3Colormap}
              min={activeMap3Grid.minVal}
              max={activeMap3Grid.maxVal}
              unit="mGal"
              label={
                bouguerViewMode === 'residual'
                  ? 'Residual'
                  : bouguerViewMode === 'regional'
                  ? 'Regional'
                  : 'Bouguer'
              }
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
        records={processedWithResidual}
        bounds={bounds}
        params={bouguerParams}
        lines={lines}
        activeLine={activeLine}
        profilePoints={profilePoints}
        activePoint={hoveredProfilePoint || (profilePoints.length > 0 ? profilePoints[Math.floor(profilePoints.length / 2)] : null)}
        interpolationMethod={interpolationMethod}
      />

      {/* Geophysical Methodology & Scientific Citations Modal */}
      <CitationsModal
        isOpen={isCitationsModalOpen}
        onClose={() => setIsCitationsModalOpen(false)}
      />
    </div>
  );
};
