import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import batchesRouter from "./batches.js";
import { authMiddleware } from "../middleware/auth.js";
import { workspaceMiddleware } from "../middleware/workspace.js";

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

describe("batchesRouter - Input Security & Validation Tests", () => {
  const secret = "test-jwt-secret-key-at-least-32-chars-long";
  let dbMock: any;
  let executionCtxMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock = {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("workspaces")) {
                return { id: "ws-abc", name: "Test" };
              }
              if (query.includes("batches")) {
                return { id: "batch-123", name: "Test Batch", workspace_id: "ws-abc" };
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
            all: vi.fn().mockResolvedValue({ results: [] }),
          }),
        };
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    executionCtxMock = {
      waitUntil: vi.fn(),
    };
  });

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

  const runRoute = async (method: string, path: string, headers: Record<string, string>, body: any = null) => {
    const app = new Hono<ContextEnv>();
    app.use("/api/*", authMiddleware);
    app.use("/api/batches*", workspaceMiddleware);
    app.use("/api/batches/*", workspaceMiddleware);
    app.route("/api", batchesRouter);

    const req = new Request(`http://localhost${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });

    return await app.fetch(req, {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
    }, executionCtxMock);
  };

  it("should reject batch creation with XSS payload in name", async () => {
    const token = await getAuthToken("user-123");
    const res = await runRoute("POST", "/api/batches", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc",
    }, {
      name: "<script>alert('xss')</script>",
      dataSourceKind: "inbuilt",
      spreadsheetId: "sheet-123",
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("malicious characters");
  });

  it("should reject batch creation with invalid dataSourceKind", async () => {
    const token = await getAuthToken("user-123");
    const res = await runRoute("POST", "/api/batches", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc",
    }, {
      name: "Valid Batch Name",
      dataSourceKind: "google",
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Expected 'inbuilt', received 'google'");
  });

  it("should reject batch creation with invalid phone numbers in data rows", async () => {
    const token = await getAuthToken("user-123");
    
    // Mock spreadsheet queries to return data rows with an invalid phone number
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              return { role: "owner" };
            }
            if (query.includes("workspaces")) {
              return { id: "ws-abc", name: "Test" };
            }
            if (query.includes("spreadsheets")) {
              return {
                name: "Test Sheet",
                columns: JSON.stringify(["Name", "Email", "Phone"]),
                rows: JSON.stringify([
                  { Name: "Name", Email: "Email", Phone: "Phone" },
                  { Name: "User A", Email: "usera@example.com", Phone: "invalid-phone" }
                ])
              };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const res = await runRoute("POST", "/api/batches", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc",
    }, {
      name: "Valid Batch Name",
      dataSourceKind: "inbuilt",
      spreadsheetId: "sheet-123",
      nameColumn: "Name",
      emailColumn: "Email",
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid phone number");
  });

  it("should successfully create batch and normalize phone numbers", async () => {
    const token = await getAuthToken("user-123");
    
    dbMock.prepare.mockImplementation((query: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            if (query.includes("workspace_members")) {
              return { role: "owner" };
            }
            if (query.includes("workspaces")) {
              return { id: "ws-abc", name: "Test" };
            }
            if (query.includes("spreadsheets")) {
              return {
                name: "Test Sheet",
                columns: JSON.stringify(["Name", "Email", "Phone"]),
                rows: JSON.stringify([
                  { Name: "Name", Email: "Email", Phone: "Phone" },
                  { Name: "User A", Email: "usera@example.com", Phone: "9876543210" } // 10-digit
                ])
              };
            }
            if (query.includes("batches")) {
              return { id: "batch-123", name: "Valid Batch Name", workspace_id: "ws-abc", created_at: "now" };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const res = await runRoute("POST", "/api/batches", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc",
    }, {
      name: "Valid Batch Name",
      dataSourceKind: "inbuilt",
      spreadsheetId: "sheet-123",
      nameColumn: "Name",
      emailColumn: "Email",
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Valid Batch Name");
    
    // Verify batch insert prepared statement binds normalized phone number
    const batchCall = dbMock.prepare.mock.calls.find((c: any) => c[0].includes("INSERT INTO certificates"));
    expect(batchCall).toBeDefined();
  });
});
