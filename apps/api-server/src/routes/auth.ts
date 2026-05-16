import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { generateAuthUrl, handleCallback, hasGoogleToken, disconnectGoogleToken } from "../lib/googleAuth.js";

const router = Router();

// Protected: check if Google account is connected
router.get("/auth/google/status", requireAuth, async (req, res) => {
  try {
    const connected = await hasGoogleToken(req.user!.uid);
    res.json({ connected });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Protected: generate the Google OAuth consent URL
router.get("/auth/google/url", requireAuth, async (req, res) => {
  try {
    const url = await generateAuthUrl(req.user!.uid);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unprotected: callback redirect from Google — must be registered in app.ts before requireAuth
router.get("/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = (process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/$/, "");

  if (error) {
    return res.redirect(`${frontendUrl}?google_auth=error&reason=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}?google_auth=error&reason=missing_params`);
  }

  try {
    await handleCallback(String(code), String(state));
    res.redirect(`${frontendUrl}?google_auth=success`);
  } catch (err: any) {
    res.redirect(`${frontendUrl}?google_auth=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// Protected: disconnect Google account
router.delete("/auth/google/disconnect", requireAuth, async (req, res) => {
  try {
    await disconnectGoogleToken(req.user!.uid);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
