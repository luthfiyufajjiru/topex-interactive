import { parseTopexAscii, ParsedDataPoint } from './asciiParser';

const TOPEX_CGI_URL = 'https://topex.ucsd.edu/cgi-bin/get_data.cgi';

export interface UcsdFetchParams {
  north: number;
  south: number;
  west: number;
  east: number;
  mag: '1' | '0.1'; // 1 = Topography, 0.1 = Gravity
}

export async function fetchUcsdGrid(
  params: UcsdFetchParams,
  maxRetries = 2
): Promise<ParsedDataPoint[]> {
  const formData = new URLSearchParams();
  formData.append('north', params.north.toString());
  formData.append('south', params.south.toString());
  formData.append('west', params.west.toString());
  formData.append('east', params.east.toString());
  formData.append('mag', params.mag);

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(TOPEX_CGI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TopexInteractive/2.0 (Modern Geospatial Extractor)',
        },
        body: formData.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if ([502, 503, 504, 522].includes(response.status) && attempt < maxRetries) {
          attempt++;
          const waitMs = 350 * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(`UCSD TOPEX server responded with status: ${response.status} ${response.statusText}`);
      }

      const rawText = await response.text();

      // If the server returns HTML error or form instead of data
      if (rawText.includes('<form action="get_data.cgi"') || rawText.includes('<body')) {
        if (rawText.includes('cannot span 0 longitude')) {
          throw new Error('Selection cannot span across 0 longitude. Adjust coordinates.');
        }
        if (rawText.includes('must be less than 20 degrees')) {
          throw new Error('Selection area must be less than 20 degrees in latitude and longitude.');
        }
      }

      return parseTopexAscii(rawText);
    } catch (err: any) {
      if (
        attempt < maxRetries &&
        (err.name === 'AbortError' ||
          err.message?.includes('522') ||
          err.message?.includes('fetch failed') ||
          err.message?.includes('network'))
      ) {
        attempt++;
        const waitMs = 350 * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error('UCSD server connection timed out after retries.');
}
