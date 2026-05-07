import express, { Router, type IRouter } from "express";
import {
  listSlideTemplates,
  getSlidePlaceholders,
  getSlidesInfo,
  getSlidePresentation,
  createSlidePresentation,
  addQrCodePlaceholder,
  uploadPptxAsPresentation,
  getDriveClient,
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

router.post(
  "/slides/templates/upload",
  express.raw({
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    limit: "50mb",
  }),
  async (req, res) => {
    try {
      const name = (req.query.name as string)?.trim();
      if (!name) return res.status(400).json({ error: "name query parameter is required" });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "PPTX file body is required" });
      }
      const result = await uploadPptxAsPresentation(req.user!.uid, name, req.body);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
);

router.post("/slides/templates", async (req, res) => {
  try {
    const { name, existingSlideId } = req.body;
    
    if (existingSlideId) {
      const result = await getSlidePresentation(req.user!.uid, existingSlideId);
      return res.status(200).json(result);
    }
    
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
