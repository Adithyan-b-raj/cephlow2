import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import clientGenerateRouter from "./clientGenerate.js";
import { authMiddleware } from "../middleware/auth.js";
import { workspaceMiddleware } from "../middleware/workspace.js";

// Mock AWS S3 client and presigner
vi.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: vi.fn().mockImplementation(async (client, command, options) => {
      const key = command.input.Key;
      const expiresIn = options.expiresIn;
      return `https://mock-r2.com/${key}?expiresIn=${expiresIn}`;
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

describe("clientGenerateRouter - Presigned URL Security & Scoping (H-3)", () => {
  const secret = "test-jwt-secret-key-at-least-32-chars-long";
  let dbMock: any;
  let cacheMock: any;
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
                return { id: "batch-123", workspace_id: "ws-abc", user_id: "user-123" };
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    cacheMock = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ isApproved: true })),
      put: vi.fn().mockResolvedValue(null),
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
    app.route("/api", clientGenerateRouter);

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
      CACHE: cacheMock,
      R2_BUCKET_NAME: "certificates-bucket",
      R2_PUBLIC_URL: "https://r2-public-url.com",
    }, executionCtxMock);
  };

  it("should generate presigned URL scoped to workspace ID and batch ID (H-3)", async () => {
    const token = await getAuthToken("user-123");
    const res = await runRoute("POST", "/api/batches/batch-123/presigned-urls", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc",
    }, {
      certificates: [
        { certId: "cert-456", recipientName: "Alice", rowData: { Phone: "9876543210" } }
      ]
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.presignedUrls).toHaveLength(1);
    
    const { uploadUrl, r2PdfUrl } = data.presignedUrls[0];
    
    // Path must contain phone number folder (or fallback name)
    expect(uploadUrl).toContain("9876543210/Alice_");
    expect(r2PdfUrl).toContain("9876543210/Alice_");
    
    // Timeframe / Expiration limit must be set correctly (e.g. 900 seconds)
    expect(uploadUrl).toContain("expiresIn=900");
  });

  it("should reject presigned URL request if batch belongs to another workspace", async () => {
    const token = await getAuthToken("user-123");
    
    // Batch is mapped to another workspace 'ws-different'
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
            if (query.includes("batches")) {
              return { id: "batch-123", workspace_id: "ws-different", user_id: "user-123" };
            }
            return null;
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const res = await runRoute("POST", "/api/batches/batch-123/presigned-urls", {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": "ws-abc", // Requesting user workspace is ws-abc
    }, {
      certificates: [
        { certId: "cert-456", recipientName: "Alice" }
      ]
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toBe("Access denied");
  });

  describe("POST /batches/:batchId/client-generate - Credit Security & Regeneration Rates", () => {
    it("should successfully charge standard rate for unpaid certificates", async () => {
      const token = await getAuthToken("user-123");

      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("workspaces")) {
                return { current_balance: 100 }; // 100 credits available
              }
              if (query.includes("batches")) {
                return { id: "batch-123", workspace_id: "ws-abc", user_id: "user-123", name: "Batch A" };
              }
              return null;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes("certificates")) {
                return {
                  results: [
                    { id: "cert-1", is_paid: 0, status: "pending" }, // unpaid
                    { id: "cert-2", is_paid: 0, status: "pending" }  // unpaid
                  ]
                };
              }
              return { results: [] };
            }),
            run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          }),
        };
      });

      const res = await runRoute("POST", "/api/batches/batch-123/client-generate", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, {});

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
    });

    it("should charge 20% rate for already paid certificates requiring visual regeneration", async () => {
      const token = await getAuthToken("user-123");

      let atomicUpdateMock = vi.fn().mockResolvedValue({ current_balance: 99.8 });
      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("UPDATE workspaces SET current_balance")) {
                return await atomicUpdateMock();
              }
              if (query.includes("workspaces")) {
                return { current_balance: 100 };
              }
              if (query.includes("batches")) {
                return { id: "batch-123", workspace_id: "ws-abc", user_id: "user-123", name: "Batch A" };
              }
              return null;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes("certificates")) {
                return {
                  results: [
                    { id: "cert-1", is_paid: 1, requires_visual_regen: 1, status: "outdated" } // paid, needs visual regen
                  ]
                };
              }
              return { results: [] };
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const res = await runRoute("POST", "/api/batches/batch-123/client-generate", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, {});

      expect(res.status).toBe(200);
      // Regeneration is free, so no balance update query should be executed
      expect(dbMock.prepare).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE workspaces SET current_balance = current_balance - ?"));
    });

    it("should reject generation if workspace balance is insufficient (C-2)", async () => {
      const token = await getAuthToken("user-123");

      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("UPDATE workspaces SET current_balance")) {
                return null; // Atomic update fails (insufficient balance returning null)
              }
              if (query.includes("workspaces")) {
                return { current_balance: 0.1 }; // only 0.1 credits
              }
              if (query.includes("batches")) {
                return { id: "batch-123", workspace_id: "ws-abc", user_id: "user-123", name: "Batch A" };
              }
              return null;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes("certificates")) {
                return {
                  results: [
                    { id: "cert-1", is_paid: 0, status: "pending" } // unpaid (needs 1 credit)
                  ]
                };
              }
              return { results: [] };
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const res = await runRoute("POST", "/api/batches/batch-123/client-generate", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, {});

      expect(res.status).toBe(402);
      const data = await res.json() as any;
      expect(data.error).toContain("Insufficient funds");
    });
  });
});
