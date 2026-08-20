import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BoundingBox, TopexRecord, WorkflowStep, BouguerParams, GeophysicsSummaryStats } from '@/types';
import { fetchLargeGridInChunks, ChunkProgress } from '@/api/parallelFetcher';
import { parseUrlParams } from '@/utils/coordinateParser';
import { calculateBouguerAnomaly, computeGeophysicsStats } from '@/utils/geophysics/bouguer';
import { separateRegionalResidual } from '@/utils/geophysics/regionalResidual';
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
import { Download, Loader2, ArrowRight, Github, AlertTriangle, CheckCircle2, Play } from 'lucide-react';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('extract');
  const [bounds, setBounds] = useState<BoundingBox | null>(null);
  const [boundsSource, setBoundsSource] = useState<'map' | 'input' | null>(null);
  const [includeGravity, setIncludeGravity] = useState<boolean>(true);
  const [records, setRecords] = useState<TopexRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'loading' | 'completed' | 'partial'>('idle');
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [lastProgress, setLastProgress] = useState<ChunkProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Bouguer Anomaly Reduction Parameters
  const [bouguerParams, setBouguerParams] = useState<BouguerParams>({
    crustalDensity: 2.67,
    waterDensity: 1.03,
    includeCurvatureBullardB: false,
  });

  // Calculate Processed Records with Complete Bouguer Anomaly & 2D Polynomial Regional-Residual Separation
  // Defer heavy matrix regression until user leaves Step 1 (or only compute lightweight Bouguer in Step 1)
  const processedRecords = useMemo(() => {
    if (records.length === 0) return [];
    const withBouguer = calculateBouguerAnomaly(records, bouguerParams);
    // If still extracting in Step 1, avoid locking UI with 2D polynomial regressions on every chunk stream
    if (currentStep === 'extract') {
      return withBouguer;
    }
    return separateRegionalResidual(withBouguer, { method: 'poly2' });
  }, [records, bouguerParams, currentStep]);

  // Compute Geophysics Summary Statistics lazily
  const geophysicsStats = useMemo<GeophysicsSummaryStats>(() => {
    if (processedRecords.length === 0) {
      return {
        count: 0,
        topography: { min: 0, max: 0, mean: 0, stdDev: 0, rms: 0 },
      };
    }
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
    // If user changes bounding box, reset completed/partial flags
    setExtractionStatus('idle');
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
    if (records.length > 0) {
      setExtractionStatus('partial');
      setErrorMsg('Extraction paused. You can resume to complete missing tiles.');
    } else {
      setExtractionStatus('idle');
      setErrorMsg('Data extraction cancelled.');
    }
  };

  const handleFetch = async (isResume = false) => {
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
    if (!isResume) {
      setRecords([]); // Reset only when starting fresh
      setLastProgress(null);
    }
    setIsLoading(true);
    setExtractionStatus('loading');

    try {
      const result = await fetchLargeGridInChunks({
        bounds,
        includeGravity,
        concurrency: 2,
        abortSignal: abortController.signal,
        onChunkReceived: (newChunkRecords, p) => {
          setRecords((prev) => {
            if (isResume) {
              const existingKeys = new Set(prev.map((r) => `${r.longitude.toFixed(4)}_${r.latitude.toFixed(4)}`));
              const fresh = newChunkRecords.filter(
                (r) => !existingKeys.has(`${r.longitude.toFixed(4)}_${r.latitude.toFixed(4)}`)
              );
              return [...prev, ...fresh];
            }
            return [...prev, ...newChunkRecords];
          });
          setProgress(p);
          setLastProgress(p);
        },
        onProgress: (p) => {
          setProgress(p);
          setLastProgress(p);
        },
      });

      if (!abortController.signal.aborted) {
        if (!result.records || result.records.length === 0) {
          setErrorMsg('Server returned 0 records for the given area.');
          setExtractionStatus('idle');
          return;
        }

        setRecords(result.records);
        setExtractionStatus('completed');
        const tileText = result.totalTiles > 1 ? ` across ${result.totalTiles} parallel tiles` : '';
        setSuccessMsg(
          `Extracted ${result.records.length.toLocaleString()} soundings${tileText} in ${result.executionTimeMs}ms.`
        );
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Error fetching data';
        setErrorMsg(msg);
        setExtractionStatus(records.length > 0 ? 'partial' : 'idle');
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
                onClick={() => handleFetch(false)}
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
                    <span>{records.length > 0 ? 'Re-Fetch Soundings Grid' : 'Fetch Soundings Grid'}</span>
                  </>
                )}
              </button>

              {/* Non-blocking Streaming Progress Banner */}
              {isLoading && <StreamingProgressBar progress={progress} onCancel={handleCancel} />}

              {/* Incomplete / Interrupted / Rate Limited State Banner */}
              {!isLoading && extractionStatus === 'partial' && (
                <div className="step-partial-banner">
                  <div className="partial-banner-info">
                    <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="partial-banner-title">
                        Extraction Incomplete: {lastProgress ? `${lastProgress.completedTiles} of ${lastProgress.totalTiles} tiles loaded` : `${records.length.toLocaleString()} points retrieved`}
                      </div>
                      <div className="partial-banner-subtitle">
                        {errorMsg || 'Process stopped before completing all grid tiles. Cached tiles are preserved.'}
                      </div>
                    </div>
                  </div>
                  <div className="partial-banner-actions">
                    <button
                      type="button"
                      className="btn-resume-extraction"
                      onClick={() => handleFetch(true)}
                    >
                      <Play size={16} />
                      <span>Continue Extraction</span>
                    </button>
                    {includeGravity && records.length > 0 && (
                      <button
                        type="button"
                        className="btn-proceed-partial"
                        onClick={() => setCurrentStep('process')}
                        title="Proceed to Bouguer reduction with current partial soundings"
                      >
                        <span>Proceed with Partial Grid &rarr;</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step Transition Hint (100% Fully Complete Only) */}
              {records.length > 0 && includeGravity && !isLoading && extractionStatus === 'completed' && (
                <div className="step-advance-banner">
                  <div className="step-advance-text">
                    <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                    <div>
                      <strong>{records.length.toLocaleString()} Soundings Ready</strong> &bull; Topography and Free-Air Gravity 100% extracted.
                    </div>
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
            <TriMapViewer
              records={processedRecords}
              bounds={bounds}
              bouguerParams={bouguerParams}
              onBackToExtract={() => setCurrentStep('extract')}
            />
          </div>
        )}

        {/* Scientific Attribution */}
        <Disclaimer />
      </main>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <span>
              &copy; <a target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/in/yufajjiru/">Luthfi Yufajjiru</a>{' '}
              2022&ndash;2026 &bull; Free Commercial Use (No Commercial Redistribution)
            </span>
          </div>

          <div className="footer-right">
            <a
              className="footer-repo-link"
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/luthfiyufajjiru/topex-interactive"
              title="View source repository on GitHub"
            >
              <Github size={16} />
              <span>GitHub Repository</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
