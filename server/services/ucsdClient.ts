import { parseTopexAscii, ParsedDataPoint } from './asciiParser';

const TOPEX_CGI_URL = 'https://topex.ucsd.edu/cgi-bin/get_data.cgi';

export interface UcsdFetchParams {
  north: number;
  south: number;
  west: number;
  east: number;
  mag: '1' | '0.1'; // 1 = Topography, 0.1 = Gravity
}

export async function fetchUcsdGrid(params: UcsdFetchParams): Promise<ParsedDataPoint[]> {
  const formData = new URLSearchParams();
  formData.append('north', params.north.toString());
  formData.append('south', params.south.toString());
  formData.append('west', params.west.toString());
  formData.append('east', params.east.toString());
  formData.append('mag', params.mag);

  const response = await fetch(TOPEX_CGI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TopexInteractive/2.0 (Modern Geospatial Extractor)',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
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
}
