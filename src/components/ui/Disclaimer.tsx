import React, { useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { CitationsModal } from '../modals/CitationsModal';

export const Disclaimer: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <footer className="footer-disclaimer">
        <div className="footer-disclaimer-inner">
          <div className="footer-citation-brief">
            <span>Data Source: </span>
            <strong>Scripps Institution of Oceanography, UC San Diego</strong>
            <span className="text-muted"> (Sandwell et al., 2014 &bull; SIO V24.1/V18.1)</span>
          </div>
          <div className="footer-citation-actions">
            <button
              type="button"
              className="btn-footer-citations"
              onClick={() => setIsModalOpen(true)}
              title="View full scientific citations, formulas, and references"
            >
              <BookOpen size={13} />
              <span>Citations & References</span>
            </button>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://topex.ucsd.edu/cgi-bin/get_data.cgi"
              className="footer-external-link"
              title="Official Scripps TOPEX CGI Portal"
            >
              <span>UCSD Portal</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </footer>

      <CitationsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
