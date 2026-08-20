import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, MapPin } from 'lucide-react';

export interface LocationResult {
  lat: number;
  lon: number;
  name: string;
  bbox?: [number, number, number, number]; // [south, north, west, east]
}

interface MapSearchBarProps {
  onSelectLocation: (loc: LocationResult) => void;
  onClearLocation?: () => void;
}

const PRESET_LOCATIONS: LocationResult[] = [
  { name: 'Java Trench (Sunda)', lat: -9.5, lon: 110.0, bbox: [-11.0, -8.0, 107.0, 113.0] },
  { name: 'Mariana Trench', lat: 11.35, lon: 142.2, bbox: [10.0, 13.0, 140.0, 144.0] },
  { name: 'Hawaii (Big Island)', lat: 19.54, lon: -155.66, bbox: [18.8, 20.3, -156.2, -154.8] },
  { name: 'Mid-Atlantic Ridge', lat: 25.0, lon: -45.0, bbox: [22.0, 28.0, -48.0, -42.0] },
];

export const MapSearchBar: React.FC<MapSearchBarProps> = ({
  onSelectLocation,
  onClearLocation,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced geocoding search using Nominatim
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query
          )}&limit=5&addressdetails=1`,
          {
            headers: {
              'Accept-Language': 'en',
            },
          }
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();

        const formatted: LocationResult[] = data.map((item: any) => {
          let bbox: [number, number, number, number] | undefined;
          if (item.boundingbox && item.boundingbox.length === 4) {
            bbox = [
              parseFloat(item.boundingbox[0]), // south
              parseFloat(item.boundingbox[1]), // north
              parseFloat(item.boundingbox[2]), // west
              parseFloat(item.boundingbox[3]), // east
            ];
          }

          return {
            name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            bbox,
          };
        });

        setResults(formatted);
        setIsOpen(true);
      } catch (err) {
        console.error('Geocoding search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (loc: LocationResult) => {
    // Shorten display name if very long
    const shortName = loc.name.split(',').slice(0, 2).join(', ');
    setQuery(shortName);
    setIsOpen(false);
    onSelectLocation({ ...loc, name: shortName });
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    if (onClearLocation) onClearLocation();
  };

  return (
    <div className="map-search-bar-container" ref={searchRef}>
      <div className="map-search-input-wrapper">
        <Search size={15} className="map-search-icon" />
        <input
          type="text"
          className="map-search-input"
          placeholder="Search location (Java Trench, Hawaii, Mariana)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
        {isLoading && <Loader2 size={14} className="map-search-spinner animate-spin" />}
        {query && !isLoading && (
          <button
            type="button"
            className="map-search-clear-btn"
            onClick={handleClear}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Results / Presets Dropdown */}
      {isOpen && (
        <div className="map-search-dropdown">
          {results.length > 0 ? (
            <div className="map-search-results-list">
              <div className="map-search-dropdown-title">Search Results:</div>
              {results.map((loc, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="map-search-result-item"
                  onClick={() => handleSelect(loc)}
                >
                  <MapPin size={14} className="text-primary-blue" />
                  <div className="result-text-col">
                    <span className="result-name">{loc.name}</span>
                    <span className="result-coords">
                      {loc.lat.toFixed(3)}°, {loc.lon.toFixed(3)}°
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="map-search-empty">No locations found. Try another query.</div>
          ) : (
            <div className="map-search-presets-section">
              <div className="map-search-dropdown-title">Popular Geophysical Areas:</div>
              <div className="map-search-presets-chips">
                {PRESET_LOCATIONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="chip-search-preset"
                    onClick={() => handleSelect(preset)}
                  >
                    <MapPin size={12} />
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
