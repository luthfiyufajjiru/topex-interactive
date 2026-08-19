import React from 'react';
import { ColormapName, getColormapGradient } from '@/utils/geophysics/colormaps';

interface MapColorbarProps {
  colormap: ColormapName;
  min: number;
  max: number;
  unit: string;
  label: string;
}

export const MapColorbar: React.FC<MapColorbarProps> = ({ colormap, min, max, unit, label }) => {
  const gradient = getColormapGradient(colormap);
  const mid = ((min + max) / 2).toFixed(1);

  return (
    <div className="map-colorbar-widget">
      <div className="colorbar-header">
        <span className="colorbar-label">{label}</span>
        <span className="colorbar-unit">({unit})</span>
      </div>
      <div className="colorbar-bar" style={{ background: gradient }} />
      <div className="colorbar-ticks">
        <span className="tick-min">{min.toFixed(1)}</span>
        <span className="tick-mid">{mid}</span>
        <span className="tick-max">{max.toFixed(1)}</span>
      </div>
    </div>
  );
};
