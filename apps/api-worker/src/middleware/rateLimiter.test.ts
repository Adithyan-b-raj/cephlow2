import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "./rateLimiter.js";

describe("rateLimiter middleware", () => {
  let cacheMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    cacheMock = {
      get: vi.fn(),
      put: vi.fn(),
    };
  });

  const createApp = (limit: number, windowSeconds: number) => {
    const app = new Hono<ContextEnv>();
    app.use("/api/*", rateLimit({ limit, windowSeconds, keyPrefix: "test" }));
    app.get("/api/test", (c) => c.json({ success: true }));
    return app;
  };

  it("should allow requests within limit", async () => {
    const app = createApp(5, 60);
    cacheMock.get.mockResolvedValue("2"); // 2 requests made already

    const req = new Request("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });

    const res = await app.fetch(req, { CACHE: cacheMock });
    expect(res.status).toBe(200);
    expect(cacheMock.put).toHaveBeenCalled();
  });

  it("should block requests exceeding limit (429)", async () => {
    const app = createApp(5, 60);
    cacheMock.get.mockResolvedValue("5"); // 5 requests made already (equals limit)

    const req = new Request("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });

    const res = await app.fetch(req, { CACHE: cacheMock });
    expect(res.status).toBe(429);
    const data = await res.json() as any;
    expect(data.error).toContain("Too many requests");
  });

  it("should fall back to memory cache if KV fails or is missing", async () => {
    const app = createApp(2, 5); // limit of 2, 5s window

    // Test 1: allowed
    const res1 = await app.fetch(new Request("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "5.6.7.8" },
    }), {});
    expect(res1.status).toBe(200);

    // Test 2: allowed
    const res2 = await app.fetch(new Request("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "5.6.7.8" },
    }), {});
    expect(res2.status).toBe(200);

    // Test 3: blocked (exceeded limit of 2)
    const res3 = await app.fetch(new Request("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "5.6.7.8" },
    }), {});
    expect(res3.status).toBe(429);
  });
});
