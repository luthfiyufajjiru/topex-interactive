import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { topexRoute } from './routes/topex';

const app = new Hono();

// Global CORS configuration
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Mount API routes
const routes = app.route('/api/topex', topexRoute);

// Root health check
app.get('/api/health', (c) => {
  return c.json({
    name: 'Topex Interactive Edge API',
    status: 'online',
    version: '2.0.0',
    platform: 'Cloudflare Workers (Hono)',
    timestamp: new Date().toISOString(),
  });
});

export type AppType = typeof routes;
export default app;
