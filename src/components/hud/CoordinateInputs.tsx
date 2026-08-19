import React from 'react';
import type { BoundingBox } from '@/types';
import { generateChunkTiles } from '@/utils/chunking';
import { CoordinateToolbar } from './CoordinateToolbar';

interface CoordinateInputsProps {
  bounds: BoundingBox | null;
  includeGravity: boolean;
  onChange: (newBounds: BoundingBox) => void;
  onShowToast: (type: 'success' | 'error', message: string) => void;
  disabled?: boolean;
}

export const CoordinateInputs: React.FC<CoordinateInputsProps> = ({
  bounds,
  includeGravity,
  onChange,
  onShowToast,
  disabled = false,
}) => {
  const currentBounds = bounds || { north: 0, south: 0, west: 0, east: 0 };

  const handleFieldChange = (field: keyof BoundingBox, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    onChange({
      ...currentBounds,
      [field]: num,
    });
  };

  const tiles = bounds ? generateChunkTiles(bounds) : [];
  const latSpan = bounds ? Math.abs(bounds.north - bounds.south) : 0;
  const lonSpan = bounds ? Math.abs(bounds.east - bounds.west) : 0;

  return (
    <div className="coordinates-form">
      {/* Share / Copy / Paste Quick Toolbar */}
      <CoordinateToolbar
        bounds={bounds}
        includeGravity={includeGravity}
        onApplyBounds={onChange}
        onShowToast={onShowToast}
      />

      {/* North */}
      <div className="coord-row-center">
        <div className="coord-box">
          <div className="coord-box-label">
            <span>North Lat</span>
            <span>max 80.7°</span>
          </div>
          <div className="coord-input-wrapper">
            <input
              type="number"
              className="form-control"
              id="north"
              max="80.738"
              min="-80.738"
              step="0.1"
              placeholder="North"
              value={bounds ? bounds.north : ''}
              onChange={(e) => handleFieldChange('north', e.target.value)}
              disabled={disabled || !bounds}
            />
          </div>
        </div>
      </div>

      {/* West and East */}
      <div className="coord-row-split">
        <div className="coord-box">
          <div className="coord-box-label">
            <span>West Lon</span>
            <span>min -360°</span>
          </div>
          <div className="coord-input-wrapper">
            <input
              type="number"
              className="form-control"
              id="west"
              max="360"
              min="-360"
              step="0.1"
              placeholder="West"
              value={bounds ? bounds.west : ''}
              onChange={(e) => handleFieldChange('west', e.target.value)}
              disabled={disabled || !bounds}
            />
          </div>
        </div>

        <div className="coord-box">
          <div className="coord-box-label">
            <span>East Lon</span>
            <span>max 360°</span>
          </div>
          <div className="coord-input-wrapper">
            <input
              type="number"
              className="form-control"
              id="east"
              max="360"
              min="-360"
              step="0.1"
              placeholder="East"
              value={bounds ? bounds.east : ''}
              onChange={(e) => handleFieldChange('east', e.target.value)}
              disabled={disabled || !bounds}
            />
          </div>
        </div>
      </div>

      {/* South */}
      <div className="coord-row-center">
        <div className="coord-box">
          <div className="coord-box-label">
            <span>South Lat</span>
            <span>min -80.7°</span>
          </div>
          <div className="coord-input-wrapper">
            <input
              type="number"
              className="form-control"
              id="south"
              max="80.738"
              min="-80.738"
              step="0.1"
              placeholder="South"
              value={bounds ? bounds.south : ''}
              onChange={(e) => handleFieldChange('south', e.target.value)}
              disabled={disabled || !bounds}
            />
          </div>
        </div>
      </div>

      {/* Area Status Bar */}
      {bounds && (
        <div className="tile-status-bar">
          <span>
            Area: <strong>{latSpan.toFixed(2)}°</strong> Lat &times; <strong>{lonSpan.toFixed(2)}°</strong> Lon
          </span>
          <span className="tile-badge">
            {tiles.length === 1 ? '1 Discrete Tile' : `${tiles.length} Discrete Tiles (Universal Grid)`}
          </span>
        </div>
      )}
    </div>
  );
};
