import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import paymentsRouter from "./payments.js";
import { authMiddleware } from "../middleware/auth.js";
import { workspaceMiddleware } from "../middleware/workspace.js";

// Mock cashfree library methods
vi.mock("../lib/cashfree.js", () => {
  return {
    createCashfreeOrder: vi.fn(),
    fetchCashfreeOrder: vi.fn(),
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

describe("paymentsRouter - Security and Coverage Tests", () => {
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
                return { current_balance: 50 };
              }
              if (query.includes("payment_orders")) {
                return { workspace_id: "ws-abc", user_id: "user-123", amount: 100, processed: 0 };
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
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
    app.use("/api/payments/*", workspaceMiddleware);
    app.route("/api", paymentsRouter);

    const req = new Request(`http://localhost${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });

    const env = {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: "https://example.supabase.co",
      DB: dbMock,
      MIN_RECHARGE_AMOUNT: "100",
      CREDITS_PER_RUPEE: "10",
    };

    return await app.fetch(req, env, executionCtxMock);
  };

  describe("POST /payments/create-order", () => {
    it("should reject invalid amount", async () => {
      const token = await getAuthToken("user-123");

      const res = await runRoute("POST", "/api/payments/create-order", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { amount: -50 });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBe("Invalid amount");
    });

    it("should reject amount less than minimum recharge", async () => {
      const token = await getAuthToken("user-123");

      const res = await runRoute("POST", "/api/payments/create-order", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { amount: 50 }); // Less than min 100

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toContain("Minimum recharge amount is Rs. 100");
    });

    it("should create cashfree order successfully", async () => {
      const token = await getAuthToken("user-123");

      const { createCashfreeOrder } = await import("../lib/cashfree.js");
      vi.mocked(createCashfreeOrder).mockResolvedValue({
        payment_session_id: "session-123",
        order_id: "order-123",
      });

      const res = await runRoute("POST", "/api/payments/create-order", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { amount: 150 });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.payment_session_id).toBe("session-123");
      expect(data.order_id).toBe("order-123");
    });

    it("should handle cashfree API failure gracefully", async () => {
      const token = await getAuthToken("user-123");

      const { createCashfreeOrder } = await import("../lib/cashfree.js");
      vi.mocked(createCashfreeOrder).mockRejectedValue(new Error("Cashfree Network Failure"));

      const res = await runRoute("POST", "/api/payments/create-order", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { amount: 150 });

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.error).toContain("Payment gateway error");
    });
  });

  describe("POST /payments/verify", () => {
    it("should reject missing order_id", async () => {
      const token = await getAuthToken("user-123");
      const res = await runRoute("POST", "/api/payments/verify", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, {});

      expect(res.status).toBe(400);
    });

    it("should return already processed status if processed is true", async () => {
      const token = await getAuthToken("user-123");
      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("payment_orders")) {
                return { workspace_id: "ws-abc", user_id: "user-123", amount: 100, processed: 1 }; // processed = 1
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const res = await runRoute("POST", "/api/payments/verify", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { order_id: "order-123" });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe("already_processed");
    });

    it("should reject if cashfree status is not PAID", async () => {
      const token = await getAuthToken("user-123");

      const { fetchCashfreeOrder } = await import("../lib/cashfree.js");
      vi.mocked(fetchCashfreeOrder).mockResolvedValue({
        order_id: "order-123",
        order_status: "ACTIVE",
        order_amount: 100,
      });

      const res = await runRoute("POST", "/api/payments/verify", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { order_id: "order-123" });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe("ACTIVE");
      expect(data.credited).toBe(false);
    });

    it("should reject if workspace for order does not exist", async () => {
      const token = await getAuthToken("user-123");
      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("workspace_members")) {
                return { role: "owner" };
              }
              if (query.includes("payment_orders")) {
                return { workspace_id: "ws-abc", user_id: "user-123", amount: 100, processed: 0 };
              }
              if (query.includes("workspaces")) {
                return null; // Workspace doesn't exist
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const { fetchCashfreeOrder } = await import("../lib/cashfree.js");
      vi.mocked(fetchCashfreeOrder).mockResolvedValue({
        order_id: "order-123",
        order_status: "PAID",
        order_amount: 100,
      });

      const res = await runRoute("POST", "/api/payments/verify", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { order_id: "order-123" });

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.error).toBe("Workspace not found");
    });

    it("should successfully verify and credit workspace", async () => {
      const token = await getAuthToken("user-123");

      const { fetchCashfreeOrder } = await import("../lib/cashfree.js");
      vi.mocked(fetchCashfreeOrder).mockResolvedValue({
        order_id: "order-123",
        order_status: "PAID",
        order_amount: 100,
      });

      const res = await runRoute("POST", "/api/payments/verify", {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": "ws-abc",
      }, { order_id: "order-123" });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.status).toBe("PAID");
      expect(data.credited).toBe(true);
      expect(data.credits).toBe(1000); // 100 * CREDITS_PER_RUPEE (10)
    });
  });
});
