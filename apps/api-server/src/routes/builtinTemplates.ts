import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel } from "@workspace/supabase";
import { generatePresignedAssetPutUrl, getR2PublicUrl } from "../lib/cloudflareR2.js";
import { isAdminOrOwner } from "../middlewares/requireWorkspace.js";

const router: IRouter = Router();

// Extract <<placeholder>> tokens from canvas text elements
function extractPlaceholders(canvas: any): string[] {
  const out = new Set<string>();
  const elements: any[] = Array.isArray(canvas?.elements) ? canvas.elements : [];
  const re = /<<([^<>]+)>>/g;
  for (const el of elements) {
    if (el?.type === "text" && typeof el.text === "string") {
      let m;
      while ((m = re.exec(el.text)) !== null) {
        out.add(`<<${m[1].trim()}>>`);
      }
    }
  }
  return Array.from(out);
}

// ── List all builtin templates for the workspace ───────────────────────────
router.get("/builtin-templates", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await supabaseAdmin
      .from("builtin_templates")
      .select("id, name, placeholders, thumbnail_url, created_at, updated_at, user_id")
      .eq("workspace_id", req.workspace!.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return res.json({ templates: (data || []).map(toCamel) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Presigned URL for asset (image / thumbnail) upload ─────────────────────
// Registered BEFORE the /:id routes so the literal path doesn't get shadowed
// by accidental POSTs being matched against a parameterised route.
router.post("/builtin-templates/asset-upload-url", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { filename, contentType, kind } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({ error: "filename and contentType are required" });
    }
    const safe = String(filename).replace(/[^a-zA-Z0-9+\-_.]/g, "_");
    const ts = Date.now();
    const folder =
      kind === "thumbnail"
        ? `template-assets/${userId}/thumbnails`
        : `template-assets/${userId}/images`;
    const objectKey = `${folder}/${ts}_${safe}`;
    const { url, key } = await generatePresignedAssetPutUrl(
      objectKey,
      String(contentType),
      600,
    );
    const publicUrl = getR2PublicUrl(key);
    return res.json({ uploadUrl: url, key, publicUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Get one builtin template (full canvas JSON) ────────────────────────────
router.get("/builtin-templates/:id", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data, error } = await supabaseAdmin
      .from("builtin_templates")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: "Template not found" });
    if (data.workspace_id !== req.workspace!.id) return res.status(403).json({ error: "Access denied" });
    return res.json(toCamel(data));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Create a new builtin template ──────────────────────────────────────────
router.post("/builtin-templates", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { name, canvas, thumbnailUrl } = req.body || {};
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }
    if (!canvas || typeof canvas !== "object") {
      return res.status(400).json({ error: "canvas JSON is required" });
    }
    const placeholders = extractPlaceholders(canvas);
    const { data, error } = await supabaseAdmin
      .from("builtin_templates")
      .insert({
        user_id: userId,
        workspace_id: req.workspace!.id,
        name: name.trim(),
        canvas,
        placeholders,
        thumbnail_url: thumbnailUrl || null,
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(toCamel(data));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Update an existing builtin template ────────────────────────────────────
router.put("/builtin-templates/:id", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { name, canvas, thumbnailUrl } = req.body || {};

    const { data: existing } = await supabaseAdmin
      .from("builtin_templates")
      .select("user_id, workspace_id")
      .eq("id", req.params.id)
      .single();
    if (!existing) return res.status(404).json({ error: "Template not found" });
    if (existing.workspace_id !== req.workspace!.id) return res.status(403).json({ error: "Access denied" });
    if (existing.user_id !== userId && !isAdminOrOwner(req.workspace!.role)) {
      return res.status(403).json({ error: "Only the author or an admin can edit this template" });
    }

    const update: Record<string, any> = {};
    if (typeof name === "string") update.name = name.trim();
    if (canvas && typeof canvas === "object") {
      update.canvas = canvas;
      update.placeholders = extractPlaceholders(canvas);
    }
    if (typeof thumbnailUrl === "string") update.thumbnail_url = thumbnailUrl;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("builtin_templates")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    return res.json(toCamel(data));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Delete a builtin template ──────────────────────────────────────────────
router.delete("/builtin-templates/:id", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data: existing } = await supabaseAdmin
      .from("builtin_templates")
      .select("user_id, workspace_id")
      .eq("id", req.params.id)
      .single();
    if (!existing) return res.status(404).json({ error: "Template not found" });
    if (existing.workspace_id !== req.workspace!.id) return res.status(403).json({ error: "Access denied" });
    if (existing.user_id !== userId && !isAdminOrOwner(req.workspace!.role)) {
      return res.status(403).json({ error: "Only the author or an admin can delete this template" });
    }

    const { error } = await supabaseAdmin
      .from("builtin_templates")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
