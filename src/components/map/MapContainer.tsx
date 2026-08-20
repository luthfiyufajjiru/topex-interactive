import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import type { BoundingBox } from '@/types';
import { MapSearchBar, LocationResult } from './MapSearchBar';

// Fix Leaflet marker icons in bundlers
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapContainerProps {
  bounds: BoundingBox | null;
  onBoundsChange: (bounds: BoundingBox | null, source?: 'map' | 'input') => void;
  source?: 'map' | 'input' | null;
}

export const MapContainer: React.FC<MapContainerProps> = ({ bounds, onBoundsChange, source }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const currentLayerRef = useRef<L.Rectangle | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);

  const removeSearchMarker = () => {
    if (searchMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
  };

  const handleSelectLocation = (loc: LocationResult) => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove existing search pin
    removeSearchMarker();

    // Zoom/Pan to location
    if (loc.bbox) {
      map.flyToBounds(
        [
          [loc.bbox[0], loc.bbox[2]],
          [loc.bbox[1], loc.bbox[3]],
        ],
        { maxZoom: 10, duration: 1.2 }
      );
    } else {
      map.flyTo([loc.lat, loc.lon], 9, { duration: 1.2 });
    }

    // Add glowing search pinpoint marker
    const pinIcon = L.divIcon({
      className: 'search-pin-container',
      html: `
        <div class="search-pin-wrapper">
          <div class="search-pin-pulse"></div>
          <div class="search-pin-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span class="search-pin-title">${loc.name}</span>
          </div>
        </div>
      `,
      iconSize: [140, 36],
      iconAnchor: [70, 32],
    });

    const marker = L.marker([loc.lat, loc.lon], { icon: pinIcon })
      .bindPopup(
        `<div style="font-family: var(--font-sans); font-size: 13px; padding: 2px;">` +
          `<strong>${loc.name}</strong><br/>` +
          `<span style="color: #64748b; font-family: var(--font-mono); font-size: 11px;">${loc.lat.toFixed(4)}°, ${loc.lon.toFixed(4)}°</span><br/>` +
          `<div style="margin-top: 4px; color: #0284c7; font-weight: 600; font-size: 12px;">` +
          `Draw a rectangle to select this area` +
          `</div>` +
          `</div>`
      )
      .addTo(map);

    marker.openPopup();
    searchMarkerRef.current = marker;
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize original Leaflet Map (center 0, 120, zoom 4.4)
    const map = new L.Map(containerRef.current, {
      center: new L.LatLng(0, 120),
      zoom: 4.4,
      minZoom: 1,
      maxZoom: 20,
    });

    // Google Satellite (Google Earth imagery) - primary default layer
    const googleSatellite = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      {
        attribution: 'Google',
        maxZoom: 20,
      }
    );

    // Google Hybrid (Satellite + Labels)
    const googleHybrid = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      {
        attribution: 'Google',
        maxZoom: 20,
      }
    );

    // ESRI Ocean Bathymetry
    const esriOcean = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; GEBCO, NOAA, CHS, SIO',
        maxZoom: 13,
      }
    );

    // OpenStreetMap
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    });

    // Default to Google Satellite (Google Earth)
    googleSatellite.addTo(map);

    const drawnItems = new L.FeatureGroup().addTo(map);
    drawnItemsRef.current = drawnItems;

    L.control
      .layers(
        {
          'Google Satellite (Earth)': googleSatellite,
          'Google Hybrid': googleHybrid,
          'Ocean Bathymetry': esriOcean,
          'OpenStreetMap': osm,
        },
        { 'Draw Layer': drawnItems },
        { position: 'topleft', collapsed: true }
      )
      .addTo(map);

    // Leaflet Draw Control with Rectangle & Edit toolbar
    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
      draw: {
        polygon: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
        rectangle: {
          shapeOptions: {
            color: '#007aff',
            weight: 2,
            fillOpacity: 0.15,
          },
          metric: false,
          showArea: true,
        },
      },
    });
    map.addControl(drawControl);

    const extractBoundsFromLayer = (layer: L.Rectangle) => {
      const b = layer.getBounds();
      const north = parseFloat(b.getNorth().toFixed(4));
      const south = parseFloat(b.getSouth().toFixed(4));
      const west = parseFloat(b.getWest().toFixed(4));
      const east = parseFloat(b.getEast().toFixed(4));

      onBoundsChange(
        {
          north,
          south,
          west,
          east,
        },
        'map'
      );
    };

    // Remove search pinpoint marker as soon as user starts drawing or finishes drawing
    map.on(L.Draw.Event.DRAWSTART as any, () => {
      removeSearchMarker();
    });

    map.on(L.Draw.Event.CREATED, (event: any) => {
      removeSearchMarker();
      drawnItems.clearLayers();
      const layer = event.layer as L.Rectangle;
      drawnItems.addLayer(layer);
      currentLayerRef.current = layer;
      extractBoundsFromLayer(layer);
    });

    map.on(L.Draw.Event.EDITED, (event: any) => {
      removeSearchMarker();
      event.layers.eachLayer((layer: any) => {
        currentLayerRef.current = layer;
        extractBoundsFromLayer(layer);
      });
    });

    map.on(L.Draw.Event.EDITMOVE as any, (event: any) => {
      if (event.layer) {
        currentLayerRef.current = event.layer;
        extractBoundsFromLayer(event.layer);
      }
    });

    map.on(L.Draw.Event.EDITRESIZE as any, (event: any) => {
      if (event.layer) {
        currentLayerRef.current = event.layer;
        extractBoundsFromLayer(event.layer);
      }
    });

    map.on(L.Draw.Event.DELETED, () => {
      currentLayerRef.current = null;
      onBoundsChange(null, 'map');
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      currentLayerRef.current = null;
    };
  }, []);

  // Synchronize ONLY when bounds changed from manual input typing (NOT from map drawing)
  useEffect(() => {
    if (!mapRef.current || !drawnItemsRef.current) return;

    if (source === 'map') return;

    const drawnItems = drawnItemsRef.current;

    if (!bounds) {
      drawnItems.clearLayers();
      currentLayerRef.current = null;
      return;
    }

    const sw = new L.LatLng(bounds.south, bounds.west);
    const ne = new L.LatLng(bounds.north, bounds.east);
    const latLngBounds = new L.LatLngBounds(sw, ne);

    if (currentLayerRef.current && drawnItems.hasLayer(currentLayerRef.current)) {
      currentLayerRef.current.setBounds(latLngBounds);
    } else {
      drawnItems.clearLayers();
      const rect = new L.Rectangle(latLngBounds, {
        color: '#007aff',
        weight: 2,
        fillOpacity: 0.15,
      });
      drawnItems.addLayer(rect);
      currentLayerRef.current = rect;
    }
  }, [bounds, source]);

  return (
    <div className="map-wrapper-relative">
      <MapSearchBar
        onSelectLocation={handleSelectLocation}
        onClearLocation={removeSearchMarker}
      />
      <div id="map" ref={containerRef} />
    </div>
  );
};
