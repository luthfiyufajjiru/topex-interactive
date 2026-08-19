import React from 'react';
import { Activity } from 'lucide-react';

interface DatasetTogglesProps {
  includeGravity: boolean;
  onToggleGravity: (val: boolean) => void;
}

export const DatasetToggles: React.FC<DatasetTogglesProps> = ({
  includeGravity,
  onToggleGravity,
}) => {
  return (
    <div className="toggles-ribbon">
      {/* Including Free Air Gravity */}
      <label
        id="data-switch"
        className="form-switch"
        title="Fetch Free Air Gravity (mGal) alongside Topography data"
      >
        <input
          type="checkbox"
          checked={includeGravity}
          onChange={(e) => onToggleGravity(e.target.checked)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--primary-blue)" />
          <span>Including Free Air Gravity</span>
        </div>
      </label>
    </div>
  );
};
