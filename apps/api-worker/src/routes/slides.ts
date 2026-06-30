import { Hono } from "hono";
import { getAccessToken } from "../lib/google-auth.js";
import {
  listSlideTemplates,
  getSlidePlaceholders,
  getSlidesInfo,
  getSlidePresentation,
  createSlidePresentation,
  addQrCodePlaceholder,
  uploadPptxAsPresentation,
} from "../lib/google-drive.js";

const router = new Hono<ContextEnv>();

// Get slides thumbnail & structure info
router.get("/slides/:templateId/slides-info", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { templateId } = c.req.param();
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    
    const slidesInfo = await getSlidesInfo(accessToken, templateId);
    return c.json({ slides: slidesInfo });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// List slide presentation templates
router.get("/slides/templates", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    const templates = await listSlideTemplates(accessToken);
    return c.json({ templates });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Upload local PPTX template to Google Slides
router.post("/slides/templates/upload", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const name = c.req.query("name")?.trim();
    if (!name) return c.json({ error: "name query parameter is required" }, 400);

    const contentType = c.req.header("Content-Type") || "";
    if (!contentType.includes("presentationml.presentation")) {
      return c.json({ error: "Invalid content type. Expected PPTX file upload." }, 400);
    }

    const pptxBuffer = await c.req.arrayBuffer();
    if (!pptxBuffer || pptxBuffer.byteLength === 0) {
      return c.json({ error: "PPTX file body is required" }, 400);
    }

    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    const result = await uploadPptxAsPresentation(accessToken, name, pptxBuffer);
    
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get or Create a presentation template
router.post("/slides/templates", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { name, existingSlideId } = await c.req.json().catch(() => ({}));
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");

    if (existingSlideId) {
      const result = await getSlidePresentation(accessToken, existingSlideId);
      return c.json(result, 200);
    }
    
    if (!name) return c.json({ error: "name is required" }, 400);
    const result = await createSlidePresentation(accessToken, name);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get template slide placeholders
router.get("/slides/:templateId/placeholders", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { templateId } = c.req.param();
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    
    const placeholders = await getSlidePlaceholders(accessToken, templateId);
    return c.json({ placeholders });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Add a QR code placeholder shape to template
router.post("/slides/:templateId/qr-placeholder", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { templateId } = c.req.param();
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    
    await addQrCodePlaceholder(accessToken, templateId);
    return c.json({ ok: true }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
