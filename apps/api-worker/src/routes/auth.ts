import { Hono } from "hono";
import {
  generateAuthUrl,
  handleCallback,
  hasGoogleToken,
  hasAnyGoogleToken,
  disconnectGoogleToken,
  type GoogleScopeType,
} from "../lib/google-auth.js";

const router = new Hono<ContextEnv>();

const VALID_SCOPES: GoogleScopeType[] = ["drive", "sheets", "slides", "all"];

function parseScopeType(raw: string | undefined): GoogleScopeType {
  if (raw && VALID_SCOPES.includes(raw as GoogleScopeType)) {
    return raw as GoogleScopeType;
  }
  return "all";
}

// Check which Google scopes are connected
router.get("/auth/google/status", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const [drive, sheets, slides] = await Promise.all([
      hasGoogleToken(c.env.DB, user.uid, "drive"),
      hasGoogleToken(c.env.DB, user.uid, "sheets"),
      hasGoogleToken(c.env.DB, user.uid, "slides"),
    ]);
    const legacy = await hasAnyGoogleToken(c.env.DB, user.uid);
    return c.json({ connected: legacy, drive, sheets, slides });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Generate the Google OAuth consent URL for a specific scope
router.get("/auth/google/url", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const origin = c.req.query("origin");
    const scopeType = parseScopeType(c.req.query("scope"));
    const url = await generateAuthUrl(c.env.DB, c.env, user.uid, scopeType, origin);
    return c.json({ url });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Callback redirect from Google (unprotected)
router.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  
  const frontendUrl = (c.env.FRONTEND_URL || c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");

  if (error) {
    return c.redirect(`${frontendUrl}/settings?google_auth=error&reason=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return c.redirect(`${frontendUrl}/settings?google_auth=error&reason=missing_params`);
  }

  try {
    const { originUrl } = await handleCallback(c.env.DB, c.env, String(code), String(state));
    const redirectBase = originUrl || frontendUrl;
    return c.redirect(`${redirectBase}/settings?google_auth=success`);
  } catch (err: any) {
    return c.redirect(`${frontendUrl}/settings?google_auth=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// Disconnect a specific scope (or all if no scope param)
router.delete("/auth/google/disconnect", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const scopeType = c.req.query("scope") ? parseScopeType(c.req.query("scope")) : undefined;
    await disconnectGoogleToken(c.env.DB, c.env, user.uid, scopeType);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
