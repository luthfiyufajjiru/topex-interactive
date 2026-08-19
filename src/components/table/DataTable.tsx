import React, { useState, useMemo, useRef } from 'react';
import type { TopexRecord, BoundingBox } from '@/types';
import { ExportDropdown } from './ExportDropdown';
import { Search, Table as TableIcon, Loader2 } from 'lucide-react';

interface DataTableProps {
  records: TopexRecord[];
  bounds: BoundingBox | null;
  hasGravity: boolean;
  isStreaming?: boolean;
}

const BATCH_SIZE = 100;

export const DataTable: React.FC<DataTableProps> = ({
  records,
  bounds,
  hasGravity,
  isStreaming = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter((r) => {
      return (
        r.longitude.toString().includes(term) ||
        r.latitude.toString().includes(term) ||
        (r.elevation !== undefined && r.elevation.toString().includes(term)) ||
        (r.gravity !== undefined && r.gravity.toString().includes(term))
      );
    });
  }, [records, searchTerm]);

  useMemo(() => {
    setVisibleCount((prev) => Math.max(prev, BATCH_SIZE));
  }, [records.length]);

  const visibleRecords = useMemo(() => {
    return filteredRecords.slice(0, visibleCount);
  }, [filteredRecords, visibleCount]);

  const handleScroll = () => {
    const el = tableWrapperRef.current;
    if (!el) return;

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      if (visibleCount < filteredRecords.length) {
        setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredRecords.length));
      }
    }
  };

  if (!records || records.length === 0) {
    return null;
  }

  const hasMore = visibleCount < filteredRecords.length;

  return (
    <div id="spreadsheet-wrapper">
      <div className="spreadsheet-header-bar">
        <div className="spreadsheet-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TableIcon size={18} />
            <strong style={{ fontSize: '1.05rem' }}>Soundings Spreadsheet</strong>
          </div>

          <span className="spreadsheet-badge">
            {records.length.toLocaleString()} soundings
          </span>

          {isStreaming && (
            <span className="streaming-live-pill">
              <Loader2 size={13} style={{ animation: 'rotate 1s linear infinite' }} />
              <span>Live Streaming</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search coordinates/depth..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 12px 6px 28px',
                borderRadius: '4px',
                border: 'none',
                fontSize: '0.8rem',
                outline: 'none',
                width: '200px',
              }}
            />
            <Search
              size={13}
              color="#94a3b8"
              style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }}
            />
          </div>

          {/* Multi-Format Export Dropdown */}
          <ExportDropdown records={records} bounds={bounds} />
        </div>
      </div>

      <div
        className="table-wrapper"
        ref={tableWrapperRef}
        onScroll={handleScroll}
        style={{ maxHeight: '460px', overflowY: 'auto' }}
      >
        <table className="classic-table">
          <thead>
            <tr>
              <th>Longitude (°E)</th>
              <th>Latitude (°N)</th>
              <th>Topography / Depth (m)</th>
              {hasGravity && <th>Free Air Gravity (mGal)</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--primary-blue-dark)', fontWeight: 600 }}>
                  {r.longitude.toFixed(4)}
                </td>
                <td>{r.latitude.toFixed(4)}</td>
                <td
                  style={{
                    fontWeight: (r.elevation ?? 0) % 2 !== 0 ? 700 : 400,
                  }}
                  title={
                    (r.elevation ?? 0) % 2 !== 0
                      ? 'Ship Sounding Constrained (Odd Value)'
                      : 'Satellite Predicted (Even Value)'
                  }
                >
                  {r.elevation !== undefined ? `${r.elevation.toFixed(2)} m` : '—'}
                </td>
                {hasGravity && (
                  <td style={{ color: '#b45309' }}>
                    {r.gravity !== undefined ? `${r.gravity.toFixed(2)} mGal` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {hasMore && (
          <div
            style={{
              padding: '10px 16px',
              textAlign: 'center',
              fontSize: '0.8rem',
              color: '#64748b',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            Showing {visibleRecords.length.toLocaleString()} of{' '}
            {filteredRecords.length.toLocaleString()} soundings
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'white',
          marginTop: '10px',
          fontSize: '0.82rem',
        }}
      >
        <span>
          {visibleRecords.length.toLocaleString()} of {filteredRecords.length.toLocaleString()} soundings rendered
        </span>
        <span>
          {hasMore
            ? `${(filteredRecords.length - visibleRecords.length).toLocaleString()} more`
            : 'All data points displayed'}
        </span>
      </div>
    </div>
  );
};
