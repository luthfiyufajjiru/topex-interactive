import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png', 'assets/*'],
      manifest: {
        name: 'TOPEX Interactive - Satellite Gravity Studio',
        short_name: 'TOPEX Studio',
        description: 'Global bathymetry & marine gravity data extraction, Complete Bouguer anomaly reduction with Parasnis linear regression, and 2D cross-section profiling studio.',
        theme_color: '#0284c7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['education', 'science', 'productivity', 'utilities']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    }),
    {
      name: 'hono-api-dev-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api')) {
            try {
              // Dynamically import the Hono app in dev mode
              const { default: app } = await server.ssrLoadModule('/server/index.ts');
              
              const protocol = req.headers['x-forwarded-proto'] || 'http';
              const host = req.headers.host || 'localhost:5173';
              const fullUrl = new URL(req.url, `${protocol}://${host}`);

              // Build web standard Request from Node req
              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers)) {
                if (value) {
                  if (Array.isArray(value)) {
                    value.forEach(v => headers.append(key, v));
                  } else {
                    headers.set(key, value);
                  }
                }
              }

              let body: BodyInit | null = null;
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks: Uint8Array[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                body = Buffer.concat(chunks);
              }

              const webRequest = new Request(fullUrl.toString(), {
                method: req.method,
                headers,
                body,
              });

              const response = await app.fetch(webRequest);

              res.statusCode = response.status;
              response.headers.forEach((val: string, key: string) => {
                res.setHeader(key, val);
              });

              if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              }
              res.end();
              return;
            } catch (err) {
              console.error('Hono dev server error:', err);
              next(err);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
