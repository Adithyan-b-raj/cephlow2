import { google } from "googleapis";
import { supabaseAdmin } from "@workspace/supabase";
import crypto from "crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations",
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function generateAuthUrl(uid: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  await supabaseAdmin.from("pending_google_auth").upsert({
    nonce,
    uid,
    expires_at: Date.now() + 10 * 60 * 1000,
  });

  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: nonce,
  });
}

export async function handleCallback(code: string, state: string): Promise<void> {
  const { data: row } = await supabaseAdmin
    .from("pending_google_auth")
    .select("uid, expires_at")
    .eq("nonce", state)
    .maybeSingle();

  if (!row) throw new Error("Invalid or expired state parameter");

  await supabaseAdmin.from("pending_google_auth").delete().eq("nonce", state);

  if (Date.now() > row.expires_at) throw new Error("Auth session expired. Please try again.");

  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke app access at myaccount.google.com/permissions and try again."
    );
  }

  await supabaseAdmin.from("user_google_tokens").upsert({
    user_id: row.uid,
    refresh_token: tokens.refresh_token,
    updated_at: new Date().toISOString(),
  });
}

export async function hasGoogleToken(uid: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_google_tokens")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  return !!data;
}

export async function getAuthClientForUser(uid: string) {
  const { data } = await supabaseAdmin
    .from("user_google_tokens")
    .select("refresh_token")
    .eq("user_id", uid)
    .maybeSingle();

  if (!data) {
    const err: any = new Error("Google account not connected. Please reconnect via the app.");
    err.code = "GOOGLE_NOT_CONNECTED";
    throw err;
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: data.refresh_token });
  return client;
}

function isInvalidGrant(err: any): boolean {
  return (
    err?.message === "invalid_grant" ||
    err?.response?.data?.error === "invalid_grant" ||
    err?.code === "invalid_grant"
  );
}

export async function disconnectGoogleToken(uid: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("user_google_tokens")
    .select("refresh_token")
    .eq("user_id", uid)
    .maybeSingle();

  if (data?.refresh_token) {
    try {
      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      await client.revokeToken(data.refresh_token);
    } catch {
      // best-effort — still delete from DB even if revocation fails
    }
  }

  await supabaseAdmin.from("user_google_tokens").delete().eq("user_id", uid);
}

export async function handleGoogleError(uid: string, err: any): Promise<never> {
  if (isInvalidGrant(err)) {
    await supabaseAdmin.from("user_google_tokens").delete().eq("user_id", uid);
    const newErr: any = new Error(
      "Your Google account connection has expired. Please reconnect your Google account and try again."
    );
    newErr.code = "GOOGLE_TOKEN_EXPIRED";
    newErr.status = 401;
    throw newErr;
  }
  throw err;
}
