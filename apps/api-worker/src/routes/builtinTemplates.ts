import { Hono } from "hono";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";
import { generatePresignedPutUrl, getR2PublicUrl } from "../lib/r2.js";

const router = new Hono<ContextEnv>();

router.use("/builtin-templates", workspaceMiddleware);
router.use("/builtin-templates/*", workspaceMiddleware);

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

// 1. List all builtin templates for the workspace
router.get("/builtin-templates", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, placeholders, thumbnail_url, created_at, updated_at, user_id
      FROM builtin_templates
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
    `).bind(workspace.id).all<any>();

    const templates = results.map(row => {
      let pList = [];
      try { pList = JSON.parse(row.placeholders); } catch {}
      return {
        id: row.id,
        name: row.name,
        placeholders: pList,
        thumbnailUrl: row.thumbnail_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
      };
    });

    return c.json({ templates });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Presigned URL for asset upload
router.post("/builtin-templates/asset-upload-url", async (c) => {
  const user = c.get("user")!;
  try {
    const { filename, contentType, kind } = await c.req.json().catch(() => ({}));
    if (!filename || !contentType) {
      return c.json({ error: "filename and contentType are required" }, 400);
    }
    const safe = String(filename).replace(/[^a-zA-Z0-9+\-_.]/g, "_");
    const ts = Date.now();
    const folder =
      kind === "thumbnail"
        ? `template-assets/${user.uid}/thumbnails`
        : `template-assets/${user.uid}/images`;
    const objectKey = `${folder}/${ts}_${safe}`;

    // Generate presigned PUT URL
    const { url, key } = await generatePresignedPutUrl(c.env, folder, `${ts}_${safe}`);
    const publicUrl = getR2PublicUrl(c.env, key);
    return c.json({ uploadUrl: url, key, publicUrl });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Get one builtin template
router.get("/builtin-templates/:id", async (c) => {
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const row = await c.env.DB.prepare(`
      SELECT * FROM builtin_templates WHERE id = ?
    `).bind(id).first<any>();

    if (!row) return c.json({ error: "Template not found" }, 404);
    if (row.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);

    return c.json({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      canvas: JSON.parse(row.canvas || "{}"),
      placeholders: JSON.parse(row.placeholders || "[]"),
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Create a new builtin template
router.post("/builtin-templates", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const { name, canvas, thumbnailUrl } = await c.req.json().catch(() => ({}));
    if (!name || typeof name !== "string") {
      return c.json({ error: "name is required" }, 400);
    }
    if (!canvas || typeof canvas !== "object") {
      return c.json({ error: "canvas JSON is required" }, 400);
    }
    const placeholders = extractPlaceholders(canvas);
    const templateId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO builtin_templates (id, user_id, workspace_id, name, canvas, placeholders, thumbnail_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      templateId,
      user.uid,
      workspace.id,
      name.trim(),
      JSON.stringify(canvas),
      JSON.stringify(placeholders),
      thumbnailUrl || null
    ).run();

    const row = await c.env.DB.prepare(`SELECT * FROM builtin_templates WHERE id = ?`).bind(templateId).first<any>();

    return c.json({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      canvas: JSON.parse(row.canvas || "{}"),
      placeholders: JSON.parse(row.placeholders || "[]"),
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Update an existing builtin template
router.put("/builtin-templates/:id", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const { name, canvas, thumbnailUrl } = await c.req.json().catch(() => ({}));

    const existing = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM builtin_templates WHERE id = ?
    `).bind(id).first<any>();
    if (!existing) return c.json({ error: "Template not found" }, 404);
    if (existing.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);
    if (existing.user_id !== user.uid && !isAdminOrOwner(workspace.role)) {
      return c.json({ error: "Only the author or an admin can edit this template" }, 403);
    }

    const fields: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    if (typeof name === "string") {
      fields.push("name = ?");
      params.push(name.trim());
    }
    if (canvas && typeof canvas === "object") {
      fields.push("canvas = ?");
      fields.push("placeholders = ?");
      params.push(JSON.stringify(canvas));
      params.push(JSON.stringify(extractPlaceholders(canvas)));
    }
    if (thumbnailUrl !== undefined) {
      fields.push("thumbnail_url = ?");
      params.push(thumbnailUrl || null);
    }

    if (fields.length <= 1) {
      return c.json({ error: "No fields to update" }, 400);
    }

    params.push(id);

    await c.env.DB.prepare(`
      UPDATE builtin_templates
      SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...params).run();

    const row = await c.env.DB.prepare(`SELECT * FROM builtin_templates WHERE id = ?`).bind(id).first<any>();

    return c.json({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      canvas: JSON.parse(row.canvas || "{}"),
      placeholders: JSON.parse(row.placeholders || "[]"),
      thumbnailUrl: row.thumbnail_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. Delete a builtin template
router.delete("/builtin-templates/:id", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const existing = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM builtin_templates WHERE id = ?
    `).bind(id).first<any>();
    if (!existing) return c.json({ error: "Template not found" }, 404);
    if (existing.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);
    if (existing.user_id !== user.uid && !isAdminOrOwner(workspace.role)) {
      return c.json({ error: "Only the author or an admin can delete this template" }, 403);
    }

    await c.env.DB.prepare(`DELETE FROM builtin_templates WHERE id = ?`).bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
