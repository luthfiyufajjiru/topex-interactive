import React from 'react';

export const Disclaimer: React.FC = () => {
  return (
    <div className="disclaimer">
      <strong>Scientific Methodology & Citations</strong>
      <div style={{ marginTop: '6px', lineHeight: '1.6' }}>
        <strong>Data Source:</strong> Scripps Institution of Oceanography, UC San Diego (Smith & Sandwell, 1997; Sandwell et al., 2014). Odd elevation values indicate ship sonar soundings; even values are satellite-predicted. Original CGI extractor:{' '}
        <a target="_blank" rel="noopener noreferrer" href="https://topex.ucsd.edu/cgi-bin/get_data.cgi">
          topex.ucsd.edu
        </a>.
      </div>
      <div style={{ marginTop: '8px', fontSize: '0.82rem', color: '#64748b', lineHeight: '1.5' }}>
        <strong>Geophysical Reduction & Separation Citations:</strong>
        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
          <li><strong>Complete Bouguer Anomaly:</strong> Blakely, R. J. (1995). <em>Potential Theory in Gravity and Magnetic Applications</em>. Cambridge University Press; Telford, W. M., et al. (1990). <em>Applied Geophysics</em>.</li>
          <li><strong>Density Determination:</strong> Parasnis, D. S. (1962). <em>Principles of Applied Geophysics</em>. Chapman & Hall; Nettleton, L. L. (1939). Determination of density for reduction of gravimeter observations. <em>Geophysics</em>, 4(3), 176–183.</li>
          <li><strong>Regional-Residual Separation:</strong> Griffin, W. R. (1949). Residual gravity in theory and practice. <em>Geophysics</em>, 14(1), 39–56; Nettleton, L. L. (1954). Regionals, residuals, and structures. <em>Geophysics</em>, 19(1), 1–22.</li>
        </ul>
      </div>
    </div>
  );
};
