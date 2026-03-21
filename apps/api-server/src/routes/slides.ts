import { Router, type IRouter } from "express";
import {
  listSlideTemplates,
  getSlidePlaceholders,
  createSlidePresentation,
  addQrCodePlaceholder,
} from "../lib/googleDrive.js";

const router: IRouter = Router();

// List all Google Slides templates from Drive
router.get("/slides/templates", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const templates = await listSlideTemplates(accessToken);
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new blank Google Slides presentation
router.post("/slides/templates", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    const result = await createSlidePresentation(accessToken, name);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get placeholders (<<TAG>>) from a Slides template
router.get("/slides/:templateId/placeholders", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const { templateId } = req.params;
    const placeholders = await getSlidePlaceholders(accessToken, templateId);
    res.json({ placeholders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a <<qr_code>> placeholder shape to an existing presentation
router.post("/slides/:templateId/qr-placeholder", async (req, res) => {
  try {
    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }
    const { templateId } = req.params;
    await addQrCodePlaceholder(accessToken, templateId);
    res.status(200).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
