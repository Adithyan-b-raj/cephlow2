import type { MiddlewareHandler } from "hono";

export type WorkspaceRole = "owner" | "admin" | "member";

export function isAdminOrOwner(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export const workspaceMiddleware: MiddlewareHandler<ContextEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const headerVal = c.req.header("x-workspace-id");
  const queryVal = c.req.query("workspaceId");
  const workspaceId = headerVal || queryVal;

  if (!workspaceId) {
    return c.json({ error: "Missing workspace context" }, 400);
  }

  try {
    const member = await c.env.DB.prepare(`
      SELECT m.role, w.suspended
      FROM workspace_members m
      JOIN workspaces w ON m.workspace_id = w.id
      WHERE m.workspace_id = ? AND m.user_id = ?
    `).bind(workspaceId, user.uid).first<{ role: string; suspended: number }>();

    if (!member) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    c.set("workspace", {
      id: workspaceId,
      role: member.role as WorkspaceRole,
      suspended: Boolean(member.suspended),
    });

    return await next();
  } catch (err: any) {
    console.error("Workspace middleware error:", err.message);
    return c.json({ error: err.message }, 500);
  }
};

export async function isWorkspaceSuspended(db: D1Database, workspaceId: string): Promise<boolean> {
  const ws = await db.prepare(`SELECT suspended FROM workspaces WHERE id = ?`).bind(workspaceId).first<{ suspended: number }>();
  return Boolean(ws?.suspended);
}

/**
 * Blocks usage of paid features on a suspended workspace. Deliberately
 * separate from workspaceMiddleware (which only resolves membership) and
 * NOT applied to /api/payments/* — a suspended workspace must still be able
 * to complete an already-charged payment, otherwise money paid to Cashfree
 * before suspension can get stuck uncredited.
 */
export const requireNotSuspended: MiddlewareHandler<ContextEnv> = async (c, next) => {
  const workspace = c.get("workspace");
  if (!workspace) {
    return c.json({ error: "Missing workspace context" }, 400);
  }
  if (workspace.suspended) {
    return c.json({ error: "Workspace suspended", code: "WORKSPACE_SUSPENDED" }, 403);
  }
  return await next();
};
