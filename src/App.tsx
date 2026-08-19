import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BoundingBox, TopexRecord, WorkflowStep, BouguerParams } from '@/types';
import { fetchLargeGridInChunks, ChunkProgress } from '@/api/parallelFetcher';
import { parseUrlParams } from '@/utils/coordinateParser';
import { calculateBouguerAnomaly, computeGeophysicsStats } from '@/utils/geophysics/bouguer';
import { Header } from '@/components/ui/Header';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Toast } from '@/components/ui/Toast';
import { StreamingProgressBar } from '@/components/ui/StreamingProgressBar';
import { WorkflowStepper } from '@/components/stepper/WorkflowStepper';
import { MapContainer } from '@/components/map/MapContainer';
import { CoordinateInputs } from '@/components/hud/CoordinateInputs';
import { DatasetToggles } from '@/components/hud/DatasetToggles';
import { DataTable } from '@/components/table/DataTable';
import { BouguerControlPanel } from '@/components/processing/BouguerControlPanel';
import { TriMapViewer } from '@/components/studio/TriMapViewer';
import { Download, Loader2, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('extract');
  const [bounds, setBounds] = useState<BoundingBox | null>(null);
  const [boundsSource, setBoundsSource] = useState<'map' | 'input' | null>(null);
  const [includeGravity, setIncludeGravity] = useState<boolean>(true);
  const [records, setRecords] = useState<TopexRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bouguer Anomaly Reduction Parameters
  const [bouguerParams, setBouguerParams] = useState<BouguerParams>({
    crustalDensity: 2.67,
    waterDensity: 1.03,
    includeCurvatureBullardB: false,
  });

  // Calculate Processed Records with Complete Bouguer Anomaly
  const processedRecords = useMemo(() => {
    if (records.length === 0) return [];
    return calculateBouguerAnomaly(records, bouguerParams);
  }, [records, bouguerParams]);

  // Compute Complete Geophysics Summary Statistics
  const geophysicsStats = useMemo(() => {
    return computeGeophysicsStats(processedRecords);
  }, [processedRecords]);

  // Initialize from URL deep-link if query params exist (?north=...&south=...&west=...&east=...)
  useEffect(() => {
    const urlState = parseUrlParams();
    if (urlState) {
      setBounds(urlState.bounds);
      setBoundsSource('input');
      setIncludeGravity(urlState.includeGravity);
    }
  }, []);

  // Synchronize browser address bar URL with active coordinates & switches
  useEffect(() => {
    if (bounds) {
      const url = new URL(window.location.href);
      url.searchParams.set('north', bounds.north.toFixed(4));
      url.searchParams.set('south', bounds.south.toFixed(4));
      url.searchParams.set('west', bounds.west.toFixed(4));
      url.searchParams.set('east', bounds.east.toFixed(4));
      url.searchParams.set('gravity', includeGravity ? 'true' : 'false');
      window.history.replaceState({}, '', url.toString());
    }
  }, [bounds, includeGravity]);

  const handleBoundsChange = (newBounds: BoundingBox | null, source: 'map' | 'input' = 'map') => {
    setBounds(newBounds);
    setBoundsSource(source);
  };

  const handleToast = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message);
      setErrorMsg(null);
    } else {
      setErrorMsg(message);
      setSuccessMsg(null);
    }
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

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setErrorMsg(null);
    setSuccessMsg(null);
    setProgress(null);
    setRecords([]); // Reset for fresh stream
    setIsLoading(true);

    try {
      const result = await fetchLargeGridInChunks({
        bounds,
        includeGravity,
        concurrency: 6,
        abortSignal: abortController.signal,
        onChunkReceived: (newChunkRecords, p) => {
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

        {/* Workflow Stepper Navigation Header */}
        <WorkflowStepper
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          recordCount={records.length}
          hasGravity={includeGravity}
        />

        {/* STEP 1: Grid Extraction */}
        {currentStep === 'extract' && (
          <div className="step-fade-in">
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

              {/* 3-Row Compass Coordinates with Share / Copy / Paste Toolbar */}
              <CoordinateInputs
                bounds={bounds}
                includeGravity={includeGravity}
                onChange={(newBounds) => handleBoundsChange(newBounds, 'input')}
                onShowToast={handleToast}
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

              {/* Step Transition Hint */}
              {records.length > 0 && includeGravity && !isLoading && (
                <div className="step-advance-banner">
                  <div className="step-advance-text">
                    <strong>{records.length.toLocaleString()} Soundings Ready</strong> &bull; Topography and Free-Air Gravity extracted.
                  </div>
                  <button
                    type="button"
                    className="btn-next-step"
                    onClick={() => setCurrentStep('process')}
                  >
                    <span>Proceed to Bouguer Reduction</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Spreadsheet Table (Live Stream Direct to Table) */}
            <DataTable
              records={records}
              bounds={bounds}
              hasGravity={includeGravity}
              isStreaming={isLoading}
            />
          </div>
        )}

        {/* STEP 2: Bouguer Reduction & Parameters */}
        {currentStep === 'process' && (
          <div className="step-fade-in">
            <BouguerControlPanel
              params={bouguerParams}
              onParamsChange={setBouguerParams}
              stats={geophysicsStats}
              records={processedRecords}
              onProceedToStudio={() => setCurrentStep('studio')}
            />
          </div>
        )}

        {/* STEP 3: Satellite Gravity Studio & Exporters */}
        {currentStep === 'studio' && bounds && (
          <div className="step-fade-in">
            <TriMapViewer records={processedRecords} bounds={bounds} bouguerParams={bouguerParams} />
          </div>
        )}

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
            2022&ndash;2026
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            TOPEX/Poseidon &bull; Scripps Oceanography Data Extractor &bull; Oasis Montaj Studio
          </div>
        </div>
      </footer>
    </div>
  );
};
