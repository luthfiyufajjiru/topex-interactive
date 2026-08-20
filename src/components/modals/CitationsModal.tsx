import React from 'react';
import { X, BookOpen, ExternalLink } from 'lucide-react';

interface CitationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnchor?: string;
}

export const CitationsModal: React.FC<CitationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="export-modal-backdrop" onClick={onClose}>
      <div
        className="export-modal-dialog citations-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="export-modal-header">
          <div className="export-modal-title-group">
            <BookOpen className="text-primary-blue" size={20} />
            <div>
              <h3 className="export-modal-title">Geophysical Methodology & Citations</h3>
              <p className="export-modal-subtitle">
                Scientific algorithms, data sources, and indexed citations powering TOPEX Interactive
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="citations-modal-body">
          {/* Section 1: Satellite Gravity & Topography Data */}
          <div className="citation-card" id="citation-satellite-data">
            <div className="citation-header">
              <span className="citation-badge">[1]</span>
              <h4 className="citation-title">Global Marine Gravity & Bathymetry Models</h4>
            </div>
            <p className="citation-authors">
              Sandwell, D. T., Müller, R. D., Smith, W. H. F., Garcia, E., & Francis, R. (2014).
            </p>
            <p className="citation-journal">
              <em>New global marine gravity model from CryoSat-2 and Jason-1 reveals buried tectonic structure</em>. <strong>Science</strong>, 346(6205), 65-67.
            </p>
            <div className="citation-details">
              <strong>Data Source:</strong> Scripps Institution of Oceanography (SIO) / UCSD 1-minute global marine gravity (V24.1) and Topography / Bathymetry database (V18.1). Derived from multi-satellite radar altimeter sea surface height measurements.
            </div>
            <a
              href="https://topex.ucsd.edu/marine_grav/mar_grav.html"
              target="_blank"
              rel="noopener noreferrer"
              className="citation-link"
            >
              <span>SIO / UCSD TOPEX Portal</span>
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Section 2: Complete Bouguer Reduction */}
          <div className="citation-card" id="citation-bouguer">
            <div className="citation-header">
              <span className="citation-badge">[2]</span>
              <h4 className="citation-title">Complete Bouguer Anomaly & Spherical Cap Reduction</h4>
            </div>
            <p className="citation-authors">
              Bullard, E. C. (1936).
            </p>
            <p className="citation-journal">
              <em>Gravity measurements in East Africa</em>. <strong>Philosophical Transactions of the Royal Society of London. Series A</strong>, 235(757), 445-531.
            </p>
            <div className="citation-details">
              <strong>Formulation:</strong> Complete Bouguer reduction accounts for the gravitational attraction of continental slabs and oceanic water mass deficits:
              <ul>
                <li><strong>Land (h &ge; 0):</strong> BA = FAA - 2&pi;G &rho;<sub>c</sub> h</li>
                <li><strong>Marine (h &lt; 0):</strong> BA = FAA + 2&pi;G (&rho;<sub>c</sub> - &rho;<sub>w</sub>) |h|</li>
              </ul>
              Standard crustal density &rho;<sub>c</sub> = 2.67 g/cm&sup3;, standard seawater density &rho;<sub>w</sub> = 1.03 g/cm&sup3;, gravitational constant G = 6.6743 &times; 10<sup>-11</sup> m&sup3;kg<sup>-1</sup>s<sup>-2</sup>.
            </div>
          </div>

          {/* Section 3: Regional-Residual Separation */}
          <div className="citation-card" id="citation-regional-residual">
            <div className="citation-header">
              <span className="citation-badge">[3]</span>
              <h4 className="citation-title">Regional & Residual Gravity Separation Methods</h4>
            </div>
            <p className="citation-authors">
              Griffin, W. R. (1949).
            </p>
            <p className="citation-journal">
              <em>Residual gravity anomaly. Inversion and polynomial surface separation</em>. <strong>Geophysics</strong>, 14(1), 39-56.
            </p>
            <div className="citation-details">
              <strong>Methods Available:</strong>
              <ul>
                <li><strong>Gaussian Low-Pass Filter:</strong> Smooth spatial kernel with Gaussian bell tapering over a configurable radius R in kilometers.</li>
                <li><strong>Griffin Moving Average:</strong> Discrete spatial boxcar ring averaging across local neighborhoods.</li>
                <li><strong>2D Polynomial Surface Trend:</strong> Ordinary Least-Squares (OLS) regression fitting 1st-order planar (z = ax + by + c) or 2nd-order paraboloid surfaces (z = ax&sup2; + by&sup2; + cxy + dx + ey + f).</li>
              </ul>
            </div>
          </div>

          {/* Section 4: WebGL 2.0 GPU Catmull-Rom Bicubic Spline */}
          <div className="citation-card" id="citation-webgl-gridding">
            <div className="citation-header">
              <span className="citation-badge">[4]</span>
              <h4 className="citation-title">GPU Shader Bicubic Spline Gridding (GLSL ES 3.00)</h4>
            </div>
            <p className="citation-authors">
              Catmull, E., & Rom, R. (1974).
            </p>
            <p className="citation-journal">
              <em>A class of local interpolating cubic splines</em>. <strong>Computer Aided Geometric Design</strong>, 317-326.
            </p>
            <div className="citation-details">
              <strong>GPU Engine:</strong> Real-time hardware potential-field rasterization via direct <code>R32F</code> float texture sampling with bicubic Catmull-Rom Hermite interpolation and dynamic colormapping executed in fragment shaders.
            </div>
          </div>
        </div>

        <div className="export-modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
