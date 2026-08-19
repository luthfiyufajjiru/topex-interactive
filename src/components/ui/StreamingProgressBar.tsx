import React from 'react';
import type { ChunkProgress } from '@/api/parallelFetcher';
import { Loader2, XCircle } from 'lucide-react';

interface StreamingProgressBarProps {
  progress: ChunkProgress | null;
  onCancel?: () => void;
}

export const StreamingProgressBar: React.FC<StreamingProgressBarProps> = ({
  progress,
  onCancel,
}) => {
  if (!progress) return null;

  return (
    <div className="streaming-banner">
      <div className="streaming-banner-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Loader2 size={20} className="streaming-spinner-icon" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0d47a1' }}>
              {progress.totalTiles > 1
                ? `Retrieving Tile ${progress.completedTiles} of ${progress.totalTiles} (${progress.percentage}%)`
                : 'Retrieving Soundings Grid...'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              {progress.loadedPoints.toLocaleString()} soundings streamed live into table
            </div>
          </div>
        </div>

        {onCancel && (
          <button type="button" className="btn-cancel-stream" onClick={onCancel} title="Cancel extraction">
            <XCircle size={15} />
            <span>Cancel</span>
          </button>
        )}
      </div>

      <div className="streaming-progress-track">
        <div
          className="streaming-progress-fill"
          style={{ width: `${Math.max(5, progress.percentage)}%` }}
        />
      </div>
    </div>
  );
};
