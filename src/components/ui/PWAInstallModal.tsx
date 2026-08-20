import React from 'react';
import { X, Smartphone, Laptop, Share, PlusSquare, Download } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall?: () => void;
  hasPrompt?: boolean;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  onInstall,
  hasPrompt,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pwa-install-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="pwa-modal-header">
          <div className="pwa-modal-title-group">
            <div className="icon-badge-blue">
              <Download size={20} />
            </div>
            <div>
              <h3 className="export-modal-title">Install TOPEX Studio App</h3>
              <p className="export-modal-desc">
                Install as a standalone Progressive Web App (PWA) for desktop or mobile.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            title="Close install instructions"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="pwa-modal-body">
          <p className="pwa-guide-intro">
            Enjoy fast offline asset caching, standalone window frame without browser toolbars, and instant 1-click launch from your desktop or home screen.
          </p>

          <div className="pwa-guide-grid">
            {/* Desktop (Chrome / Edge / Brave) */}
            <div className="pwa-guide-card">
              <div className="pwa-guide-header">
                <Laptop size={18} className="text-sky" />
                <span>Desktop (Google Chrome, MS Edge, Brave)</span>
              </div>
              <ol className="pwa-steps-list">
                <li>Look at the right side of your <strong>browser URL address bar</strong>.</li>
                <li>Click the <strong>Install App icon (⊕ or 💻)</strong>.</li>
                <li>Click <strong>Install</strong> to add TOPEX Studio to your desktop and taskbar.</li>
              </ol>
            </div>

            {/* iOS Safari */}
            <div className="pwa-guide-card">
              <div className="pwa-guide-header">
                <Smartphone size={18} className="text-emerald" />
                <span>iPhone & iPad (Safari)</span>
              </div>
              <ol className="pwa-steps-list">
                <li>
                  Tap the <strong>Share button</strong> (
                  <Share size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  ) in the bottom navigation bar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong> (
                  <PlusSquare size={13} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  ).
                </li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
            </div>

            {/* Android Chrome */}
            <div className="pwa-guide-card">
              <div className="pwa-guide-header">
                <Smartphone size={18} className="text-amber" />
                <span>Android (Chrome / Edge)</span>
              </div>
              <ol className="pwa-steps-list">
                <li>Tap the browser menu icon (<strong>⋮</strong>) in the top-right corner.</li>
                <li>Tap <strong>Install App</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Confirm by tapping <strong>Install</strong>.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pwa-modal-footer">
          <div className="pwa-footer-status">
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Compatible with all modern PWA-supported browsers.
            </span>
          </div>

          <div className="modal-footer-buttons">
            <button type="button" className="btn-pwa-close" onClick={onClose}>
              Close
            </button>
            {hasPrompt && (
              <button
                type="button"
                className="btn-download-bundle"
                onClick={() => {
                  if (onInstall) onInstall();
                  onClose();
                }}
              >
                <Download size={15} />
                <span>Install Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
