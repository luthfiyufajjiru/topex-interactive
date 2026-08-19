import React, { useState } from 'react';
import type { BoundingBox } from '@/types';
import {
  formatCoordinateText,
  getShareableUrl,
  parseCoordinateText,
} from '@/utils/coordinateParser';
import { Link2, Copy, ClipboardPaste, Check, X } from 'lucide-react';

interface CoordinateToolbarProps {
  bounds: BoundingBox | null;
  includeGravity: boolean;
  onApplyBounds: (newBounds: BoundingBox) => void;
  onShowToast: (type: 'success' | 'error', message: string) => void;
}

export const CoordinateToolbar: React.FC<CoordinateToolbarProps> = ({
  bounds,
  includeGravity,
  onApplyBounds,
  onShowToast,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteInput, setPasteInput] = useState('');

  const handleCopyLink = async () => {
    if (!bounds) {
      onShowToast('error', 'Select or draw a bounding box on the map first.');
      return;
    }
    const url = getShareableUrl(bounds, includeGravity);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      onShowToast('success', 'Shareable URL copied to clipboard!');
    } catch {
      onShowToast('error', 'Failed to copy URL to clipboard.');
    }
  };

  const handleCopyCoords = async () => {
    if (!bounds) {
      onShowToast('error', 'Select or draw a bounding box on the map first.');
      return;
    }
    const text = formatCoordinateText(bounds);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      onShowToast('success', 'Coordinates copied to clipboard!');
    } catch {
      onShowToast('error', 'Failed to copy coordinates to clipboard.');
    }
  };

  const handleApplyPasted = () => {
    const parsed = parseCoordinateText(pasteInput);
    if (!parsed) {
      onShowToast(
        'error',
        'Could not parse coordinates. Format: "North: 10, South: 5, West: 100, East: 110" or URL.'
      );
      return;
    }

    onApplyBounds(parsed);
    setShowPasteModal(false);
    setPasteInput('');
    onShowToast('success', 'Imported coordinates successfully!');
  };

  const handleQuickPasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && clipText.trim()) {
        const parsed = parseCoordinateText(clipText);
        if (parsed) {
          onApplyBounds(parsed);
          onShowToast('success', 'Pasted coordinates from clipboard!');
          return;
        }
      }
    } catch {
      // Permission denied or not supported; open manual input
    }
    setShowPasteModal(true);
  };

  return (
    <div className="coord-toolbar">
      <div className="coord-toolbar-actions">
        <button
          type="button"
          className="btn-coord-tool"
          onClick={handleCopyLink}
          disabled={!bounds}
          title="Copy shareable link with current coordinates"
        >
          {copiedLink ? <Check size={13} color="#10b981" /> : <Link2 size={13} />}
          <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
        </button>

        <button
          type="button"
          className="btn-coord-tool"
          onClick={handleCopyCoords}
          disabled={!bounds}
          title="Copy coordinate snippet (North, South, West, East)"
        >
          {copiedText ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
          <span>{copiedText ? 'Copied' : 'Copy Coords'}</span>
        </button>

        <button
          type="button"
          className="btn-coord-tool"
          onClick={handleQuickPasteFromClipboard}
          title="Paste coordinates or shareable URL from clipboard"
        >
          <ClipboardPaste size={13} />
          <span>Paste / Import</span>
        </button>
      </div>

      {/* Inline Paste Modal */}
      {showPasteModal && (
        <div className="paste-modal-overlay">
          <div className="paste-modal-card">
            <div className="paste-modal-header">
              <strong>Paste / Import Coordinates</strong>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowPasteModal(false)}
              >
                <X size={15} />
              </button>
            </div>

            <p className="paste-modal-desc">
              Paste a shareable URL, GeoJSON BBOX <code>[W, S, E, N]</code>, JSON, or text format:
              <br />
              <code>North: -8.0, South: -9.0, West: 114.5, East: 115.5</code>
            </p>

            <textarea
              className="paste-textarea"
              placeholder="Paste URL or coordinates here..."
              rows={3}
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              autoFocus
            />

            <div className="paste-modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowPasteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-apply"
                onClick={handleApplyPasted}
                disabled={!pasteInput.trim()}
              >
                Apply Coordinates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
