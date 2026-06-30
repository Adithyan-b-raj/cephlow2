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
      SELECT role FROM workspace_members 
      WHERE workspace_id = ? AND user_id = ?
    `).bind(workspaceId, user.uid).first<{ role: string }>();

    if (!member) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    c.set("workspace", {
      id: workspaceId,
      role: member.role as WorkspaceRole,
    });

    return await next();
  } catch (err: any) {
    console.error("Workspace middleware error:", err.message);
    return c.json({ error: err.message }, 500);
  }
};
