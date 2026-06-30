import type { MiddlewareHandler } from "hono";

// Helper: base64url decode
function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const raw = atob(base64);
  const utf8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    utf8[i] = raw.charCodeAt(i);
  }
  return new TextDecoder().decode(utf8);
}

interface JwkKey {
  alg: string;
  crv: string;
  ext: boolean;
  key_ops: string[];
  kid: string;
  kty: string;
  use: string;
  x: string;
  y: string;
}

// In-memory cache for imported keys to avoid repeating fetch + importKey
const keyCache = new Map<string, CryptoKey>();

async function getJwksPublicKey(supabaseUrl: string, kid: string): Promise<CryptoKey> {
  const cached = keyCache.get(kid);
  if (cached) return cached;

  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS from Supabase: ${res.statusText}`);
  }

  const { keys } = (await res.json()) as { keys: JwkKey[] };
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new Error(`JWK for kid "${kid}" not found in JWKS`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  keyCache.set(kid, cryptoKey);
  return cryptoKey;
}

async function verifyEs256Jwt(token: string, supabaseUrl: string): Promise<any> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64urlDecode(headerB64));
  const kid = header.kid;
  if (!kid) {
    throw new Error("Missing kid in JWT header");
  }

  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sigBytes = Uint8Array.from(
    atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const publicKey = await getJwksPublicKey(supabaseUrl, kid);
  const isValid = await crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    publicKey,
    sigBytes,
    message
  );

  if (!isValid) {
    throw new Error("Invalid ES256 signature");
  }

  const payload = JSON.parse(base64urlDecode(payloadB64));
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("JWT has expired");
  }

  return payload;
}

// Verifies HS256 JWT using Web Crypto API (trying both raw secret and base64-decoded secret)
async function verifyHs256Jwt(token: string, secretStr: string): Promise<any> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Reconstruct signature target
  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  // 2. Decode signature from base64url
  const sigBytes = Uint8Array.from(
    atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  // Try 1: UTF-8 encoded secretStr (as done in jose / packages/supabase)
  try {
    const keyBytes = new TextEncoder().encode(secretStr);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, message);
    if (isValid) {
      const payload = JSON.parse(base64urlDecode(payloadB64));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        throw new Error("JWT has expired");
      }
      return payload;
    }
  } catch (e: any) {
    if (e.message === "JWT has expired") throw e;
  }

  // Try 2: Base64 decoded secretStr
  try {
    const keyBytes = Uint8Array.from(atob(secretStr), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, message);
    if (isValid) {
      const payload = JSON.parse(base64urlDecode(payloadB64));
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        throw new Error("JWT has expired");
      }
      return payload;
    }
  } catch (e: any) {
    if (e.message === "JWT has expired") throw e;
  }

  throw new Error("Invalid JWT signature");
}

export const authMiddleware: MiddlewareHandler<ContextEnv> = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  let idToken = "";

  if (authHeader?.startsWith("Bearer ")) {
    idToken = authHeader.split("Bearer ")[1];
  } else {
    idToken = c.req.query("token") || "";
  }

  if (!idToken) {
    return c.json({ error: "Missing or invalid token" }, 401);
  }

  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }
    
    const header = JSON.parse(base64urlDecode(parts[0]));
    let decoded: any;

    if (header.alg === "ES256") {
      if (!c.env.SUPABASE_URL) {
        throw new Error("SUPABASE_URL not configured for ES256 JWT verification");
      }
      decoded = await verifyEs256Jwt(idToken, c.env.SUPABASE_URL);
    } else {
      if (!c.env.SUPABASE_JWT_SECRET) {
        throw new Error("SUPABASE_JWT_SECRET not configured for HS256 JWT verification");
      }
      decoded = await verifyHs256Jwt(idToken, c.env.SUPABASE_JWT_SECRET);
    }
    
    // Supabase sub claim contains the user ID (uid)
    const user = {
      uid: decoded.sub,
      email: decoded.email,
    };
    c.set("user", user);

    if (decoded.email) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(`
          INSERT INTO user_profiles (id, email) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET email = excluded.email, updated_at = datetime('now')
        `).bind(decoded.sub, decoded.email).run().catch(() => null)
      );
    }
    
    return await next();
  } catch (err: any) {
    try {
      const parts = idToken.split(".");
      if (parts.length > 0) {
        const header = JSON.parse(base64urlDecode(parts[0]));
        console.error("JWT Verification failed. Header:", JSON.stringify(header), "Error:", err.message);
      }
    } catch (e) {
      console.error("JWT Verification failed (could not parse header):", err.message);
    }
    return c.json({ error: `Invalid or expired token: ${err.message}` }, 401);
  }
};

