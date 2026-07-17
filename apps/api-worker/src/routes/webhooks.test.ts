import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import webhooksRouter from "./webhooks.js";

// Helper to compute HMAC-SHA256 signature
async function computeHmacSha256(secret: string, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

describe("webhooksRouter - Webhook Security (C-1, C-3, H-4)", () => {
  const whatsappSecret = "test-whatsapp-app-secret-key-12345";
  const cashfreeSecret = "test-cashfree-secret-key-54321";
  let dbMock: any;
  let executionCtxMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock = {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("payment_orders")) {
                return { processed: 0, workspace_id: "ws-abc" };
              }
              if (query.includes("workspaces")) {
                return { current_balance: 100 };
              }
              if (query.includes("wa_messages")) {
                return { cert_id: "cert-123" };
              }
              return null;
            }),
            run: vi.fn().mockResolvedValue({
              success: true,
              meta: { changes: 1 }
            }),
          }),
        };
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    executionCtxMock = {
      waitUntil: vi.fn(),
    };
  });

  const runRoute = async (method: string, path: string, headers: Record<string, string>, body: string = "") => {
    const app = new Hono<ContextEnv>();
    app.route("/api", webhooksRouter);

    const req = new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...headers,
      },
      body: method === "POST" ? body : null,
    });

    return await app.fetch(req, {
      SUPABASE_JWT_SECRET: "supabase-jwt-secret",
      WHATSAPP_APP_SECRET: whatsappSecret,
      CASHFREE_SECRET_KEY: cashfreeSecret,
      DB: dbMock,
    }, executionCtxMock);
  };

  describe("GET /webhooks/whatsapp - Challenge Verification", () => {
    it("should accept verification request with valid token", async () => {
      const res = await runRoute("GET", "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=supabase-jwt-secret&hub.challenge=testchallenge", {});
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("testchallenge");
    });

    it("should reject verification request with invalid token", async () => {
      const res = await runRoute("GET", "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=testchallenge", {});
      expect(res.status).toBe(403);
    });
  });

  describe("POST /webhooks/whatsapp - Status Updates (C-1)", () => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  {
                    id: "wamid.123",
                    status: "delivered"
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    it("should reject request missing X-Hub-Signature-256 header", async () => {
      const res = await runRoute("POST", "/api/webhooks/whatsapp", {}, payload);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.error).toBe("Missing X-Hub-Signature-256 header");
    });

    it("should reject request with invalid signature", async () => {
      const res = await runRoute("POST", "/api/webhooks/whatsapp", {
        "X-Hub-Signature-256": "sha256=invalid-signature-value"
      }, payload);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.error).toBe("Invalid signature");
    });

    it("should reject request with malformed JSON body", async () => {
      const signatureBuffer = await computeHmacSha256(whatsappSecret, "{malformed-json");
      const hexSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await runRoute("POST", "/api/webhooks/whatsapp", {
        "X-Hub-Signature-256": `sha256=${hexSignature}`
      }, "{malformed-json");
      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBe("Malformed payload body");
    });

    it("should successfully process and update certificate status with valid signature", async () => {
      const signatureBuffer = await computeHmacSha256(whatsappSecret, payload);
      const hexSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await runRoute("POST", "/api/webhooks/whatsapp", {
        "X-Hub-Signature-256": `sha256=${hexSignature}`
      }, payload);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
      expect(dbMock.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE certificates SET whatsapp_status = ? WHERE id = ?"));
    });
  });

  describe("POST /webhooks/cashfree - Cashfree Webhooks (C-3, H-4)", () => {
    const rawPayload = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: {
        order: { order_id: "order-123" },
        payment: { payment_status: "SUCCESS", payment_amount: 100, cf_payment_id: "cf-999", payment_group: "upi" },
        customer_details: { customer_id: "cust-999" }
      }
    });

    it("should reject request missing webhook headers", async () => {
      const res = await runRoute("POST", "/api/webhooks/cashfree", {}, rawPayload);
      expect(res.status).toBe(400);
    });

    it("should reject tampered signature (H-4)", async () => {
      const res = await runRoute("POST", "/api/webhooks/cashfree", {
        "x-webhook-signature": "invalid-sig",
        "x-webhook-timestamp": "1234567890"
      }, rawPayload);
      expect(res.status).toBe(401);
    });

    it("should process webhook and credit workspace on success", async () => {
      const timestamp = "1234567890";
      const message = timestamp + rawPayload;
      const signatureBuffer = await computeHmacSha256(cashfreeSecret, message);
      const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      const res = await runRoute("POST", "/api/webhooks/cashfree", {
        "x-webhook-signature": base64Signature,
        "x-webhook-timestamp": timestamp
      }, rawPayload);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
      expect(dbMock.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE payment_orders SET processed = 1 WHERE order_id = ? AND processed = 0"));
      expect(dbMock.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE workspaces SET current_balance = current_balance + ?"));
    });

    it("should gracefully ignore duplicate callback (idempotency safety C-3)", async () => {
      const timestamp = "1234567890";
      const message = timestamp + rawPayload;
      const signatureBuffer = await computeHmacSha256(cashfreeSecret, message);
      const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      // Simulate order already processed concurrently (UPDATE processed returns changes: 0)
      dbMock.prepare.mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes("payment_orders")) {
                return { processed: 1, workspace_id: "ws-abc" }; // processed: 1
              }
              return null;
            }),
            run: vi.fn().mockImplementation(async () => {
              if (query.includes("UPDATE payment_orders")) {
                return { success: true, meta: { changes: 0 } }; // 0 changes (idempotency block)
              }
              return { success: true, meta: { changes: 1 } };
            }),
          }),
        };
      });

      const res = await runRoute("POST", "/api/webhooks/cashfree", {
        "x-webhook-signature": base64Signature,
        "x-webhook-timestamp": timestamp
      }, rawPayload);

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");
      // Workspace should NOT have been credited since it returned early
      expect(dbMock.prepare).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE workspaces SET current_balance = current_balance + ?"));
    });
  });
});
