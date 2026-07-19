import { Hono } from "hono";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";

const router = new Hono<ContextEnv>();

router.use("/wallet", workspaceMiddleware);
router.use("/wallet/*", workspaceMiddleware);

// 1. GET /wallet — Fetch balance & transfer code
router.get("/wallet", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const ws = await c.env.DB.prepare(`
      SELECT current_balance, transfer_code FROM workspaces WHERE id = ?
    `).bind(workspace.id).first<{ current_balance: number; transfer_code: string | null }>();

    return c.json({
      currentBalance: ws?.current_balance ?? 0,
      transferCode: ws?.transfer_code ?? null,
      costs: {
        generation: Number(c.env.CREDIT_COST_GENERATION || 1),
        email: Number(c.env.CREDIT_COST_EMAIL || 1),
        whatsapp: Number(c.env.CREDIT_COST_WHATSAPP || 3),
        creditsPerRupee: Number(c.env.CREDITS_PER_RUPEE || 1),
        minRechargeAmount: Number(c.env.MIN_RECHARGE_AMOUNT || 100),
      },
    });
  } catch (err: any) {
    console.error("Error fetching wallet balance:", err.message);
    return c.json({ error: "Failed to fetch wallet balance" }, 500);
  }
});

// 2. GET /wallet/history — Fetch workspace transaction history
router.get("/wallet/history", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT * FROM ledgers
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(workspace.id).all<any>();

    const ledgers = results.map(row => ({
      id: row.id,
      type: row.type || "topup",
      amount: row.amount || 0,
      balanceAfter: row.balance_after || 0,
      description: row.description || "",
      metadata: JSON.parse(row.metadata || "{}"),
      userId: row.user_id,
      createdAt: row.created_at,
    }));

    return c.json({ ledgers });
  } catch (err: any) {
    console.error("Error fetching ledger history:", err.message);
    return c.json({ error: "Failed to fetch ledger history" }, 500);
  }
});

// 3. GET /wallet/resolve — Resolve workspace details by code
router.get("/wallet/resolve", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const code = c.req.query("code")?.trim().toUpperCase() || "";
    if (!code) return c.json({ error: "code is required" }, 400);

    const dest = await c.env.DB.prepare(`
      SELECT id, name, transfer_code FROM workspaces WHERE transfer_code = ?
    `).bind(code).first<any>();

    if (!dest) return c.json({ error: "No workspace found with that code" }, 404);
    if (dest.id === workspace.id) {
      return c.json({ error: "That is your own workspace" }, 400);
    }

    return c.json({ id: dest.id, name: dest.name, code: dest.transfer_code });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. POST /wallet/send — Transfer credits between workspaces
router.post("/wallet/send", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  
  if (!isAdminOrOwner(workspace.role)) {
    return c.json({ error: "Only workspace admins can send credits" }, 403);
  }

  try {
    const { toCode, amount, note = "" } = await c.req.json().catch(() => ({}));

    if (!toCode || typeof toCode !== "string" || !toCode.trim()) {
      return c.json({ error: "toCode is required" }, 400);
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount !== Math.floor(amount)) {
      return c.json({ error: "amount must be a positive whole number" }, 400);
    }
    if (typeof note !== "string" || note.length > 200) {
      return c.json({ error: "note must be 200 characters or fewer" }, 400);
    }

    // A. Resolve destination workspace
    const dest = await c.env.DB.prepare(`
      SELECT id, name, current_balance FROM workspaces WHERE transfer_code = ?
    `).bind(toCode.trim().toUpperCase()).first<any>();

    if (!dest) return c.json({ error: "No workspace found with that code" }, 404);
    if (dest.id === workspace.id) {
      return c.json({ error: "Cannot transfer to your own workspace" }, 400);
    }

    // B. Verify current workspace balance
    const src = await c.env.DB.prepare(`
      SELECT name, current_balance, transfer_code FROM workspaces WHERE id = ?
    `).bind(workspace.id).first<{ name: string; current_balance: number; transfer_code: string | null }>();
    if (!src) return c.json({ error: "Workspace not found" }, 404);

    // Atomic deduction (C-2)
    const updatedSrc = await c.env.DB.prepare(`
      UPDATE workspaces SET current_balance = current_balance - ?
      WHERE id = ? AND current_balance >= ?
      RETURNING current_balance
    `).bind(amount, workspace.id, amount).first<{ current_balance: number }>();

    if (!updatedSrc) {
      return c.json({ error: "Insufficient workspace balance", available: src.current_balance }, 400);
    }

    const newSrcBalance = updatedSrc.current_balance;
    const newDestBalance = dest.current_balance + amount;
    const transferId = crypto.randomUUID();

    // C. Execute updates in a single batch
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE workspaces SET current_balance = current_balance + ? WHERE id = ?`).bind(amount, dest.id),
      
      c.env.DB.prepare(`
        INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata, transfer_id)
        VALUES (?, ?, ?, 'transfer_out', ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), workspace.id, user.uid, -amount, newSrcBalance,
        `Transfer to ${dest.name}`, JSON.stringify({ to_workspace_id: dest.id, to_code: toCode }), transferId
      ),

      c.env.DB.prepare(`
        INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata, transfer_id)
        VALUES (?, ?, ?, 'transfer_in', ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), dest.id, user.uid, amount, newDestBalance,
        `Transfer from ${src.name}`, JSON.stringify({ from_workspace_id: workspace.id, from_code: src.transfer_code || "" }), transferId
      ),

      c.env.DB.prepare(`
        INSERT INTO workspace_transfers (id, from_workspace_id, to_workspace_id, amount, note, initiated_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(transferId, workspace.id, dest.id, amount, note.trim(), user.uid)
    ]);

    return c.json({
      success: true,
      transferId,
      toWorkspaceName: dest.name,
      newBalance: newSrcBalance,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. GET /wallet/transfers — Paginated transfer logs history
router.get("/wallet/transfers", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(50, parseInt(c.req.query("limit") || "20") || 20);
    const offset = (page - 1) * limit;

    const { results } = await c.env.DB.prepare(`
      SELECT t.*, 
             f.name as from_name, f.transfer_code as from_code,
             w.name as to_name, w.transfer_code as to_code
      FROM workspace_transfers t
      JOIN workspaces f ON t.from_workspace_id = f.id
      JOIN workspaces w ON t.to_workspace_id = w.id
      WHERE t.from_workspace_id = ? OR t.to_workspace_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(workspace.id, workspace.id, limit, offset).all<any>();

    const totalRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM workspace_transfers
      WHERE from_workspace_id = ? OR to_workspace_id = ?
    `).bind(workspace.id, workspace.id).first<{ count: number }>();

    const transfers = results.map((t) => ({
      id: t.id,
      direction: t.from_workspace_id === workspace.id ? "out" : "in",
      amount: t.amount,
      note: t.note,
      initiatedBy: t.initiated_by,
      fromWorkspace: { name: t.from_name, code: t.from_code },
      toWorkspace: { name: t.to_name, code: t.to_code },
      createdAt: t.created_at,
    }));

    return c.json({ transfers, total: totalRow?.count || 0, page });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
