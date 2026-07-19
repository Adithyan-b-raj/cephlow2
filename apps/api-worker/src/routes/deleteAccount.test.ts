import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import deleteAccountRouter from "./deleteAccount.js";
import { authMiddleware } from "../middleware/auth.js";

// Mock Supabase
vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn().mockImplementation(() => {
      return {
        auth: {
          admin: {
            deleteUser: vi.fn().mockResolvedValue({ error: null }),
          },
        },
      };
    }),
  };
});

// Helper to encode base64url
const base64urlEncode = (str: string): string => {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

// Helper to sign HMAC-SHA256 JWT
async function signHs256Token(payload: any, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  
  const keyBytes = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe("POST /api/me/delete-account", () => {
  const secret = "test-jwt-secret-key-at-least-32-chars-long";
  let dbMock: any;
  let executionCtxMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    dbMock = {
      prepare: vi.fn().mockImplementation(() => {
        const stmt = {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        };
        stmt.bind.mockReturnValue(stmt);
        return stmt;
      }),
    };

    executionCtxMock = {
      waitUntil: vi.fn(),
    };
  });

  const getAuthToken = async (userId: string, email: string) => {
    const payload = {
      sub: userId,
      email: email,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: "https://example.supabase.co",
      aud: "authenticated",
    };
    return await signHs256Token(payload, secret);
  };

  const setupApp = () => {
    const app = new Hono<ContextEnv>();
    app.use("/api/*", authMiddleware);
    app.route("/api", deleteAccountRouter);
    return app;
  };

  const runRoute = async (method: string, path: string, headers: Record<string, string>, body: any, db: any = dbMock) => {
    const app = setupApp();
    const req = new Request(`http://localhost${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });
    return await app.fetch(req, {
      DB: db,
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    }, executionCtxMock);
  };

  it("should reject deletion if not authenticated", async () => {
    const res = await runRoute("POST", "/api/me/delete-account", {}, { email: "test@example.com" });
    expect(res.status).toBe(401);
  });

  it("should reject deletion if confirm email does not match token email", async () => {
    const token = await getAuthToken("user-123", "owner@example.com");
    const res = await runRoute("POST", "/api/me/delete-account", {
      Authorization: `Bearer ${token}`,
    }, { email: "wrong@example.com" });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("confirmation does not match");
  });

  it("should purge all records for unapproved free user", async () => {
    const queriesRun: string[] = [];
    const db = {
      prepare: vi.fn().mockImplementation((query: string) => {
        queriesRun.push(query);
        const stmt = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes("frame_listings")) {
              return { results: [] };
            }
            return {
              results: [{ id: "ws-free-1" }],
            };
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
          first: vi.fn().mockResolvedValue(null), // isApproved = false
        };
        stmt.bind.mockReturnValue(stmt);
        return stmt;
      }),
    };

    const token = await getAuthToken("user-123", "owner@example.com");
    const res = await runRoute("POST", "/api/me/delete-account", {
      Authorization: `Bearer ${token}`,
    }, { email: "owner@example.com" }, db);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    // Verify D1 queries:
    // Should have checked owned workspaces, approval status, and run delete queries
    expect(queriesRun.some(q => q.includes("SELECT id FROM workspaces WHERE owner_id = ?"))).toBe(true);
    expect(queriesRun.some(q => q.includes("SELECT is_approved FROM user_profiles WHERE id = ?"))).toBe(true);
    expect(queriesRun.some(q => q.includes("DELETE FROM workspaces"))).toBe(true);
    // Paid dummy insertion should NOT run
    expect(queriesRun.some(q => q.includes("orphaned-system-user"))).toBe(false);
  });

  it("should preserve generated certificates and assign to system for approved user", async () => {
    const queriesRun: string[] = [];
    const db = {
      prepare: vi.fn().mockImplementation((query: string) => {
        queriesRun.push(query);
        const stmt = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ id: "ws-paid-1" }],
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("user_profiles")) {
              return { is_approved: 1 };
            }
            return null;
          }),
        };
        stmt.bind.mockReturnValue(stmt);
        return stmt;
      }),
    };

    const token = await getAuthToken("user-123", "paid@example.com");
    const res = await runRoute("POST", "/api/me/delete-account", {
      Authorization: `Bearer ${token}`,
    }, { email: "paid@example.com" }, db);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    // Verify D1 queries:
    // Should have checked owned workspaces, approval status, inserted dummy records, and run delete queries
    expect(queriesRun.some(q => q.includes("SELECT id FROM workspaces WHERE owner_id = ?"))).toBe(true);
    expect(queriesRun.some(q => q.includes("SELECT is_approved FROM user_profiles WHERE id = ?"))).toBe(true);
    expect(queriesRun.some(q => q.includes("INSERT OR IGNORE INTO user_profiles"))).toBe(true);
    expect(queriesRun.some(q => q.includes("INSERT OR IGNORE INTO workspaces"))).toBe(true);
    expect(queriesRun.some(q => q.includes("UPDATE batches"))).toBe(true);
    expect(queriesRun.some(q => q.includes("DELETE FROM workspaces"))).toBe(true);
  });
});
