import React from 'react';
import { Waves } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <a className="navbar-brand" href="/">
          <div className="brand-icon-box">
            <Waves size={18} strokeWidth={2.5} />
          </div>
          <span className="navbar-title">Topex Interactive Downloader</span>
        </a>
      </div>
    </header>
  );
};
