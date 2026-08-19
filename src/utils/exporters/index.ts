import type { TopexRecord, BoundingBox } from '@/types';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 1. CSV Format
 */
export function exportToCsv(
  records: TopexRecord[],
  bounds?: BoundingBox,
  filename = `topex_data_${Date.now()}.csv`
): void {
  if (!records.length) return;

  const hasGravity = records.some((r) => r.gravity !== undefined);
  const hasElevation = records.some((r) => r.elevation !== undefined);

  const rows: string[] = [];
  rows.push('# TOPEX/Poseidon Global Seafloor Topography & Gravity Extraction');
  rows.push(`# Data Source: Scripps Institution of Oceanography, UC San Diego`);
  rows.push(`# Extracted: ${new Date().toISOString()}`);
  if (bounds) {
    rows.push(`# Bounds: North=${bounds.north}, South=${bounds.south}, West=${bounds.west}, East=${bounds.east}`);
  }

  const headers = ['Longitude', 'Latitude'];
  if (hasElevation) headers.push('Elevation_m');
  if (hasGravity) headers.push('Gravity_mGal');
  rows.push(headers.join(','));

  for (const r of records) {
    const row = [r.longitude.toFixed(4), r.latitude.toFixed(4)];
    if (hasElevation) row.push(r.elevation !== undefined ? r.elevation.toFixed(2) : '');
    if (hasGravity) row.push(r.gravity !== undefined ? r.gravity.toFixed(2) : '');
    rows.push(row.join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * 2. GeoJSON Format (For QGIS, ArcGIS, Mapbox, Leaflet, Kepler.gl)
 */
export function exportToGeoJson(
  records: TopexRecord[],
  bounds?: BoundingBox,
  filename = `topex_soundings_${Date.now()}.geojson`
): void {
  if (!records.length) return;

  const hasGravity = records.some((r) => r.gravity !== undefined);

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      title: 'TOPEX/Poseidon Global Seafloor Topography & Marine Gravity',
      source: 'Scripps Institution of Oceanography, UC San Diego (Smith & Sandwell, 1997)',
      extractedAt: new Date().toISOString(),
      bounds: bounds || null,
      count: records.length,
    },
    features: records.map((r, i) => ({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'Point',
        coordinates: [
          parseFloat(r.longitude.toFixed(4)),
          parseFloat(r.latitude.toFixed(4)),
          r.elevation !== undefined ? parseFloat(r.elevation.toFixed(2)) : 0,
        ],
      },
      properties: {
        longitude: parseFloat(r.longitude.toFixed(4)),
        latitude: parseFloat(r.latitude.toFixed(4)),
        elevation_m: r.elevation !== undefined ? parseFloat(r.elevation.toFixed(2)) : null,
        ...(hasGravity && {
          gravity_mGal: r.gravity !== undefined ? parseFloat(r.gravity.toFixed(2)) : null,
        }),
        sounding_type:
          r.elevation !== undefined
            ? r.elevation % 2 !== 0
              ? 'Ship Sounding Constrained'
              : 'Satellite Predicted'
            : null,
      },
    })),
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: 'application/geo+json;charset=utf-8;',
  });
  triggerDownload(blob, filename);
}

/**
 * 3. ASCII XYZ Grid Format (For GMT Generic Mapping Tools, Oceanography Scripts)
 */
export function exportToXyz(
  records: TopexRecord[],
  _bounds?: BoundingBox,
  filename = `topex_grid_${Date.now()}.xyz`
): void {
  if (!records.length) return;

  const hasGravity = records.some((r) => r.gravity !== undefined);
  const rows: string[] = [];

  for (const r of records) {
    if (hasGravity) {
      rows.push(
        `${r.longitude.toFixed(4)} ${r.latitude.toFixed(4)} ${(r.elevation ?? 0).toFixed(2)} ${(r.gravity ?? 0).toFixed(2)}`
      );
    } else {
      rows.push(
        `${r.longitude.toFixed(4)} ${r.latitude.toFixed(4)} ${(r.elevation ?? 0).toFixed(2)}`
      );
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/plain;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * 4. KML Format (For Google Earth 3D)
 */
export function exportToKml(
  records: TopexRecord[],
  _bounds?: BoundingBox,
  filename = `topex_soundings_${Date.now()}.kml`
): void {
  if (!records.length) return;

  const kmlRows: string[] = [];
  kmlRows.push('<?xml version="1.0" encoding="UTF-8"?>');
  kmlRows.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  kmlRows.push('  <Document>');
  kmlRows.push('    <name>TOPEX Seafloor Soundings</name>');
  kmlRows.push('    <description>Scripps Institution of Oceanography Bathymetry Data</description>');

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const elev = r.elevation !== undefined ? `${r.elevation.toFixed(2)}m` : 'N/A';
    const grav = r.gravity !== undefined ? `${r.gravity.toFixed(2)}mGal` : 'N/A';

    kmlRows.push('    <Placemark>');
    kmlRows.push(`      <name>Sounding #${i + 1}</name>`);
    kmlRows.push(`      <description>Elevation: ${elev}, Gravity: ${grav}</description>`);
    kmlRows.push('      <Point>');
    kmlRows.push(`        <coordinates>${r.longitude.toFixed(4)},${r.latitude.toFixed(4)},${r.elevation ?? 0}</coordinates>`);
    kmlRows.push('      </Point>');
    kmlRows.push('    </Placemark>');
  }

  kmlRows.push('  </Document>');
  kmlRows.push('</kml>');

  const blob = new Blob([kmlRows.join('\n')], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * 5. Structured JSON Format
 */
export function exportToJson(
  records: TopexRecord[],
  bounds?: BoundingBox,
  filename = `topex_data_${Date.now()}.json`
): void {
  if (!records.length) return;

  const payload = {
    metadata: {
      source: 'Scripps Institution of Oceanography, UCSD',
      extractedAt: new Date().toISOString(),
      bounds: bounds || null,
      count: records.length,
    },
    data: records,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * 6. YAML Format
 */
export function exportToYaml(
  records: TopexRecord[],
  bounds?: BoundingBox,
  filename = `topex_data_${Date.now()}.yaml`
): void {
  if (!records.length) return;

  const yamlLines: string[] = [];
  yamlLines.push('# TOPEX Seafloor Topography & Marine Gravity');
  yamlLines.push(`source: "Scripps Institution of Oceanography, UCSD"`);
  yamlLines.push(`extractedAt: "${new Date().toISOString()}"`);
  yamlLines.push(`count: ${records.length}`);
  if (bounds) {
    yamlLines.push(`bounds:`);
    yamlLines.push(`  north: ${bounds.north}`);
    yamlLines.push(`  south: ${bounds.south}`);
    yamlLines.push(`  west: ${bounds.west}`);
    yamlLines.push(`  east: ${bounds.east}`);
  }
  yamlLines.push('data:');
  for (const r of records) {
    yamlLines.push(`  - lon: ${r.longitude.toFixed(4)}`);
    yamlLines.push(`    lat: ${r.latitude.toFixed(4)}`);
    if (r.elevation !== undefined) yamlLines.push(`    elevation_m: ${r.elevation.toFixed(2)}`);
    if (r.gravity !== undefined) yamlLines.push(`    gravity_mGal: ${r.gravity.toFixed(2)}`);
  }

  const blob = new Blob([yamlLines.join('\n')], { type: 'text/yaml;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * 7. XML Format
 */
export function exportToXml(
  records: TopexRecord[],
  bounds?: BoundingBox,
  filename = `topex_data_${Date.now()}.xml`
): void {
  if (!records.length) return;

  const xmlLines: string[] = [];
  xmlLines.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlLines.push('<topexExtract>');
  xmlLines.push('  <metadata>');
  xmlLines.push('    <source>Scripps Institution of Oceanography, UCSD</source>');
  xmlLines.push(`    <extractedAt>${new Date().toISOString()}</extractedAt>`);
  xmlLines.push(`    <count>${records.length}</count>`);
  if (bounds) {
    xmlLines.push('    <bounds>');
    xmlLines.push(`      <north>${bounds.north}</north>`);
    xmlLines.push(`      <south>${bounds.south}</south>`);
    xmlLines.push(`      <west>${bounds.west}</west>`);
    xmlLines.push(`      <east>${bounds.east}</east>`);
    xmlLines.push('    </bounds>');
  }
  xmlLines.push('  </metadata>');
  xmlLines.push('  <soundings>');

  for (const r of records) {
    xmlLines.push('    <sounding>');
    xmlLines.push(`      <longitude>${r.longitude.toFixed(4)}</longitude>`);
    xmlLines.push(`      <latitude>${r.latitude.toFixed(4)}</latitude>`);
    if (r.elevation !== undefined) xmlLines.push(`      <elevation>${r.elevation.toFixed(2)}</elevation>`);
    if (r.gravity !== undefined) xmlLines.push(`      <gravity>${r.gravity.toFixed(2)}</gravity>`);
    xmlLines.push('    </sounding>');
  }

  xmlLines.push('  </soundings>');
  xmlLines.push('</topexExtract>');

  const blob = new Blob([xmlLines.join('\n')], { type: 'application/xml;charset=utf-8;' });
  triggerDownload(blob, filename);
}
