import { Context, Next } from 'hono';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory sliding window rate limiter
const ipRequestMap = new Map<string, RateLimitRecord>();

// Clean up stale IP records every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestMap.entries()) {
    if (now > record.resetTime) {
      ipRequestMap.delete(ip);
    }
  }
}, 60000);

export interface RateLimitOptions {
  windowMs: number; // e.g., 60,000 ms (1 min)
  maxRequests: number; // e.g., 120 requests per window
}

export function createRateLimiter(options: RateLimitOptions = { windowMs: 60000, maxRequests: 150 }) {
  return async function rateLimiterMiddleware(c: Context, next: Next) {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      c.req.header('x-real-ip') ||
      '127.0.0.1';

    const now = Date.now();
    let record = ipRequestMap.get(ip);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + options.windowMs,
      };
      ipRequestMap.set(ip, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, options.maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    c.header('X-RateLimit-Limit', options.maxRequests.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetSeconds.toString());

    if (record.count > options.maxRequests) {
      c.header('Retry-After', resetSeconds.toString());
      return c.json(
        {
          success: false,
          error: `Rate limit exceeded. Please wait ${resetSeconds} seconds before requesting more data.`,
        },
        429
      );
    }

    await next();
  };
}
