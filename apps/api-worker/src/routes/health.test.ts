import { describe, it, expect } from "vitest";
import app from "../index.js";

describe("GET /api/health", () => {
  it("should return status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });
});
