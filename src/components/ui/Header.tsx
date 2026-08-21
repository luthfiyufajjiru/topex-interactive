import React, { useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

export const Header: React.FC = () => {
  const { deferredPrompt, isInstalled, installPWA } = usePWAInstall();
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await installPWA();
    } else {
      setIsGuideOpen(true);
    }
  };

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <a className="navbar-brand" id="nav-title" href="/">
            <img
              src="/assets/icon.ico"
              alt="Topex Icon"
              className="navbar-brand-icon"
              onError={(e) => {
                // Hide image if failed to load
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="navbar-title">TOPEX Interactive Downloader</span>
            <span className="badge-terraversi">Powered by Terraversi</span>
          </a>

          <div className="navbar-actions">
            {!isInstalled && (
              <button
                type="button"
                id="btn-install-pwa"
                className="btn-nav-pwa-install"
                onClick={handleInstallClick}
                title="Install TOPEX Studio as desktop or mobile App"
              >
                <Download size={14} />
                <span>Install App</span>
              </button>
            )}

            {isInstalled && (
              <span className="badge-pwa-installed" title="Running in standalone PWA application mode">
                <CheckCircle2 size={13} />
                <span>App Installed</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* PWA Installation Instructions Modal */}
      <PWAInstallModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onInstall={installPWA}
        hasPrompt={!!deferredPrompt}
      />
    </>
  );
};
