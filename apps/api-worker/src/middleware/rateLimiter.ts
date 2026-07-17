import type { MiddlewareHandler } from "hono";

interface RateLimitOptions {
  windowSeconds?: number;
  limit: number;
  keyPrefix?: string;
}

const memoryCache = new Map<string, { count: number; expiresAt: number }>();

function getMemoryCount(key: string, windowSeconds: number): number {
  const now = Date.now();
  const entry = memoryCache.get(key);
  
  if (entry && entry.expiresAt > now) {
    entry.count += 1;
    return entry.count;
  } else {
    memoryCache.set(key, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    });
    return 1;
  }
}

/**
 * Hono middleware to rate limit client requests.
 * Uses Cloudflare KV cache if available, falling back to an in-memory cache.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler<ContextEnv> {
  const windowSeconds = options.windowSeconds || 60;
  const limit = options.limit;
  const keyPrefix = options.keyPrefix || "rl";

  return async (c, next) => {
    const user = c.get("user");
    const ip = c.req.header("cf-connecting-ip") || "ip-unknown";
    const identifier = user?.uid || ip;
    
    const now = Date.now();
    const windowId = Math.floor(now / (windowSeconds * 1000));
    const cacheKey = `rate_limit:${keyPrefix}:${identifier}:${windowId}`;

    let currentCount = 0;

    if (c.env.CACHE) {
      try {
        const val = await c.env.CACHE.get(cacheKey);
        currentCount = val ? parseInt(val, 10) : 0;

        if (currentCount >= limit) {
          return c.json({ error: "Too many requests. Please try again later." }, 429);
        }

        await c.env.CACHE.put(cacheKey, String(currentCount + 1), {
          expirationTtl: windowSeconds * 2,
        });
      } catch (err: any) {
        console.warn("[Rate Limiter] KV error, falling back to memory:", err.message);
        currentCount = getMemoryCount(cacheKey, windowSeconds);
        if (currentCount > limit) {
          return c.json({ error: "Too many requests. Please try again later." }, 429);
        }
      }
    } else {
      currentCount = getMemoryCount(cacheKey, windowSeconds);
      if (currentCount > limit) {
        return c.json({ error: "Too many requests. Please try again later." }, 429);
      }
    }

    return await next();
  };
}
