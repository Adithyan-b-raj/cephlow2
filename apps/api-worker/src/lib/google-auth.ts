import type { Env } from "../types.js";

export type GoogleScopeType = "drive" | "sheets" | "slides" | "all";

const SCOPE_SETS: Record<GoogleScopeType, string[]> = {
  drive: ["https://www.googleapis.com/auth/drive.file"],
  sheets: ["https://www.googleapis.com/auth/drive.file"],
  slides: ["https://www.googleapis.com/auth/drive.file"],
  all: ["https://www.googleapis.com/auth/drive.file"],
};

async function encryptToken(text: string, secretKeyStr: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKeyStr.padEnd(32, "0").slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encoder.encode(text)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

async function decryptToken(encryptedBase64: string, secretKeyStr: string): Promise<string> {
  const binary = atob(encryptedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKeyStr.padEnd(32, "0").slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  
  return new TextDecoder().decode(decrypted);
}

export async function generateAuthUrl(
  db: D1Database,
  env: Env,
  uid: string,
  scopeType: GoogleScopeType = "all",
  originUrl?: string
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  
  // Store the pending auth session in D1
  await db.prepare(`
    INSERT INTO pending_google_auth (nonce, uid, scope_type, expires_at, origin_url)
    VALUES (?, ?, ?, ?, ?)
  `).bind(nonce, uid, scopeType, Date.now() + 10 * 60 * 1000, originUrl ?? null).run();

  const params = new URLSearchParams({
    access_type: "offline",
    prompt: "consent",
    response_type: "code",
    client_id: env.GOOGLE_CLIENT_ID || "",
    redirect_uri: env.GOOGLE_REDIRECT_URI || "",
    scope: SCOPE_SETS[scopeType].join(" "),
    state: nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleCallback(
  db: D1Database,
  env: Env,
  code: string,
  state: string
): Promise<{ originUrl?: string }> {
  // Retrieve pending auth session
  const row = await db.prepare(`
    SELECT uid, expires_at, origin_url, scope_type FROM pending_google_auth
    WHERE nonce = ?
  `).bind(state).first<{ uid: string; expires_at: number; origin_url: string | null; scope_type: string }>();

  if (!row) throw new Error("Invalid or expired state parameter");

  // Clean up nonce
  await db.prepare(`DELETE FROM pending_google_auth WHERE nonce = ?`).bind(state).run();

  if (Date.now() > row.expires_at) {
    throw new Error("Auth session expired. Please try again.");
  }

  // Exchange auth code for tokens
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: env.GOOGLE_REDIRECT_URI || "",
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Failed to exchange authorization code");
  }

  if (!data.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again."
    );
  }

  const scopeType = row.scope_type || "all";

  // Encrypt the refresh token before storage (H-2)
  const encryptionKey = env.TOKEN_ENCRYPTION_KEY || env.SUPABASE_JWT_SECRET || "default-token-encryption-key-32-characters";
  const encryptedRefreshToken = await encryptToken(data.refresh_token, encryptionKey);

  // Upsert the refresh token in D1
  await db.prepare(`
    INSERT INTO user_google_tokens (user_id, scope_type, refresh_token, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, scope_type) DO UPDATE SET
      refresh_token = excluded.refresh_token,
      updated_at = datetime('now')
  `).bind(row.uid, scopeType, encryptedRefreshToken).run();

  return { originUrl: row.origin_url ?? undefined };
}

export async function hasGoogleToken(db: D1Database, uid: string, scopeType?: GoogleScopeType): Promise<boolean> {
  let query = "SELECT 1 FROM user_google_tokens WHERE user_id = ?";
  const params: any[] = [uid];
  
  if (scopeType) {
    query += " AND scope_type = ?";
    params.push(scopeType);
  }

  const row = await db.prepare(query).bind(...params).first();
  return !!row;
}

export async function hasAnyGoogleToken(db: D1Database, uid: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 FROM user_google_tokens WHERE user_id = ? LIMIT 1
  `).bind(uid).first();
  return !!row;
}

// Retrieves a short-lived access token, refreshing it if necessary
export async function getAccessToken(
  db: D1Database,
  env: Env,
  uid: string,
  scopeType: GoogleScopeType = "all"
): Promise<{ accessToken: string; expiresAt: number }> {
  // Fetch refresh token from D1
  const rows = await db.prepare(`
    SELECT refresh_token, scope_type FROM user_google_tokens
    WHERE user_id = ?
  `).bind(uid).all<{ refresh_token: string; scope_type: string }>();

  if (!rows.results || rows.results.length === 0) {
    const err: any = new Error("Google account not connected. Please reconnect via the app.");
    err.code = "GOOGLE_NOT_CONNECTED";
    throw err;
  }

  // Exact match, then fall back to 'all', then take first available
  const exact = rows.results.find((r) => r.scope_type === scopeType);
  const fallback = rows.results.find((r) => r.scope_type === "all");
  const token = exact || fallback || rows.results[0];

  // Decrypt token (H-2)
  const encryptionKey = env.TOKEN_ENCRYPTION_KEY || env.SUPABASE_JWT_SECRET || "default-token-encryption-key-32-characters";
  let decryptedRefreshToken = "";
  try {
    decryptedRefreshToken = await decryptToken(token.refresh_token, encryptionKey);
  } catch (err: any) {
    // Fall back to raw token if decryption fails (e.g. legacy plaintext token)
    decryptedRefreshToken = token.refresh_token;
  }

  // Request new access token from Google using refresh token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID || "",
      client_secret: env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: decryptedRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (data.error === "invalid_grant") {
      // Refresh token is expired/revoked, delete from D1
      await db.prepare(`DELETE FROM user_google_tokens WHERE user_id = ?`).bind(uid).run();
      const err: any = new Error("Your Google account connection has expired. Please reconnect your Google account.");
      err.code = "GOOGLE_TOKEN_EXPIRED";
      err.status = 401;
      throw err;
    }
    throw new Error(data.error_description || data.error || "Failed to refresh Google access token");
  }

  const expiresAt = Date.now() + (data.expires_in || 3500) * 1000;
  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

export async function disconnectGoogleToken(db: D1Database, env: Env, uid: string, scopeType?: GoogleScopeType): Promise<void> {
  let selectQuery = "SELECT refresh_token FROM user_google_tokens WHERE user_id = ?";
  const params: any[] = [uid];
  
  if (scopeType) {
    selectQuery += " AND scope_type = ?";
    params.push(scopeType);
  }

  const { results } = await db.prepare(selectQuery).bind(...params).all<{ refresh_token: string }>();

  const encryptionKey = env.TOKEN_ENCRYPTION_KEY || env.SUPABASE_JWT_SECRET || "default-token-encryption-key-32-characters";

  // Revoke from Google APIs (best-effort)
  for (const row of results || []) {
    try {
      let decryptedRefreshToken = "";
      try {
        decryptedRefreshToken = await decryptToken(row.refresh_token, encryptionKey);
      } catch {
        decryptedRefreshToken = row.refresh_token;
      }
      await fetch(`https://oauth2.googleapis.com/revoke?token=${decryptedRefreshToken}`, { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  let deleteQuery = "DELETE FROM user_google_tokens WHERE user_id = ?";
  if (scopeType) {
    deleteQuery += " AND scope_type = ?";
    await db.prepare(deleteQuery).bind(uid, scopeType).run();
  } else {
    await db.prepare(deleteQuery).bind(uid).run();
  }
}
