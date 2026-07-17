import { describe, it, expect } from "vitest";
import app from "../index.js";

describe("GET /api/health", () => {
  it("should return status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("should include security headers (M-2, M-3, M-4)", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("should restrict CORS allowed origins to configured domains (M-2)", async () => {
    // 1. Allowed origin
    const resAllowed = await app.request("/api/health", {
      headers: {
        Origin: "http://localhost:5173"
      }
    });
    expect(resAllowed.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");

    // 2. Disallowed origin
    const resDisallowed = await app.request("/api/health", {
      headers: {
        Origin: "https://malicious.com"
      }
    });
    expect(resDisallowed.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
