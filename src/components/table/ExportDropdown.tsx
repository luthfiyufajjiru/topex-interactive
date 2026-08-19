import React, { useState, useRef, useEffect } from 'react';
import type { TopexRecord, BoundingBox } from '@/types';
import {
  exportToCsv,
  exportToGeoJson,
  exportToXyz,
  exportToKml,
  exportToJson,
  exportToYaml,
  exportToXml,
} from '@/utils/exporters';
import { Download, ChevronDown, Globe, FileSpreadsheet, Map, Box, FileCode, Layers } from 'lucide-react';

interface ExportDropdownProps {
  records: TopexRecord[];
  bounds: BoundingBox | null;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({ records, bounds }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (format: string) => {
    const timestamp = Date.now();
    const count = records.length;

    switch (format) {
      case 'geojson':
        exportToGeoJson(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.geojson`);
        break;
      case 'csv':
        exportToCsv(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.csv`);
        break;
      case 'xyz':
        exportToXyz(records, bounds || undefined, `topex_grid_${count}pts_${timestamp}.xyz`);
        break;
      case 'kml':
        exportToKml(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.kml`);
        break;
      case 'json':
        exportToJson(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.json`);
        break;
      case 'yaml':
        exportToYaml(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.yaml`);
        break;
      case 'xml':
        exportToXml(records, bounds || undefined, `topex_soundings_${count}pts_${timestamp}.xml`);
        break;
    }
    setIsOpen(false);
  };

  return (
    <div className="export-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-export-csv"
        onClick={() => setIsOpen(!isOpen)}
        title="Export soundings in multiple GIS & data formats"
      >
        <Download size={14} />
        <span>Export Data</span>
        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {isOpen && (
        <div className="export-menu-card">
          <div className="export-menu-header">GIS & Geospatial Formats</div>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('geojson')}
          >
            <Globe size={15} color="#0284c7" />
            <div>
              <div className="export-item-title">GeoJSON (.geojson)</div>
              <div className="export-item-desc">Direct import into QGIS, ArcGIS, Mapbox</div>
            </div>
          </button>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('kml')}
          >
            <Map size={15} color="#059669" />
            <div>
              <div className="export-item-title">KML (.kml)</div>
              <div className="export-item-desc">Google Earth 3D placemark soundings</div>
            </div>
          </button>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('xyz')}
          >
            <Layers size={15} color="#7c3aed" />
            <div>
              <div className="export-item-title">ASCII Grid (.xyz)</div>
              <div className="export-item-desc">GMT (Generic Mapping Tools) / Bathymetry scripts</div>
            </div>
          </button>

          <div className="export-menu-header" style={{ marginTop: '6px' }}>Tabular & Data Formats</div>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('csv')}
          >
            <FileSpreadsheet size={15} color="#16a34a" />
            <div>
              <div className="export-item-title">CSV (.csv)</div>
              <div className="export-item-desc">Excel, Python Pandas, R, Spreadsheets</div>
            </div>
          </button>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('json')}
          >
            <Box size={15} color="#ea580c" />
            <div>
              <div className="export-item-title">JSON (.json)</div>
              <div className="export-item-desc">Standard structured JSON records</div>
            </div>
          </button>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('yaml')}
          >
            <FileCode size={15} color="#0891b2" />
            <div>
              <div className="export-item-title">YAML (.yaml)</div>
              <div className="export-item-desc">Human-readable configuration format</div>
            </div>
          </button>

          <button
            type="button"
            className="export-menu-item"
            onClick={() => handleExport('xml')}
          >
            <FileCode size={15} color="#64748b" />
            <div>
              <div className="export-item-title">XML (.xml)</div>
              <div className="export-item-desc">Standard schema data exchange</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
