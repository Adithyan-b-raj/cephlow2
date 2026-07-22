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

  it("should format cache keys correctly for endpoint specific prefixes (verify, qr, sheets, global)", async () => {
    const app = new Hono<ContextEnv>();
    app.use("/api/verify/*", rateLimit({ limit: 60, windowSeconds: 60, keyPrefix: "verify" }));
    app.use("/api/qr/*", rateLimit({ limit: 60, windowSeconds: 60, keyPrefix: "qr" }));
    app.use("/api/spreadsheets/*", rateLimit({ limit: 20, windowSeconds: 60, keyPrefix: "sheets" }));
    app.use("/api/*", rateLimit({ limit: 120, windowSeconds: 60, keyPrefix: "global" }));
    
    app.get("/api/verify/cert123", (c) => c.json({ ok: true }));
    app.get("/api/qr/code123", (c) => c.json({ ok: true }));
    app.get("/api/spreadsheets/list", (c) => c.json({ ok: true }));

    cacheMock.get.mockResolvedValue(null);

    // Test verify route uses 'verify' prefix key
    await app.fetch(new Request("http://localhost/api/verify/cert123", {
      headers: { "cf-connecting-ip": "1.1.1.1" },
    }), { CACHE: cacheMock });
    expect(cacheMock.put).toHaveBeenCalledWith(
      expect.stringContaining("rate_limit:verify:1.1.1.1:"),
      "1",
      expect.anything()
    );

    // Test qr route uses 'qr' prefix key
    await app.fetch(new Request("http://localhost/api/qr/code123", {
      headers: { "cf-connecting-ip": "1.1.1.1" },
    }), { CACHE: cacheMock });
    expect(cacheMock.put).toHaveBeenCalledWith(
      expect.stringContaining("rate_limit:qr:1.1.1.1:"),
      "1",
      expect.anything()
    );

    // Test spreadsheets route uses 'sheets' prefix key
    await app.fetch(new Request("http://localhost/api/spreadsheets/list", {
      headers: { "cf-connecting-ip": "1.1.1.1" },
    }), { CACHE: cacheMock });
    expect(cacheMock.put).toHaveBeenCalledWith(
      expect.stringContaining("rate_limit:sheets:1.1.1.1:"),
      "1",
      expect.anything()
    );
  });
});
