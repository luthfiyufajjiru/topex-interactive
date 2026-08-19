export interface ParsedDataPoint {
  longitude: number;
  latitude: number;
  value: number;
}

/**
 * Parses whitespace-delimited ASCII grid output from the UCSD get_data.cgi endpoint.
 * Format of each line: `<longitude> <latitude> <value>`
 */
export function parseTopexAscii(rawText: string): ParsedDataPoint[] {
  const lines = rawText.split(/\r?\n/);
  const results: ParsedDataPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Split on one or more whitespace characters
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const val = parseFloat(parts[2]);

      if (!isNaN(lon) && !isNaN(lat) && !isNaN(val)) {
        results.push({
          longitude: lon,
          latitude: lat,
          value: val,
        });
      }
    }
  }

  return results;
}
