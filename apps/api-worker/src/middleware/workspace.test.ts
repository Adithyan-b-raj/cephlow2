import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { workspaceMiddleware, requireNotSuspended } from "./workspace.js";
import paymentsRouter from "../routes/payments.js";
import { authMiddleware } from "./auth.js";

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

describe("workspaceMiddleware & requireNotSuspended - Security Tests", () => {
  const secret = "test-jwt-secret-key-at-least-32-chars-long";
  let dbMock: any;
  let executionCtxMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    executionCtxMock = {
      waitUntil: vi.fn(),
    };
  });

  const createApp = () => {
    const app = new Hono<ContextEnv>();
    app.use("/api/*", authMiddleware);
    
    // Mount routes
    app.use("/api/workspace-protected/*", workspaceMiddleware);
    app.get("/api/workspace-protected/test", (c) => c.json({ workspace: c.get("workspace") }));

    app.use("/api/suspended-protected/*", workspaceMiddleware, requireNotSuspended);
    app.get("/api/suspended-protected/test", (c) => c.json({ ok: true }));

    app.route("/api", paymentsRouter);

    return app;
  };

  const getAuthToken = async (userId: string) => {
    const payload = {
      sub: userId,
      email: `${userId}@example.com`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: "https://example.supabase.co",
      aud: "authenticated",
    };
    return await signHs256Token(payload, secret);
  };

  it("should reject if user is not authenticated", async () => {
    const app = new Hono<ContextEnv>();
    app.use("*", workspaceMiddleware);
    app.get("*", (c) => c.text("ok"));

    const req = new Request("http://localhost/");
    const res = await app.fetch(req, { DB: dbMock });
    expect(res.status).toBe(401);
  });

  it("should reject if workspace context is missing", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");
    const req = new Request("http://localhost/api/workspace-protected/test", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing workspace context");
  });

  it("should reject if user is not member of workspace", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");

    const req = new Request("http://localhost/api/workspace-protected/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "workspace-abc",
      },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Not a member of this workspace");
  });

  it("should accept if user is member of workspace", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");
    
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              return { role: "admin", suspended: 0 };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const req = new Request("http://localhost/api/workspace-protected/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "workspace-abc",
      },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.workspace).toEqual({
      id: "workspace-abc",
      role: "admin",
      suspended: false,
    });
  });

  it("should reject if workspace is suspended", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");
    
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              return { role: "member", suspended: 1 };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const req = new Request("http://localhost/api/suspended-protected/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "workspace-abc",
      },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe("WORKSPACE_SUSPENDED");
  });

  it("should reject payments verify if the order does not belong to the user (H-5)", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123"); // Authenticated as user-123
    
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              return { role: "member" };
            }
            if (query.includes("payment_orders")) {
              return {
                workspace_id: "workspace-abc",
                user_id: "user-999", // Different user!
                amount: 100,
                processed: 0,
              };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const req = new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: "order-xyz" }),
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Access denied: You do not own this payment order");
  });

  it("should verify roles with isAdminOrOwner helper", async () => {
    const { isAdminOrOwner: helper } = await import("./workspace.js");
    expect(helper("owner")).toBe(true);
    expect(helper("admin")).toBe(true);
    expect(helper("member")).toBe(false);
  });

  it("should handle DB errors in workspaceMiddleware", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");
    
    dbMock.prepare.mockImplementation((query: string) => {
      if (query.includes("workspace_members")) {
        throw new Error("DB Query Error");
      }
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const req = new Request("http://localhost/api/workspace-protected/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "workspace-abc",
      },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toBe("DB Query Error");
  });

  it("should reject requireNotSuspended if workspace context is missing", async () => {
    const app = new Hono<ContextEnv>();
    app.use("/api/test", requireNotSuspended);
    app.get("/api/test", (c) => c.text("ok"));

    const req = new Request("http://localhost/api/test");
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  it("should handle DB errors in requireNotSuspended", async () => {
    const app = createApp();
    const token = await getAuthToken("user-123");

    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              throw new Error("DB workspaces check failed");
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const req = new Request("http://localhost/api/suspended-protected/test", {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "workspace-abc",
      },
    });

    const res = await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);

    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toBe("DB workspaces check failed");
  });
});
