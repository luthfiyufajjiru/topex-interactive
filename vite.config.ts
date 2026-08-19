import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
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
