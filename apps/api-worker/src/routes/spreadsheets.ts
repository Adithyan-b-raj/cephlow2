import { Hono } from "hono";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";

const router = new Hono<ContextEnv>();

router.use("/spreadsheets", workspaceMiddleware);
router.use("/spreadsheets/*", workspaceMiddleware);

// 1. List all spreadsheets for the workspace
router.get("/spreadsheets", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, columns, created_at, updated_at, user_id
      FROM spreadsheets
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
    `).bind(workspace.id).all<any>();

    const sheets = results.map((row) => {
      let parsedCols: string[] = [];
      try { parsedCols = JSON.parse(row.columns || "[]"); } catch {}
      return {
        id: row.id,
        name: row.name,
        columns: parsedCols,
        columnCount: parsedCols.length,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        userId: row.user_id,
      };
    });

    return c.json({ spreadsheets: sheets });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Get a single spreadsheet (with full row data)
router.get("/spreadsheets/:id", async (c) => {
  const workspace = c.get("workspace")!;
  const id = c.req.param("id");
  try {
    const sheet = await c.env.DB.prepare(`
      SELECT * FROM spreadsheets
      WHERE id = ? AND workspace_id = ?
    `).bind(id, workspace.id).first<any>();

    if (!sheet) return c.json({ error: "Not found" }, 404);

    let columns: string[] = [];
    let rows: any[] = [];
    try { columns = JSON.parse(sheet.columns || "[]"); } catch {}
    try { rows = JSON.parse(sheet.rows || "[]"); } catch {}

    return c.json({
      id: sheet.id,
      workspaceId: sheet.workspace_id,
      userId: sheet.user_id,
      name: sheet.name,
      columns,
      rows,
      createdAt: sheet.created_at,
      updatedAt: sheet.updated_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Create a spreadsheet
router.post("/spreadsheets", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const { name, columns, rows } = await c.req.json().catch(() => ({}));
    if (!name) return c.json({ error: "name is required" }, 400);

    const sheetId = crypto.randomUUID();
    const colsStr = JSON.stringify(Array.isArray(columns) ? columns : []);
    const rowsStr = JSON.stringify(Array.isArray(rows) ? rows : []);

    await c.env.DB.prepare(`
      INSERT INTO spreadsheets (id, workspace_id, user_id, name, columns, rows)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(sheetId, workspace.id, user.uid, name.trim(), colsStr, rowsStr).run();

    const sheet = await c.env.DB.prepare(`
      SELECT * FROM spreadsheets WHERE id = ?
    `).bind(sheetId).first<any>();

    return c.json({
      id: sheet.id,
      workspaceId: sheet.workspace_id,
      userId: sheet.user_id,
      name: sheet.name,
      columns: JSON.parse(sheet.columns || "[]"),
      rows: JSON.parse(sheet.rows || "[]"),
      createdAt: sheet.created_at,
      updatedAt: sheet.updated_at,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Update a spreadsheet
router.put("/spreadsheets/:id", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const id = c.req.param("id");
  try {
    // Only the creator or an admin/owner can update
    const existing = await c.env.DB.prepare(`
      SELECT user_id FROM spreadsheets WHERE id = ? AND workspace_id = ?
    `).bind(id, workspace.id).first<{ user_id: string }>();

    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.user_id !== user.uid && !isAdminOrOwner(workspace.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { name, columns, rows } = await c.req.json().catch(() => ({}));

    // Build patch query dynamically
    const fields: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    if (name !== undefined) {
      fields.push("name = ?");
      params.push(name.trim());
    }
    if (columns !== undefined) {
      fields.push("columns = ?");
      params.push(JSON.stringify(columns));
    }
    if (rows !== undefined) {
      fields.push("rows = ?");
      params.push(JSON.stringify(rows));
    }

    params.push(id);

    await c.env.DB.prepare(`
      UPDATE spreadsheets
      SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...params).run();

    const sheet = await c.env.DB.prepare(`
      SELECT * FROM spreadsheets WHERE id = ?
    `).bind(id).first<any>();

    return c.json({
      id: sheet.id,
      workspaceId: sheet.workspace_id,
      userId: sheet.user_id,
      name: sheet.name,
      columns: JSON.parse(sheet.columns || "[]"),
      rows: JSON.parse(sheet.rows || "[]"),
      createdAt: sheet.created_at,
      updatedAt: sheet.updated_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Delete a spreadsheet
router.delete("/spreadsheets/:id", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const id = c.req.param("id");
  try {
    const existing = await c.env.DB.prepare(`
      SELECT user_id FROM spreadsheets WHERE id = ? AND workspace_id = ?
    `).bind(id, workspace.id).first<{ user_id: string }>();

    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.user_id !== user.uid && !isAdminOrOwner(workspace.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await c.env.DB.prepare(`
      DELETE FROM spreadsheets WHERE id = ?
    `).bind(id).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
