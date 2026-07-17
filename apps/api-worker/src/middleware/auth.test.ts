import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "./auth.js";

// Helper to encode base64url
const base64urlEncode = (str: string): string => {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

// Helper to sign HMAC-SHA256 JWT using Web Crypto API
async function signHs256Token(payload: any, secret: string, headerOverrides = {}): Promise<string> {
  const header = { alg: "HS256", typ: "JWT", ...headerOverrides };
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

async function signHs256TokenWithRawBytes(payload: any, keyBytes: Uint8Array, headerOverrides = {}): Promise<string> {
  const header = { alg: "HS256", typ: "JWT", ...headerOverrides };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// Helper to generate ES256 keys and token
let mockKeyPair: CryptoKeyPair;
async function getMockKeyPair() {
  if (!mockKeyPair) {
    mockKeyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
  }
  return mockKeyPair;
}

async function signEs256Token(payload: any, kid: string, headerOverrides = {}): Promise<string> {
  const keys = await getMockKeyPair();
  const header = { alg: "ES256", typ: "JWT", kid, ...headerOverrides };
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    keys.privateKey,
    message
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

describe("authMiddleware - Security Tests", () => {
  const secret = "test-jwt-secret-key-at-least-32-chars-long";
  const supabaseUrl = "https://example.supabase.co";
  let dbMock: any;
  let executionCtxMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    dbMock = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    };
    executionCtxMock = {
      waitUntil: vi.fn(),
    };
  });

  const runMiddleware = async (reqHeaders: Record<string, string>, reqQuery = {}, envOverrides = {}) => {
    const app = new Hono<ContextEnv>();
    app.use("*", authMiddleware);
    app.get("*", (c) => c.json({ user: c.get("user") }));

    const queryStr = Object.entries(reqQuery)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const path = queryStr ? `/?${queryStr}` : "/";

    const req = new Request(`http://localhost${path}`, {
      headers: reqHeaders,
    });

    const env = {
      SUPABASE_JWT_SECRET: secret,
      SUPABASE_URL: supabaseUrl,
      DB: dbMock,
      ...envOverrides,
    };

    return await app.fetch(req, env, executionCtxMock);
  };

  it("should reject missing Authorization header", async () => {
    const res = await runMiddleware({});
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing or invalid token");
  });

  it("should reject expired JWT", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) - 60, // 60 seconds ago
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toContain("expired");
  });

  it("should reject JWT with unexpected/tampered algorithm (C-4)", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    // We sign as RS256 but pass in header, or alg: none
    const tokenNone = await signHs256Token(payload, secret, { alg: "none" });
    const resNone = await runMiddleware({ Authorization: `Bearer ${tokenNone}` });
    expect(resNone.status).toBe(401);

    const tokenRS256 = await signHs256Token(payload, secret, { alg: "RS256" });
    const resRS256 = await runMiddleware({ Authorization: `Bearer ${tokenRS256}` });
    expect(resRS256.status).toBe(401);
  });

  it("should reject JWT with wrong issuer/audience (H-1)", async () => {
    const payloadWrongIss = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: "https://malicious-supabase.co",
      aud: "authenticated",
    };
    const tokenWrongIss = await signHs256Token(payloadWrongIss, secret);
    const resWrongIss = await runMiddleware({ Authorization: `Bearer ${tokenWrongIss}` });
    expect(resWrongIss.status).toBe(401);

    const payloadWrongAud = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "wrong-audience",
    };
    const tokenWrongAud = await signHs256Token(payloadWrongAud, secret);
    const resWrongAud = await runMiddleware({ Authorization: `Bearer ${tokenWrongAud}` });
    expect(resWrongAud.status).toBe(401);
  });

  it("should reject query string token if restricted (M-1)", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const res = await runMiddleware({}, { token });
    expect(res.status).toBe(401);
  });

  it("should accept valid HS256 JWT and attach user context", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user).toEqual({
      uid: "user-123",
      email: "test@example.com",
    });
  });

  it("should accept valid ES256 JWT and attach user context", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    const keys = await getMockKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    
    // Mock the JWKS fetch
    const jwksRes = {
      keys: [{
        kid: "valid-es256-kid",
        alg: "ES256",
        ...jwk,
      }],
    };
    
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation((url: any) => {
      if (typeof url === "string" && url.endsWith("/auth/v1/.well-known/jwks.json")) {
        return Promise.resolve(new Response(JSON.stringify(jwksRes), { status: 200 }));
      }
      return Promise.reject(new Error("unexpected fetch"));
    });

    const token = await signEs256Token(payload, "valid-es256-kid");
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user).toEqual({
      uid: "user-456",
      email: "es256@example.com",
    });
    
    globalFetchMock.mockRestore();
  });

  it("should accept valid HS256 JWT with base64 encoded secret", async () => {
    const rawSecret = "my-base64-secret-key-that-is-sufficiently-long";
    const base64Secret = btoa(rawSecret);
    const payload = {
      sub: "user-789",
      email: "base64@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const keyBytes = Uint8Array.from(rawSecret, (c) => c.charCodeAt(0));
    const token = await signHs256TokenWithRawBytes(payload, keyBytes);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` }, {}, { SUPABASE_JWT_SECRET: base64Secret });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.uid).toBe("user-789");
  });

  it("should reject HS256 JWT with invalid signature", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    // Tamper with signature
    const parts = token.split(".");
    parts[2] = parts[2] + "invalid";
    const tamperedToken = parts.join(".");
    
    const res = await runMiddleware({ Authorization: `Bearer ${tamperedToken}` });
    expect(res.status).toBe(401);
  });

  it("should reject ES256 JWT with invalid signature", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    const keys = await getMockKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const jwksRes = { keys: [{ kid: "invalid-signature-kid", alg: "ES256", ...jwk }] };
    
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(jwksRes), { status: 200 }));
    });

    const token = await signEs256Token(payload, "invalid-signature-kid");
    const parts = token.split(".");
    parts[2] = "A".repeat(86);
    const tamperedToken = parts.join(".");

    const res = await runMiddleware({ Authorization: `Bearer ${tamperedToken}` });
    expect(res.status).toBe(401);
    
    globalFetchMock.mockRestore();
  });

  it("should reject ES256 if SUPABASE_URL is missing", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signEs256Token(payload, "missing-supabase-url-kid");
    const res = await runMiddleware({ Authorization: `Bearer ${token}` }, {}, { SUPABASE_URL: "" });
    expect(res.status).toBe(401);
  });

  it("should reject HS256 if SUPABASE_JWT_SECRET is missing", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` }, {}, { SUPABASE_JWT_SECRET: "" });
    expect(res.status).toBe(401);
  });

  it("should reject if JWKS fetch fails", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
    });

    const token = await signEs256Token(payload, "fetch-fail-kid");
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    
    globalFetchMock.mockRestore();
  });

  it("should reject if JWK kid is not found in JWKS", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    const jwksRes = { keys: [] };
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(jwksRes), { status: 200 }));
    });

    const token = await signEs256Token(payload, "not-found-kid");
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    
    globalFetchMock.mockRestore();
  });

  it("should reject if ES256 JWT is expired", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) - 60,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    
    const keys = await getMockKeyPair();
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const jwksRes = { keys: [{ kid: "expired-es256-kid", alg: "ES256", ...jwk }] };
    
    const globalFetchMock = vi.spyOn(global, "fetch").mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify(jwksRes), { status: 200 }));
    });

    const token = await signEs256Token(payload, "expired-es256-kid");
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toContain("expired");
    
    globalFetchMock.mockRestore();
  });

  it("should reject if JWT has invalid format", async () => {
    const res = await runMiddleware({ Authorization: "Bearer plain-text-token" });
    expect(res.status).toBe(401);
  });

  it("should reject if ES256 JWT is missing kid in header", async () => {
    const payload = {
      sub: "user-456",
      email: "es256@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signEs256Token(payload, ""); // Empty kid
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  it("should reject expired HS256 JWT with base64 encoded secret", async () => {
    const rawSecret = "my-base64-secret-key-that-is-sufficiently-long";
    const base64Secret = btoa(rawSecret);
    const payload = {
      sub: "user-789",
      email: "base64@example.com",
      exp: Math.floor(Date.now() / 1000) - 60,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const keyBytes = Uint8Array.from(rawSecret, (c) => c.charCodeAt(0));
    const token = await signHs256TokenWithRawBytes(payload, keyBytes);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` }, {}, { SUPABASE_JWT_SECRET: base64Secret });
    expect(res.status).toBe(401);
  });

  it("should handle DB failure gracefully in execution context", async () => {
    dbMock.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error("DB run failed")),
      }),
    });
    const payload = {
      sub: "user-db-fail",
      email: "dbfail@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const res = await runMiddleware({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
  });

  it("should log verification failure but parse header if possible", async () => {
    // A token with invalid signature, but correct header JSON
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: supabaseUrl,
      aud: "authenticated",
    };
    const token = await signHs256Token(payload, secret);
    const parts = token.split(".");
    // Invalidate parts[1] (payload) but keep parts[0] (header) intact
    parts[1] = "invalid_payload_b64";
    const res = await runMiddleware({ Authorization: `Bearer ${parts.join(".")}` });
    expect(res.status).toBe(401);
  });

  it("should log verification failure and handle header parsing exception", async () => {
    // Invalidate parts[0] so that header parsing throws
    const res = await runMiddleware({ Authorization: "Bearer invalidheader.payload.signature" });
    expect(res.status).toBe(401);
  });
});
