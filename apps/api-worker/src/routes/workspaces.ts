import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { isAdminOrOwner, isWorkspaceSuspended, type WorkspaceRole } from "../middleware/workspace.js";
import { sendEmail } from "../lib/email.js";

const router = new Hono<ContextEnv>();

const INVITE_EXPIRY_DAYS = 7;

async function getMembership(db: D1Database, workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const row = await db.prepare(`
    SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).bind(workspaceId, userId).first<{ role: string }>();
  return row ? (row.role as WorkspaceRole) : null;
}

// 1. List workspaces user belongs to
router.get("/workspaces", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT wm.role, w.id, w.name, w.owner_id, w.current_balance, w.created_at
      FROM workspace_members wm
      JOIN workspaces w ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
    `).bind(user.uid).all<any>();

    const workspaces = results.map(row => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      currentBalance: row.current_balance,
      createdAt: row.created_at,
      role: row.role,
    }));

    return c.json({ workspaces });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Create a workspace
router.post("/workspaces", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const { name } = await c.req.json().catch(() => ({}));
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return c.json({ error: "Name required" }, 400);

    const wsId = crypto.randomUUID();

    // D1 Batch transaction to create workspace and member
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO workspaces (id, name, owner_id, current_balance)
        VALUES (?, ?, ?, 0)
      `).bind(wsId, trimmedName, user.uid),
      c.env.DB.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (?, ?, 'owner')
      `).bind(wsId, user.uid),
    ]);

    const workspace = await c.env.DB.prepare(`
      SELECT * FROM workspaces WHERE id = ?
    `).bind(wsId).first<any>();

    return c.json({ workspace: { ...workspace, role: "owner" } }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Rename workspace
router.patch("/workspaces/:id", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role || !isAdminOrOwner(role)) return c.json({ error: "Forbidden" }, 403);
    if (await isWorkspaceSuspended(c.env.DB, id)) {
      return c.json({ error: "Workspace suspended", code: "WORKSPACE_SUSPENDED" }, 403);
    }

    const { name } = await c.req.json().catch(() => ({}));
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return c.json({ error: "Name required" }, 400);

    await c.env.DB.prepare(`
      UPDATE workspaces SET name = ? WHERE id = ?
    `).bind(trimmedName, id).run();

    const workspace = await c.env.DB.prepare(`
      SELECT * FROM workspaces WHERE id = ?
    `).bind(id).first<any>();

    return c.json({ workspace });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. List members
router.get("/workspaces/:id/members", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role) return c.json({ error: "Forbidden" }, 403);

    const { results: membersList } = await c.env.DB.prepare(`
      SELECT wm.user_id, wm.role, wm.joined_at, up.email
      FROM workspace_members wm
      LEFT JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = ?
    `).bind(id).all<any>();

    const members = membersList.map(m => ({
      userId: m.user_id,
      role: m.role,
      joinedAt: m.joined_at,
      email: m.email || null,
    }));

    return c.json({ members });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Remove member
router.delete("/workspaces/:id/members/:userId", authMiddleware, async (c) => {
  const actor = c.get("user")!;
  const id = c.req.param("id");
  const targetId = c.req.param("userId");
  try {
    const actorRole = await getMembership(c.env.DB, id, actor.uid);
    if (!actorRole || !isAdminOrOwner(actorRole)) return c.json({ error: "Forbidden" }, 403);
    if (await isWorkspaceSuspended(c.env.DB, id)) {
      return c.json({ error: "Workspace suspended", code: "WORKSPACE_SUSPENDED" }, 403);
    }

    const targetRole = await getMembership(c.env.DB, id, targetId);
    if (targetRole === "owner") return c.json({ error: "Cannot remove owner" }, 400);

    await c.env.DB.prepare(`
      DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `).bind(id, targetId).run();

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. Create invite
router.post("/workspaces/:id/invites", authMiddleware, async (c) => {
  const actor = c.get("user")!;
  const inviterEmail = actor.email;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, actor.uid);
    if (!role || !isAdminOrOwner(role)) return c.json({ error: "Forbidden" }, 403);
    if (await isWorkspaceSuspended(c.env.DB, id)) {
      return c.json({ error: "Workspace suspended", code: "WORKSPACE_SUSPENDED" }, 403);
    }

    const { email, role: inviteRoleRaw } = await c.req.json().catch(() => ({}));
    const inviteEmail = String(email || "").trim().toLowerCase();
    const inviteRole = inviteRoleRaw === "admin" ? "admin" : "member";
    if (!inviteEmail) return c.json({ error: "Email required" }, 400);

    const ws = await c.env.DB.prepare(`
      SELECT name FROM workspaces WHERE id = ?
    `).bind(id).first<{ name: string }>();

    // Generate url-safe base64 token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    let binary = "";
    for (let i = 0; i < tokenBytes.length; i++) {
      binary += String.fromCharCode(tokenBytes[i]);
    }
    const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const expiresAt = Date.now() + INVITE_EXPIRY_DAYS * 86400 * 1000;
    const inviteId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO workspace_invites (id, workspace_id, email, role, token, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(inviteId, id, inviteEmail, inviteRole, token, actor.uid, expiresAt).run();

    const appUrl = (c.env.FRONTEND_URL || c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");
    const link = `${appUrl}/invite?token=${encodeURIComponent(token)}`;
    const wsName = ws?.name || "a workspace";

    try {
      await sendEmail(c.env, {
        to: inviteEmail,
        subject: `Invitation to join ${wsName} on Cephlow`,
        body: `${inviterEmail || "An admin"} invited you to join "${wsName}" on Cephlow as ${inviteRole}.\n\nAccept here:\n${link}\n\nThis link expires in ${INVITE_EXPIRY_DAYS} days.`,
      });
    } catch (err: any) {
      console.error("Invite email send failed:", err?.message || err);
    }

    return c.json({
      invite: {
        id: inviteId,
        workspaceId: id,
        email: inviteEmail,
        role: inviteRole,
        token,
        invitedBy: actor.uid,
        expiresAt,
      },
      link,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. List pending invites
router.get("/workspaces/:id/invites", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role || !isAdminOrOwner(role)) return c.json({ error: "Forbidden" }, 403);

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM workspace_invites
      WHERE workspace_id = ? AND accepted_at IS NULL
      ORDER BY created_at DESC
    `).bind(id).all<any>();

    const invites = results.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      role: row.role,
      token: row.token,
      invitedBy: row.invited_by,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));

    return c.json({ invites });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. Revoke invite
router.delete("/workspaces/:id/invites/:inviteId", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const { id, inviteId } = c.req.param();
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role || !isAdminOrOwner(role)) return c.json({ error: "Forbidden" }, 403);

    await c.env.DB.prepare(`
      DELETE FROM workspace_invites WHERE id = ? AND workspace_id = ?
    `).bind(inviteId, id).run();

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. Pending invites for the current user's email
router.get("/me/invites", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const userEmail = (user.email || "").toLowerCase();
  if (!userEmail) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { results } = await c.env.DB.prepare(`
      SELECT vi.id, vi.token, vi.role, vi.expires_at, w.id as ws_id, w.name as ws_name
      FROM workspace_invites vi
      JOIN workspaces w ON vi.workspace_id = w.id
      WHERE vi.email = ? AND vi.accepted_at IS NULL AND vi.expires_at > ?
    `).bind(userEmail, Date.now()).all<any>();

    const invites = results.map(row => ({
      id: row.id,
      token: row.token,
      role: row.role,
      expiresAt: row.expires_at,
      workspace: {
        id: row.ws_id,
        name: row.ws_name,
      },
    }));

    return c.json({ invites });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 10. Accept invite (unscoped)
router.post("/invites/accept", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const userEmail = (user.email || "").toLowerCase();
  if (!userEmail) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { token } = await c.req.json().catch(() => ({}));
    if (!token) return c.json({ error: "Token required" }, 400);

    const invite = await c.env.DB.prepare(`
      SELECT * FROM workspace_invites WHERE token = ?
    `).bind(token).first<any>();

    if (!invite) return c.json({ error: "Invite not found" }, 404);
    if (invite.accepted_at) return c.json({ error: "Invite already accepted" }, 400);
    if (invite.expires_at < Date.now()) return c.json({ error: "Invite expired" }, 400);
    if (invite.email.toLowerCase() !== userEmail) return c.json({ error: "Invite email mismatch" }, 403);

    // Accept invite atomically in batch
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role
      `).bind(invite.workspace_id, user.uid, invite.role),
      c.env.DB.prepare(`
        UPDATE workspace_invites SET accepted_at = datetime('now') WHERE id = ?
      `).bind(invite.id),
    ]);

    const ws = await c.env.DB.prepare(`
      SELECT * FROM workspaces WHERE id = ?
    `).bind(invite.workspace_id).first<any>();

    return c.json({ workspace: ws ? { ...ws, role: invite.role } : null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 11. Brand kit get
router.get("/workspaces/:id/brand", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role) return c.json({ error: "Forbidden" }, 403);

    const brand = await c.env.DB.prepare(`
      SELECT * FROM workspace_brands WHERE workspace_id = ?
    `).bind(id).first<any>();

    return c.json({ brand: brand || null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 12. Brand kit upsert
router.put("/workspaces/:id/brand", authMiddleware, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  try {
    const role = await getMembership(c.env.DB, id, user.uid);
    if (!role || !isAdminOrOwner(role)) return c.json({ error: "Forbidden" }, 403);
    if (await isWorkspaceSuspended(c.env.DB, id)) {
      return c.json({ error: "Workspace suspended", code: "WORKSPACE_SUSPENDED" }, 403);
    }

    const { logoUrl, primaryColor, secondaryColor, fontFamily } = await c.req.json().catch(() => ({}));

    await c.env.DB.prepare(`
      INSERT INTO workspace_brands (workspace_id, logo_url, primary_color, secondary_color, font_family, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(workspace_id) DO UPDATE SET
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        font_family = excluded.font_family,
        updated_at = datetime('now')
    `).bind(id, logoUrl ?? null, primaryColor ?? null, secondaryColor ?? null, fontFamily ?? null).run();

    const brand = await c.env.DB.prepare(`
      SELECT * FROM workspace_brands WHERE workspace_id = ?
    `).bind(id).first<any>();

    return c.json({ brand });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
