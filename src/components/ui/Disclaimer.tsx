import React from 'react';

export const Disclaimer: React.FC = () => {
  return (
    <div className="disclaimer">
      <strong>Disclaimer & References</strong>
      <div>
        We do not own the corresponding dataset; all data belongs to the{' '}
        <strong>Scripps Institution of Oceanography, University of California San Diego</strong> (Smith &
        Sandwell, 1997; Sandwell et al., 2014). Odd elevation values represent ship sounding constraints;
        even values are predicted from satellite altimetry gravity anomalies. You can visit the original UCSD
        CGI data extractor{' '}
        <a target="_blank" rel="noopener noreferrer" href="https://topex.ucsd.edu/cgi-bin/get_data.cgi">
          here
        </a>
        .
      </div>
    </div>
  );
};
