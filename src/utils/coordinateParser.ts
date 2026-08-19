import type { BoundingBox } from '@/types';

/**
 * Parses coordinate text from multiple formats:
 * - URL: ?north=10&south=5&west=100&east=110
 * - Key-Value: "North: 10, South: 5, West: 100, East: 110" or "N: 10, S: 5, W: 100, E: 110"
 * - JSON: {"north": 10, "south": 5, "west": 100, "east": 110}
 * - GeoJSON BBOX: "[100, 5, 110, 10]" (minX, minY, maxX, maxY)
 * - Comma-separated: "10, 5, 100, 110" (North, South, West, East)
 */
export function parseCoordinateText(text: string): BoundingBox | null {
  if (!text || !text.trim()) return null;
  const raw = text.trim();

  // 1. Check URL query string format
  if (raw.includes('north=') || raw.includes('south=') || raw.includes('west=') || raw.includes('east=')) {
    try {
      const url = raw.startsWith('http') ? new URL(raw) : new URL(`http://dummy.com?${raw.replace(/^\?/, '')}`);
      const north = parseFloat(url.searchParams.get('north') || '');
      const south = parseFloat(url.searchParams.get('south') || '');
      const west = parseFloat(url.searchParams.get('west') || '');
      const east = parseFloat(url.searchParams.get('east') || '');

      if (!isNaN(north) && !isNaN(south) && !isNaN(west) && !isNaN(east)) {
        return validateAndSanitizeBounds({ north, south, west, east });
      }
    } catch {
      // Fall through to regex
    }
  }

  // 2. Check JSON format
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      const north = parseFloat(parsed.north ?? parsed.N ?? parsed.latMax);
      const south = parseFloat(parsed.south ?? parsed.S ?? parsed.latMin);
      const west = parseFloat(parsed.west ?? parsed.W ?? parsed.lonMin);
      const east = parseFloat(parsed.east ?? parsed.E ?? parsed.lonMax);

      if (!isNaN(north) && !isNaN(south) && !isNaN(west) && !isNaN(east)) {
        return validateAndSanitizeBounds({ north, south, west, east });
      }
    } catch {
      // Fall through
    }
  }

  // 3. Check GeoJSON BBOX format: [minX, minY, maxX, maxY] -> [west, south, east, north]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const nums = JSON.parse(raw);
      if (Array.isArray(nums) && nums.length === 4) {
        const west = parseFloat(nums[0]);
        const south = parseFloat(nums[1]);
        const east = parseFloat(nums[2]);
        const north = parseFloat(nums[3]);

        if (!isNaN(north) && !isNaN(south) && !isNaN(west) && !isNaN(east)) {
          return validateAndSanitizeBounds({ north, south, west, east });
        }
      }
    } catch {
      // Fall through
    }
  }

  // 4. Regex key-value matching: "North: 10, South: 5, West: 100, East: 110"
  const nMatch = raw.match(/(?:north|n)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)/i);
  const sMatch = raw.match(/(?:south|s)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)/i);
  const wMatch = raw.match(/(?:west|w)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)/i);
  const eMatch = raw.match(/(?:east|e)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)/i);

  if (nMatch && sMatch && wMatch && eMatch) {
    const north = parseFloat(nMatch[1]);
    const south = parseFloat(sMatch[1]);
    const west = parseFloat(wMatch[1]);
    const east = parseFloat(eMatch[1]);
    return validateAndSanitizeBounds({ north, south, west, east });
  }

  // 5. Comma / space delimited numbers (N, S, W, E or W, S, E, N)
  const numbers = raw
    .replace(/[^\d.+-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (numbers.length >= 4) {
    // Treat as North, South, West, East
    const north = numbers[0];
    const south = numbers[1];
    const west = numbers[2];
    const east = numbers[3];

    return validateAndSanitizeBounds({ north, south, west, east });
  }

  return null;
}

function validateAndSanitizeBounds(b: BoundingBox): BoundingBox | null {
  const north = Math.min(80.738, Math.max(-80.738, b.north));
  const south = Math.min(80.738, Math.max(-80.738, b.south));
  const west = Math.min(360, Math.max(-360, b.west));
  const east = Math.min(360, Math.max(-360, b.east));

  if (north <= south || east <= west) {
    return null;
  }

  return {
    north: parseFloat(north.toFixed(4)),
    south: parseFloat(south.toFixed(4)),
    west: parseFloat(west.toFixed(4)),
    east: parseFloat(east.toFixed(4)),
  };
}

export function formatCoordinateText(bounds: BoundingBox): string {
  return `North: ${bounds.north.toFixed(4)}, South: ${bounds.south.toFixed(4)}, West: ${bounds.west.toFixed(4)}, East: ${bounds.east.toFixed(4)}`;
}

export function getShareableUrl(bounds: BoundingBox, includeGravity: boolean): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('north', bounds.north.toFixed(4));
  url.searchParams.set('south', bounds.south.toFixed(4));
  url.searchParams.set('west', bounds.west.toFixed(4));
  url.searchParams.set('east', bounds.east.toFixed(4));
  url.searchParams.set('gravity', includeGravity ? 'true' : 'false');
  return url.toString();
}

export function parseUrlParams(): { bounds: BoundingBox; includeGravity: boolean } | null {
  if (typeof window === 'undefined') return null;
  const searchParams = new URLSearchParams(window.location.search);

  const north = parseFloat(searchParams.get('north') || '');
  const south = parseFloat(searchParams.get('south') || '');
  const west = parseFloat(searchParams.get('west') || '');
  const east = parseFloat(searchParams.get('east') || '');
  const gravityParam = searchParams.get('gravity');

  if (!isNaN(north) && !isNaN(south) && !isNaN(west) && !isNaN(east)) {
    const sanitized = validateAndSanitizeBounds({ north, south, west, east });
    if (sanitized) {
      return {
        bounds: sanitized,
        includeGravity: gravityParam !== 'false',
      };
    }
  }

  return null;
}
