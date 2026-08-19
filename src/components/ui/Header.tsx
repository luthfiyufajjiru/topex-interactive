import React from 'react';
import { Github } from 'lucide-react';

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
          <span className="navbar-title">TOPEX Interactive Downloader</span>
        </a>

        <div className="navbar-actions">
          <a
            className="btn-nav-github"
            href="https://github.com/luthfiyufajjiru/topex-interactive"
            target="_blank"
            rel="noopener noreferrer"
            title="View Source Repository on GitHub"
          >
            <Github size={15} />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
};
