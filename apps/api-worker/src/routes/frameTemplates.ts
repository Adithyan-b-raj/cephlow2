import { Hono } from "hono";
import { workspaceMiddleware } from "../middleware/workspace.js";

const router = new Hono<ContextEnv>();

router.use("/frame-templates", workspaceMiddleware);
router.use("/frame-templates/*", workspaceMiddleware);

const MAX_CSS_CHARS = 20000;

function validateConfig(config: any): string | null {
  if (!config || !["gradient", "hud", "css"].includes(config.type)) {
    return "config.type must be gradient, hud, or css";
  }
  if (config.type === "css") {
    if (typeof config.css !== "string") return "config.css must be a string";
    if (config.css.length > MAX_CSS_CHARS) return `CSS exceeds ${MAX_CSS_CHARS.toLocaleString()} character limit`;
  }
  return null;
}

// 1. List custom frame templates for the active workspace
router.get("/frame-templates", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM custom_frames
      WHERE workspace_id = ?
      ORDER BY created_at DESC
    `).bind(workspace.id).all<any>();

    const frames = results.map(row => {
      let configObj = null;
      try { configObj = JSON.parse(row.config); } catch {}
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        config: configObj || row.config,
        createdAt: row.created_at,
      };
    });

    return c.json({ frames });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Create a new custom frame template
router.post("/frame-templates", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { name, config } = await c.req.json().catch(() => ({}));

    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    const configErr = validateConfig(config);
    if (configErr) return c.json({ error: configErr }, 400);

    const frameId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO custom_frames (id, workspace_id, name, config)
      VALUES (?, ?, ?, ?)
    `).bind(frameId, workspace.id, name.trim(), JSON.stringify(config)).run();

    const frame = await c.env.DB.prepare(`
      SELECT * FROM custom_frames WHERE id = ?
    `).bind(frameId).first<any>();

    return c.json({
      id: frame.id,
      workspaceId: frame.workspace_id,
      name: frame.name,
      config: JSON.parse(frame.config || "{}"),
      createdAt: frame.created_at,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Update a custom frame template
router.patch("/frame-templates/:id", async (c) => {
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const { name, config } = await c.req.json().catch(() => ({}));

    const existing = await c.env.DB.prepare(`
      SELECT workspace_id FROM custom_frames WHERE id = ?
    `).bind(id).first<{ workspace_id: string }>();

    if (!existing) return c.json({ error: "Frame not found" }, 404);
    if (existing.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);

    if (config !== undefined) {
      const configErr = validateConfig(config);
      if (configErr) return c.json({ error: configErr }, 400);
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      fields.push("name = ?");
      params.push(name.trim());
    }
    if (config !== undefined) {
      fields.push("config = ?");
      params.push(JSON.stringify(config));
    }

    if (fields.length > 0) {
      params.push(id);
      await c.env.DB.prepare(`
        UPDATE custom_frames
        SET ${fields.join(", ")}
        WHERE id = ?
      `).bind(...params).run();
    }

    const frame = await c.env.DB.prepare(`
      SELECT * FROM custom_frames WHERE id = ?
    `).bind(id).first<any>();

    return c.json({
      id: frame.id,
      workspaceId: frame.workspace_id,
      name: frame.name,
      config: JSON.parse(frame.config || "{}"),
      createdAt: frame.created_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Delete a custom frame template
router.delete("/frame-templates/:id", async (c) => {
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const existing = await c.env.DB.prepare(`
      SELECT workspace_id FROM custom_frames WHERE id = ?
    `).bind(id).first<{ workspace_id: string }>();

    if (!existing) return c.json({ error: "Frame not found" }, 404);
    if (existing.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);

    // Block if any batch still uses it
    const inUse = await c.env.DB.prepare(`
      SELECT id FROM batches
      WHERE workspace_id = ? AND frame_tier = ?
      LIMIT 1
    `).bind(workspace.id, `custom:${id}`).first();
    if (inUse) {
      return c.json({
        error: "This frame is in use by a batch. Remove it from all batches before deleting.",
      }, 409);
    }

    // Block if has active listing
    const hasListing = await c.env.DB.prepare(`
      SELECT id FROM frame_listings
      WHERE frame_id = ? AND is_active = 1
      LIMIT 1
    `).bind(id).first();
    if (hasListing) {
      return c.json({
        error: "This frame has an active marketplace listing. Unpublish it before deleting.",
      }, 409);
    }

    await c.env.DB.prepare(`DELETE FROM custom_frames WHERE id = ?`).bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
