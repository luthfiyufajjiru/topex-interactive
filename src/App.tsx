import React, { useState, useRef } from 'react';
import type { BoundingBox, TopexRecord } from '@/types';
import { fetchLargeGridInChunks, ChunkProgress } from '@/api/parallelFetcher';
import { Header } from '@/components/ui/Header';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Toast } from '@/components/ui/Toast';
import { StreamingProgressBar } from '@/components/ui/StreamingProgressBar';
import { MapContainer } from '@/components/map/MapContainer';
import { CoordinateInputs } from '@/components/hud/CoordinateInputs';
import { DatasetToggles } from '@/components/hud/DatasetToggles';
import { DataTable } from '@/components/table/DataTable';
import { Download, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [bounds, setBounds] = useState<BoundingBox | null>(null);
  const [boundsSource, setBoundsSource] = useState<'map' | 'input' | null>(null);
  const [includeGravity, setIncludeGravity] = useState<boolean>(true);
  const [records, setRecords] = useState<TopexRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleBoundsChange = (newBounds: BoundingBox | null, source: 'map' | 'input' = 'map') => {
    setBounds(newBounds);
    setBoundsSource(source);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setProgress(null);
    setErrorMsg('Data extraction cancelled.');
  };

  const handleFetch = async () => {
    if (!bounds) {
      setErrorMsg('Please select or draw a bounding box on the map first.');
      return;
    }

    // Cancel any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setErrorMsg(null);
    setSuccessMsg(null);
    setProgress(null);
    setRecords([]); // Reset for fresh live stream
    setIsLoading(true);

    try {
      const result = await fetchLargeGridInChunks({
        bounds,
        includeGravity,
        concurrency: 6,
        abortSignal: abortController.signal,
        onChunkReceived: (newChunkRecords, p) => {
          // Stream directly into table state without blocking
          setRecords((prev) => [...prev, ...newChunkRecords]);
          setProgress(p);
        },
        onProgress: (p) => {
          setProgress(p);
        },
      });

      if (!abortController.signal.aborted) {
        if (!result.records || result.records.length === 0) {
          setErrorMsg('Server returned 0 records for the given area.');
          return;
        }

        const tileText = result.totalTiles > 1 ? ` across ${result.totalTiles} parallel tiles` : '';
        setSuccessMsg(
          `Extracted ${result.records.length.toLocaleString()} soundings${tileText} in ${result.executionTimeMs}ms.`
        );
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Error fetching data';
        setErrorMsg(msg);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <div id="page-container">
      <Header />

      <main id="content-wrap">
        {errorMsg && <Toast type="error" message={errorMsg} onClose={() => setErrorMsg(null)} />}
        {successMsg && <Toast type="success" message={successMsg} onClose={() => setSuccessMsg(null)} />}

        {/* Map Viewport Card */}
        <div className="map-card">
          <MapContainer bounds={bounds} onBoundsChange={handleBoundsChange} source={boundsSource} />
        </div>

        {/* Controls Card */}
        <div className="controls-section">
          {/* Free Air Gravity Toggle */}
          <DatasetToggles
            includeGravity={includeGravity}
            onToggleGravity={setIncludeGravity}
          />

          {/* 3-Row Compass Coordinates */}
          <CoordinateInputs
            bounds={bounds}
            onChange={(newBounds) => handleBoundsChange(newBounds, 'input')}
            disabled={isLoading}
          />

          {/* Primary Action Button */}
          <button
            type="button"
            id="fetch-data"
            className="btn-download"
            onClick={handleFetch}
            disabled={!bounds || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={20} style={{ animation: 'rotate 1s linear infinite' }} />
                <span>Fetching Soundings Grid...</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>Fetch Soundings Grid</span>
              </>
            )}
          </button>

          {/* Non-blocking Streaming Progress Banner */}
          {isLoading && <StreamingProgressBar progress={progress} onCancel={handleCancel} />}
        </div>

        {/* Spreadsheet Table (Live Stream Direct to Table) */}
        <DataTable
          records={records}
          bounds={bounds}
          hasGravity={includeGravity}
          isStreaming={isLoading}
        />

        {/* Scientific Attribution */}
        <Disclaimer />
      </main>

      <footer>
        <div className="footer-inner">
          <div>
            Made with <span id="footer-content-love">&#10084;</span> by{' '}
            <a
              id="linkedin"
              target="_blank"
              rel="noopener noreferrer"
              href="https://www.linkedin.com/in/yufajjiru/"
            >
              Luthfi Yufajjiru
            </a>{' '}
            2022
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            TOPEX/Poseidon &bull; Scripps Oceanography Data Extractor
          </div>
        </div>
      </footer>
    </div>
  );
};
