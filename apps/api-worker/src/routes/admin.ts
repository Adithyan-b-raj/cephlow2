import { Hono } from "hono";
import { requirePlatformAdmin } from "../middleware/platformAdmin.js";
import { logAdminAction } from "../lib/adminAudit.js";
import { getWorkspaceFeatures, FEATURE_KEYS, type FeatureKey } from "../lib/approval.js";

const router = new Hono<ContextEnv>();

router.use("/admin/*", requirePlatformAdmin);

// 1. GET /admin/workspaces — search/list workspaces with balance + usage counts
router.get("/admin/workspaces", async (c) => {
  try {
    const q = (c.req.query("q") || "").trim();
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(50, parseInt(c.req.query("limit") || "20") || 20);
    const offset = (page - 1) * limit;

    const like = `%${q}%`;
    const whereClause = q ? `WHERE w.name LIKE ? OR up.email LIKE ?` : "";
    const bindArgs = q ? [like, like] : [];

    const [{ results }, totalRow] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          w.id, w.name, w.owner_id, up.email as owner_email,
          w.current_balance, w.suspended, w.created_at,
          (SELECT COUNT(*) FROM batches b WHERE b.workspace_id = w.id) as batch_count
        FROM workspaces w
        LEFT JOIN user_profiles up ON up.id = w.owner_id
        ${whereClause}
        ORDER BY w.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...bindArgs, limit, offset).all<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM workspaces w
        LEFT JOIN user_profiles up ON up.id = w.owner_id
        ${whereClause}
      `).bind(...bindArgs).first<{ count: number }>(),
    ]);

    const workspaces = results.map((w) => ({
      id: w.id,
      name: w.name,
      ownerId: w.owner_id,
      ownerEmail: w.owner_email,
      currentBalance: w.current_balance,
      suspended: Boolean(w.suspended),
      batchCount: w.batch_count,
      createdAt: w.created_at,
    }));

    return c.json({ workspaces, total: totalRow?.count || 0, page });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. GET /admin/workspaces/:id — detail: metadata, members, feature flags
router.get("/admin/workspaces/:id", async (c) => {
  const workspaceId = c.req.param("id");
  try {
    const ws = await c.env.DB.prepare(`
      SELECT w.*, up.email as owner_email, up.is_approved as owner_approved
      FROM workspaces w
      LEFT JOIN user_profiles up ON up.id = w.owner_id
      WHERE w.id = ?
    `).bind(workspaceId).first<any>();

    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    const [{ results: members }, batchCountRow, features] = await Promise.all([
      c.env.DB.prepare(`
        SELECT wm.user_id, wm.role, up.email
        FROM workspace_members wm
        LEFT JOIN user_profiles up ON up.id = wm.user_id
        WHERE wm.workspace_id = ?
      `).bind(workspaceId).all<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM batches WHERE workspace_id = ?
      `).bind(workspaceId).first<{ count: number }>(),
      getWorkspaceFeatures(c.env.DB, workspaceId),
    ]);

    return c.json({
      workspace: {
        id: ws.id,
        name: ws.name,
        ownerId: ws.owner_id,
        ownerEmail: ws.owner_email,
        ownerApproved: Boolean(ws.owner_approved),
        currentBalance: ws.current_balance,
        transferCode: ws.transfer_code,
        generationCost: ws.generation_cost,
        emailCost: ws.email_cost,
        whatsappCost: ws.whatsapp_cost,
        suspended: Boolean(ws.suspended),
        suspendedReason: ws.suspended_reason,
        createdAt: ws.created_at,
      },
      members: members.map((m) => ({ userId: m.user_id, role: m.role, email: m.email })),
      batchCount: batchCountRow?.count || 0,
      features,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. GET /admin/workspaces/:id/ledgers — full ledger history, uncapped
router.get("/admin/workspaces/:id/ledgers", async (c) => {
  const workspaceId = c.req.param("id");
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(100, parseInt(c.req.query("limit") || "50") || 50);
    const offset = (page - 1) * limit;

    const [{ results }, totalRow] = await Promise.all([
      c.env.DB.prepare(`
        SELECT * FROM ledgers WHERE workspace_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(workspaceId, limit, offset).all<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM ledgers WHERE workspace_id = ?
      `).bind(workspaceId).first<{ count: number }>(),
    ]);

    const ledgers = results.map((row) => ({
      id: row.id,
      type: row.type || "topup",
      amount: row.amount || 0,
      balanceAfter: row.balance_after || 0,
      description: row.description || "",
      metadata: JSON.parse(row.metadata || "{}"),
      userId: row.user_id,
      createdAt: row.created_at,
    }));

    return c.json({ ledgers, total: totalRow?.count || 0, page });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. POST /admin/workspaces/:id/credits — grant free credits
router.post("/admin/workspaces/:id/credits", async (c) => {
  const admin = c.get("user")!;
  const workspaceId = c.req.param("id");

  try {
    const { amount, reason } = await c.req.json().catch(() => ({}));

    if (!amount || typeof amount !== "number" || amount <= 0 || amount !== Math.floor(amount)) {
      return c.json({ error: "amount must be a positive whole number" }, 400);
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return c.json({ error: "reason is required" }, 400);
    }

    const trimmedReason = reason.trim();
    const ledgerId = crypto.randomUUID();

    // Atomic delta update — avoids the read-then-write race a prior read +
    // absolute SET would have against concurrent generation/email/whatsapp
    // credit deductions on the same workspace.
    const updated = await c.env.DB.prepare(`
      UPDATE workspaces SET current_balance = current_balance + ? WHERE id = ?
      RETURNING current_balance
    `).bind(amount, workspaceId).first<{ current_balance: number }>();
    if (!updated) return c.json({ error: "Workspace not found" }, 404);

    const newBalance = updated.current_balance;

    await c.env.DB.prepare(`
      INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
      VALUES (?, ?, ?, 'admin_grant', ?, ?, ?, ?)
    `).bind(
      ledgerId, workspaceId, admin.uid, amount, newBalance,
      "Free credits granted by platform admin",
      JSON.stringify({ granted_by_admin: admin.uid, granted_by_email: admin.email, reason: trimmedReason })
    ).run();

    await logAdminAction(c.env.DB, admin.uid, "credit_grant", workspaceId, {
      amount, reason: trimmedReason, new_balance: newBalance,
    }, admin.email);

    return c.json({ success: true, newBalance, ledgerId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. PATCH /admin/workspaces/:id/features/:featureKey — toggle a feature flag
router.patch("/admin/workspaces/:id/features/:featureKey", async (c) => {
  const admin = c.get("user")!;
  const workspaceId = c.req.param("id");
  const featureKey = c.req.param("featureKey") as FeatureKey;

  if (!FEATURE_KEYS.includes(featureKey)) {
    return c.json({ error: "Unknown feature key" }, 400);
  }

  try {
    const { enabled } = await c.req.json().catch(() => ({}));
    if (typeof enabled !== "boolean") {
      return c.json({ error: "enabled must be a boolean" }, 400);
    }

    const ws = await c.env.DB.prepare(`SELECT id FROM workspaces WHERE id = ?`).bind(workspaceId).first();
    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    await c.env.DB.prepare(`
      INSERT INTO workspace_features (id, workspace_id, feature_key, enabled, granted_by, granted_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(workspace_id, feature_key) DO UPDATE SET
        enabled = excluded.enabled,
        granted_by = excluded.granted_by,
        granted_at = datetime('now'),
        updated_at = datetime('now')
    `).bind(crypto.randomUUID(), workspaceId, featureKey, enabled ? 1 : 0, admin.uid).run();

    await logAdminAction(c.env.DB, admin.uid, "feature_toggle", workspaceId, {
      feature_key: featureKey, enabled,
    }, admin.email);

    return c.json({ success: true, featureKey, enabled });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. PATCH /admin/workspaces/:id/suspend — toggle the suspend kill switch
router.patch("/admin/workspaces/:id/suspend", async (c) => {
  const admin = c.get("user")!;
  const workspaceId = c.req.param("id");

  try {
    const { suspended, reason } = await c.req.json().catch(() => ({}));
    if (typeof suspended !== "boolean") {
      return c.json({ error: "suspended must be a boolean" }, 400);
    }

    const ws = await c.env.DB.prepare(`SELECT id FROM workspaces WHERE id = ?`).bind(workspaceId).first();
    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    await c.env.DB.prepare(`
      UPDATE workspaces SET suspended = ?, suspended_reason = ? WHERE id = ?
    `).bind(suspended ? 1 : 0, suspended ? (reason?.trim() || null) : null, workspaceId).run();

    await logAdminAction(
      c.env.DB, admin.uid, suspended ? "workspace_suspend" : "workspace_enable",
      workspaceId, { reason: reason?.trim() || null }, admin.email
    );

    return c.json({ success: true, suspended });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. GET /admin/approvals — list pending (or all) user approval states
router.get("/admin/approvals", async (c) => {
  try {
    const status = c.req.query("status") || "pending";
    const whereClause = status === "pending" ? "WHERE is_approved = 0" : status === "approved" ? "WHERE is_approved = 1" : "";

    const { results } = await c.env.DB.prepare(`
      SELECT id, email, is_approved FROM user_profiles ${whereClause}
      ORDER BY email ASC
    `).all<any>();

    return c.json({
      users: results.map((u) => ({ userId: u.id, email: u.email, isApproved: Boolean(u.is_approved) })),
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. PATCH /admin/approvals/:userId — approve/unapprove a user
router.patch("/admin/approvals/:userId", async (c) => {
  const admin = c.get("user")!;
  const targetUserId = c.req.param("userId");

  try {
    const { approved } = await c.req.json().catch(() => ({}));
    if (typeof approved !== "boolean") {
      return c.json({ error: "approved must be a boolean" }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE user_profiles SET is_approved = ? WHERE id = ?
    `).bind(approved ? 1 : 0, targetUserId).run();

    // Approving a user is meant to unlock the gated features for their
    // organization(s) — without this, LockedFeature's isApproved && features[key]
    // check stays false on every workspace they own until someone separately
    // visits WorkspaceDetail and flips each toggle by hand.
    if (approved) {
      const { results: owned } = await c.env.DB.prepare(`
        SELECT id FROM workspaces WHERE owner_id = ?
      `).bind(targetUserId).all<{ id: string }>();

      const grants = owned.flatMap((w) =>
        FEATURE_KEYS.map((featureKey) =>
          c.env.DB.prepare(`
            INSERT INTO workspace_features (id, workspace_id, feature_key, enabled, granted_by, granted_at, updated_at)
            VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
            ON CONFLICT(workspace_id, feature_key) DO UPDATE SET
              enabled = 1,
              granted_by = excluded.granted_by,
              granted_at = datetime('now'),
              updated_at = datetime('now')
          `).bind(crypto.randomUUID(), w.id, featureKey, admin.uid)
        )
      );
      if (grants.length > 0) {
        await c.env.DB.batch(grants);
      }
    }

    await logAdminAction(
      c.env.DB, admin.uid, approved ? "user_approve" : "user_unapprove",
      null, {}, admin.email, targetUserId
    );

    return c.json({ success: true, userId: targetUserId, isApproved: approved });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. GET /admin/audit-log — paginated, filterable audit trail
router.get("/admin/audit-log", async (c) => {
  try {
    const workspaceId = c.req.query("workspaceId") || null;
    const adminUserId = c.req.query("adminUserId") || null;
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(100, parseInt(c.req.query("limit") || "50") || 50);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const bindArgs: any[] = [];
    if (workspaceId) { conditions.push("al.target_workspace_id = ?"); bindArgs.push(workspaceId); }
    if (adminUserId) { conditions.push("al.admin_user_id = ?"); bindArgs.push(adminUserId); }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [{ results }, totalRow] = await Promise.all([
      c.env.DB.prepare(`
        SELECT al.*, tw.name as target_workspace_name, tu.email as target_user_email
        FROM admin_audit_log al
        LEFT JOIN workspaces tw ON tw.id = al.target_workspace_id
        LEFT JOIN user_profiles tu ON tu.id = al.target_user_id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...bindArgs, limit, offset).all<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM admin_audit_log al ${whereClause}
      `).bind(...bindArgs).first<{ count: number }>(),
    ]);

    const entries = results.map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminEmail: row.admin_email,
      action: row.action,
      targetWorkspaceId: row.target_workspace_id,
      targetWorkspaceName: row.target_workspace_name,
      targetUserId: row.target_user_id,
      targetUserEmail: row.target_user_email,
      details: JSON.parse(row.details || "{}"),
      createdAt: row.created_at,
    }));

    return c.json({ entries, total: totalRow?.count || 0, page });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
