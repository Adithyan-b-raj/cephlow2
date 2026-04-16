import { Router, type IRouter } from "express";
import {
  listSlideTemplates,
  getSlidePlaceholders,
  getSlidesInfo,
  createSlidePresentation,
  addQrCodePlaceholder,
} from "../lib/googleDrive.js";

const router: IRouter = Router();

router.get("/slides/:templateId/slides-info", async (req, res) => {
  try {
    const slidesInfo = await getSlidesInfo(req.user!.uid, req.params.templateId);
    return res.json({ slides: slidesInfo });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/slides/templates", async (req, res) => {
  try {
    const templates = await listSlideTemplates(req.user!.uid);
    return res.json({ templates });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/slides/templates", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = await createSlidePresentation(req.user!.uid, name);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/slides/:templateId/placeholders", async (req, res) => {
  try {
    const placeholders = await getSlidePlaceholders(req.user!.uid, req.params.templateId);
    return res.json({ placeholders });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/slides/:templateId/qr-placeholder", async (req, res) => {
  try {
    await addQrCodePlaceholder(req.user!.uid, req.params.templateId);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
