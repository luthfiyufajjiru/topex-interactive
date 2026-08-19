import React, { useState } from 'react';
import type { ProcessedRecord, BoundingBox, BouguerParams, NamedProfileLine, ProfilePoint, InterpolationMethod } from '@/types';
import JSZip from 'jszip';
import { generateCompositeReportCanvas } from '@/utils/exporters/fullSuiteExport';
import { X, Download, CheckSquare, Square, Package, Image, FileCode, FileSpreadsheet, Loader2, Sparkles } from 'lucide-react';

interface ExportSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: ProcessedRecord[];
  bounds: BoundingBox;
  params: BouguerParams;
  lines: NamedProfileLine[];
  activeLine: NamedProfileLine;
  profilePoints: ProfilePoint[];
  activePoint?: ProfilePoint | null;
  interpolationMethod: InterpolationMethod;
}

interface ExportItemConfig {
  id: string;
  category: 'report' | 'geosoft' | 'data' | 'maps';
  name: string;
  desc: string;
  ext: string;
  defaultChecked: boolean;
}

const EXPORT_ITEMS: ExportItemConfig[] = [
  {
    id: 'composite_png',
    category: 'report',
    name: 'Full Composite Report Poster (4K PNG)',
    desc: 'Unified 1-picture report with 3 maps, 2D cross-section, correlation line, and metadata table.',
    ext: '.png',
    defaultChecked: true,
  },
  {
    id: 'report_txt',
    category: 'report',
    name: 'Geophysical Survey Report Summary',
    desc: 'Text documentation with formulas, density parameters, bounding coordinates, and citations.',
    ext: '.txt',
    defaultChecked: true,
  },
  {
    id: 'oasis_xyz',
    category: 'geosoft',
    name: 'Oasis Montaj Geosoft XYZ Data',
    desc: 'Standard Geosoft ASCII line format with headers for direct import into Oasis Montaj.',
    ext: '.xyz',
    defaultChecked: true,
  },
  {
    id: 'gxf_bouguer',
    category: 'geosoft',
    name: 'Geosoft Grid (.GXF) — Complete Bouguer',
    desc: 'ASCII Grid eXchange Format for GM-SYS and Oasis Montaj 2D/3D forward gravity modeling.',
    ext: '.gxf',
    defaultChecked: true,
  },
  {
    id: 'gxf_freeair',
    category: 'geosoft',
    name: 'Geosoft Grid (.GXF) — Free-Air Gravity',
    desc: 'Free-Air gravity anomaly raster grid in Geosoft GXF format.',
    ext: '.gxf',
    defaultChecked: true,
  },
  {
    id: 'gxf_topo',
    category: 'geosoft',
    name: 'Geosoft Grid (.GXF) — Topography / Bathymetry',
    desc: 'Elevation / bathymetry grid in Geosoft GXF format.',
    ext: '.gxf',
    defaultChecked: true,
  },
  {
    id: 'soundings_csv',
    category: 'data',
    name: 'Complete Soundings Data Table',
    desc: 'Raw & reduced soundings (Lat, Lon, Topo, FAA, Bouguer, Slab) in CSV format.',
    ext: '.csv',
    defaultChecked: true,
  },
  {
    id: 'profile_csv',
    category: 'data',
    name: '2D Cross-Section Profile Samples',
    desc: 'Resampled continuous profile points along transect with distances in kilometers.',
    ext: '.csv',
    defaultChecked: true,
  },
  {
    id: 'map_topo_png',
    category: 'maps',
    name: 'Topography / Bathymetry Map (PNG)',
    desc: 'GEBCO colormap publication map with coordinates and transect overlay.',
    ext: '.png',
    defaultChecked: true,
  },
  {
    id: 'map_faa_png',
    category: 'maps',
    name: 'Free-Air Gravity Anomaly Map (PNG)',
    desc: 'Coolwarm colormap publication map with coordinates and colorbar.',
    ext: '.png',
    defaultChecked: true,
  },
  {
    id: 'map_bouguer_png',
    category: 'maps',
    name: 'Complete Bouguer Anomaly Map (PNG)',
    desc: 'Viridis colormap publication map with coordinates and colorbar.',
    ext: '.png',
    defaultChecked: true,
  },
  {
    id: 'profile_chart_png',
    category: 'maps',
    name: '2D Cross-Section Profile Chart (PNG)',
    desc: 'Dual-panel Gravity + Bathymetry cross-section plot with correlation tracker lines.',
    ext: '.png',
    defaultChecked: true,
  },
];

export const ExportSuiteModal: React.FC<ExportSuiteModalProps> = ({
  isOpen,
  onClose,
  records,
  bounds,
  params,
  lines,
  activeLine,
  profilePoints,
  activePoint,
  interpolationMethod,
}) => {
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    EXPORT_ITEMS.forEach((item) => {
      initial[item.id] = item.defaultChecked;
    });
    return initial;
  });

  const [isExporting, setIsExporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectAll = (check: boolean) => {
    const updated: Record<string, boolean> = {};
    EXPORT_ITEMS.forEach((item) => {
      updated[item.id] = check;
    });
    setSelectedItems(updated);
  };

  const handleApplyPreset = (preset: 'all' | 'oasis' | 'maps' | 'data') => {
    const updated: Record<string, boolean> = {};
    EXPORT_ITEMS.forEach((item) => {
      if (preset === 'all') updated[item.id] = true;
      else if (preset === 'oasis') updated[item.id] = item.category === 'geosoft' || item.id === 'composite_png';
      else if (preset === 'maps') updated[item.id] = item.category === 'maps' || item.id === 'composite_png';
      else if (preset === 'data') updated[item.id] = item.category === 'data' || item.id === 'report_txt';
    });
    setSelectedItems(updated);
  };

  const countSelected = Object.values(selectedItems).filter(Boolean).length;

  // Compile and download custom selected ZIP package
  const handleDownloadSelectedZip = async () => {
    if (countSelected === 0) return;
    setIsExporting(true);
    setProgressMsg('Initializing custom package...');

    try {
      const zip = new JSZip();

      // 1. Composite Poster PNG
      if (selectedItems.composite_png) {
        setProgressMsg('Rendering 4K Composite Report Poster...');
        const canvas = await generateCompositeReportCanvas({
          records,
          bounds,
          params,
          lines,
          activeLine,
          profilePoints,
          activePoint,
          interpolationMethod,
        });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) zip.file('REPORT/topex_geophysical_composite_report.png', blob);
      }

      // 2. Report Text
      if (selectedItems.report_txt) {
        const reportText = `================================================================================
TOPEX SATELLITE GRAVITY & GEOPHYSICAL SURVEY REPORT
================================================================================
Generated by: TOPEX Interactive Downloader
URL: https://topex-interactive.yufajjiru.work
Date of Generation: ${new Date().toISOString()}

1. SURVEY BOUNDARIES (WGS 84 / EPSG:4326)
--------------------------------------------------------------------------------
North Latitude : ${bounds.north.toFixed(4)}°
South Latitude : ${bounds.south.toFixed(4)}°
West Longitude : ${bounds.west.toFixed(4)}°
East Longitude : ${bounds.east.toFixed(4)}°
Total Points   : ${records.length.toLocaleString()}

2. BOUGUER GRAVITY REDUCTION PARAMETERS
--------------------------------------------------------------------------------
Standard Crustal Density (rho_c)   : ${params.crustalDensity.toFixed(2)} g/cm³
Seawater Reference Density (rho_w) : ${params.waterDensity.toFixed(2)} g/cm³
Marine Density Contrast (Delta_rho): ${(params.crustalDensity - params.waterDensity).toFixed(2)} g/cm³
Bouguer Gravitational Constant     : 2 * pi * G = 0.04193 mGal * cm³ / (g * m)

Reduction Formulas:
- Continental (h >= 0): CBA = FAA - 0.04193 * rho_c * h
- Marine / Ocean (h < 0): CBA = FAA - 0.04193 * (rho_c - rho_w) * h

3. SURVEY PROFILE LINES
--------------------------------------------------------------------------------
${lines
  .map(
    (l) =>
      `- ${l.name} (${l.labelStart} -> ${l.labelEnd}): Start (${l.start.lat.toFixed(4)}°, ${l.start.lon.toFixed(4)}°) -> End (${l.end.lat.toFixed(4)}°, ${l.end.lon.toFixed(4)}°)`
  )
  .join('\n')}

4. CITATION & DATA SOURCES
--------------------------------------------------------------------------------
Data provided by Scripps Institution of Oceanography, University of California San Diego (SIO/UCSD).
Model: Sandwell, D. T., and W. H. F. Smith, Global Marine Gravity from Retracked Geosat and ERS-1 Altimetry.
Web Application: TOPEX Interactive Downloader (https://topex-interactive.yufajjiru.work)
================================================================================`;
        zip.file('REPORT/topex_survey_summary.txt', reportText);
      }

      // 3. Oasis Montaj XYZ
      if (selectedItems.oasis_xyz) {
        const xyzLines = [
          '/ Oasis Montaj Geosoft XYZ Data File',
          '/ Generated by TOPEX Interactive Downloader • https://topex-interactive.yufajjiru.work',
          `/ Date: ${new Date().toISOString()}`,
          '/ Coordinate System: WGS 84 (EPSG:4326)',
          '/ Channels: Longitude Latitude Topo_m FAA_mGal Bouguer_mGal Slab_mGal',
          '/',
          '/LINE 0',
          '/ X              Y              Topo_m         FAA_mGal       Bouguer_mGal   Slab_mGal',
        ];
        for (const r of records) {
          xyzLines.push(
            `${r.longitude.toFixed(6).padStart(14, ' ')} ${r.latitude.toFixed(6).padStart(14, ' ')} ${(r.elevation?.toFixed(2) ?? '*').padStart(14, ' ')} ${(r.gravity?.toFixed(3) ?? '*').padStart(14, ' ')} ${(r.bouguer?.toFixed(3) ?? '*').padStart(14, ' ')} ${(r.slabCorrection?.toFixed(3) ?? '*').padStart(14, ' ')}`
          );
        }
        zip.file('OASIS_MONTAJ_GEOSOFT/topex_survey.xyz', xyzLines.join('\r\n'));
      }

      // 4. Geosoft GXF Grids
      const makeGxfContent = (variable: 'bouguer' | 'freeAir' | 'topography') => {
        const lats = Array.from(new Set(records.map((r) => r.latitude))).sort((a, b) => b - a);
        const lons = Array.from(new Set(records.map((r) => r.longitude))).sort((a, b) => a - b);
        const nrows = lats.length;
        const ncols = lons.length;
        const dy = nrows > 1 ? Math.abs((bounds.north - bounds.south) / (nrows - 1)) : 0.016667;
        const dx = ncols > 1 ? Math.abs((bounds.east - bounds.west) / (ncols - 1)) : 0.016667;

        const gridMap = new Map<string, number>();
        for (const r of records) {
          const key = `${r.latitude.toFixed(4)}_${r.longitude.toFixed(4)}`;
          const val = variable === 'bouguer' ? r.bouguer ?? -999999 : variable === 'freeAir' ? r.gravity ?? -999999 : r.elevation ?? -999999;
          gridMap.set(key, val);
        }

        const lines: string[] = [
          '#TITLE', `TOPEX ${variable.toUpperCase()} Grid`,
          '#POINTS', `${ncols}`, '#ROWS', `${nrows}`,
          '#PTSEP', `${dx.toFixed(6)}`, '#ROWSEP', `${dy.toFixed(6)}`,
          '#XORIGIN', `${bounds.west.toFixed(6)}`, '#YORIGIN', `${bounds.south.toFixed(6)}`,
          '#ROTATION', '0.0', '#SENSE', '1', '#DUMMY', '-999999', '#GRID',
        ];
        for (let r = 0; r < nrows; r++) {
          const rowVals: string[] = [];
          for (let c = 0; c < ncols; c++) {
            rowVals.push((gridMap.get(`${lats[r].toFixed(4)}_${lons[c].toFixed(4)}`) ?? -999999).toFixed(2));
          }
          lines.push(rowVals.join(' '));
        }
        return lines.join('\r\n');
      };

      if (selectedItems.gxf_bouguer) {
        zip.file('OASIS_MONTAJ_GEOSOFT/topex_complete_bouguer_grid.gxf', makeGxfContent('bouguer'));
      }
      if (selectedItems.gxf_freeair) {
        zip.file('OASIS_MONTAJ_GEOSOFT/topex_free_air_gravity_grid.gxf', makeGxfContent('freeAir'));
      }
      if (selectedItems.gxf_topo) {
        zip.file('OASIS_MONTAJ_GEOSOFT/topex_topography_grid.gxf', makeGxfContent('topography'));
      }

      // 5. Soundings CSV
      if (selectedItems.soundings_csv) {
        const soundingsCsv = [
          'Latitude,Longitude,Topography_m,FreeAir_mGal,Bouguer_mGal,SlabCorrection_mGal',
          ...records.map((r) => `${r.latitude.toFixed(6)},${r.longitude.toFixed(6)},${r.elevation ?? ''},${r.gravity ?? ''},${r.bouguer ?? ''},${r.slabCorrection ?? ''}`),
        ].join('\r\n');
        zip.file('DATA_CSV/topex_soundings_complete.csv', soundingsCsv);
      }

      // 6. Profile CSV
      if (selectedItems.profile_csv) {
        const profileCsv = [
          'ProfileName,Index,Distance_km,Latitude,Longitude,Topography_m,FreeAir_mGal,Bouguer_mGal',
          ...profilePoints.map((p) => `${activeLine.name},${p.index},${p.distanceKm},${p.latitude},${p.longitude},${p.elevation},${p.freeAir ?? ''},${p.bouguer ?? ''}`),
        ].join('\r\n');
        zip.file('DATA_CSV/topex_cross_section_profiles.csv', profileCsv);
      }

      setProgressMsg('Compressing custom package archive...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `topex_geophysical_suite_custom_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      onClose();
    } catch (err) {
      console.error('Error creating export bundle:', err);
    } finally {
      setIsExporting(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="export-modal-card">
        {/* Modal Header */}
        <div className="export-modal-header">
          <div className="export-modal-title-group">
            <div className="icon-badge-blue">
              <Package size={20} />
            </div>
            <div>
              <h2 className="export-modal-title">Geophysical Suite Export Center</h2>
              <p className="export-modal-desc">
                Select datasets, modeling grids, publication maps, and reports to export.
              </p>
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Presets & Bulk Select Controls */}
        <div className="export-presets-bar">
          <div className="preset-chips-row">
            <span className="preset-label">Quick Presets:</span>
            <button type="button" className="chip-preset" onClick={() => handleApplyPreset('all')}>
              <Sparkles size={12} />
              <span>Full Suite</span>
            </button>
            <button type="button" className="chip-preset" onClick={() => handleApplyPreset('oasis')}>
              <FileCode size={12} />
              <span>Oasis Montaj & Modeling</span>
            </button>
            <button type="button" className="chip-preset" onClick={() => handleApplyPreset('maps')}>
              <Image size={12} />
              <span>High-Res Maps</span>
            </button>
            <button type="button" className="chip-preset" onClick={() => handleApplyPreset('data')}>
              <FileSpreadsheet size={12} />
              <span>CSV Data Tables</span>
            </button>
          </div>

          <div className="bulk-select-row">
            <button type="button" className="btn-bulk-toggle" onClick={() => handleSelectAll(true)}>
              Select All
            </button>
            <span>&bull;</span>
            <button type="button" className="btn-bulk-toggle" onClick={() => handleSelectAll(false)}>
              Deselect All
            </button>
          </div>
        </div>

        {/* Checkable Items List */}
        <div className="export-items-container">
          {EXPORT_ITEMS.map((item) => {
            const isChecked = !!selectedItems[item.id];
            return (
              <div
                key={item.id}
                className={`export-item-card ${isChecked ? 'selected' : ''}`}
                onClick={() => toggleItem(item.id)}
              >
                <div className="item-checkbox-col">
                  {isChecked ? (
                    <CheckSquare size={19} className="text-primary-blue" />
                  ) : (
                    <Square size={19} className="text-slate-400" />
                  )}
                </div>
                <div className="item-info-col">
                  <div className="item-name-row">
                    <span className="item-name">{item.name}</span>
                    <span className="item-ext-badge">{item.ext}</span>
                  </div>
                  <p className="item-desc">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Actions */}
        <div className="export-modal-footer">
          <div className="selected-count-badge">
            <strong>{countSelected}</strong> of {EXPORT_ITEMS.length} items selected
          </div>

          <div className="modal-footer-buttons">
            <button type="button" className="btn-cancel-modal" onClick={onClose} disabled={isExporting}>
              Cancel
            </button>

            <button
              type="button"
              className="btn-download-bundle"
              onClick={handleDownloadSelectedZip}
              disabled={isExporting || countSelected === 0}
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{progressMsg || 'Assembling Package...'}</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download Selected Package (.ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
