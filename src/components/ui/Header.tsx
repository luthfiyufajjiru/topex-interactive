import React from 'react';

export const Header: React.FC = () => {
  return (
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
          <span className="navbar-title">Topex Interactive Downloader</span>
        </a>
      </div>
    </header>
  );
};
