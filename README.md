# Topex Interactive Downloader

[![Live App](https://img.shields.io/badge/Live-topex--interactive.yufajjiru.work-0284c7?style=flat-square&logo=cloudflare)](https://topex-interactive.yufajjiru.work)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?style=flat-square&logo=hono)](https://hono.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev/)

Modern fullstack interactive tool for extracting, visualizing, and exporting global seafloor topography (bathymetry) and marine gravity anomaly grids from Scripps Institution of Oceanography, UC San Diego (Smith & Sandwell, 1997; Sandwell et al., 2014).

- Custom Domain: [https://topex-interactive.yufajjiru.work](https://topex-interactive.yufajjiru.work)
- Cloudflare Workers Mirror: [https://topex-interactive.luthfiyufajjiru.workers.dev](https://topex-interactive.luthfiyufajjiru.workers.dev)

---

## Features

- **Google Earth Satellite Basemap**: High-resolution default imagery layer with Leaflet Draw rectangle selection, 0-meridian wrap protection, and coordinate synchronization.
- **Universal Canonical Snap-to-Grid (0.5 Degree Tiles)**: Universal global discrete tiling (0.5 degree x 0.5 degree cells) that guarantees 100% cache sharing across overlapping user selections worldwide.
- **Just-In-Time (JIT) Parallel Streaming**: Dispatches 6 concurrent worker pipelines with soundings streaming directly into the visible grid in real-time.
- **Non-Blocking Progress and Cancellation**: Live streaming progress banner with soundings counter and cancellation control without blocking modal backdrops.
- **Multi-Layer Edge and Client Caching**:
  - Browser Memory: Instant 0ms retrieval for previously requested tiles.
  - Cloudflare Edge Cache: Cached global bathymetric tiles with sub-15ms latency.
  - Sliding-Window Rate Limiter: 300 requests per minute edge protection.
- **Geospatial and Scientific Multi-Format Exporter**:
  - GeoJSON (`.geojson`): 3D Point features (`[lon, lat, elev]`) with attributes for direct drag-and-drop into QGIS and ArcGIS.
  - ASCII Grid (`.xyz`): Standard GMT (Generic Mapping Tools) space-delimited bathymetry format.
  - KML (`.kml`): Google Earth 3D placemark soundings.
  - CSV (`.csv`): Universal tabular format for Excel, Python Pandas, and R.
  - JSON (`.json`), YAML (`.yaml`), XML (`.xml`).
- **Shareable URL Deep-Linking and Import**:
  - Real-time URL query parameter synchronization (`?north=-8&south=-9&west=114.5&east=115.5&gravity=true`).
  - One-click copy link, copy coordinate snippet, and multi-format paste import.

---

## Architecture

```mermaid
graph TD
    A[User / Browser Client] -->|HTTP / URL Deep-Link| B[React 18 SPA + Leaflet]
    B -->|Check Local Cache| C{In-Memory 0ms?}
    C -- Hit --> B
    C -- Miss --> D[Hono Edge API on Cloudflare Workers]
    D --> E[Sliding Window Rate Limiter]
    E --> F{Cloudflare Edge Cache?}
    F -- Hit --> D
    F -- Miss --> G[Scripps UCSD CGI Upstream]
    G --> F
    F --> D
    D --> B
```

- **Frontend**: React 18, TypeScript, Vite, Leaflet, Leaflet Draw, Lucide Icons.
- **Backend / Edge Proxy**: Cloudflare Workers, Hono, Zod, Cloudflare Cache API.
- **Data Source**: Scripps Institution of Oceanography, UC San Diego (`https://topex.ucsd.edu/cgi-bin/get_data.cgi`).

---

## Local Development

```bash
# Clone the repository
git clone git@github.com:luthfiyufajjiru/topex-interactive.git
cd topex-interactive

# Install dependencies
npm install

# Start fullstack Vite + Hono dev server
npm run dev
```

Visit `http://localhost:5173/` in your browser.

---

## Deployment to Cloudflare Workers

```bash
# 1. Login to Cloudflare
npx wrangler login

# 2. Build and deploy
npm run deploy
```

---

## Scientific Attribution

Data belongs to Scripps Institution of Oceanography, University of California San Diego (Smith & Sandwell, 1997; Sandwell et al., 2014).
- Odd elevation values represent ship sounding constraints.
- Even values are predicted from satellite altimetry gravity anomalies.

---

## Author

Created by [Luthfi Yufajjiru](https://www.linkedin.com/in/yufajjiru/) (2022-2026).
