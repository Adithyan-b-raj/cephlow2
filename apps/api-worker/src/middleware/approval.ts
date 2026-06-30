import type { MiddlewareHandler } from "hono";
import { isApprovedInContext } from "../lib/approval.js";

/**
 * Hono middleware that enforces the "approved organization" tier on a route.
 * Must run AFTER authMiddleware so c.get("user") is populated.
 */
export const requireApproval: MiddlewareHandler<ContextEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const workspace = c.get("workspace");
    const workspaceId = workspace?.id ?? null;
    const ok = await isApprovedInContext(c.env.DB, user.uid, workspaceId);
    
    if (!ok) {
      return c.json({
        error: "Organization approval required to use this feature.",
        code: "APPROVAL_REQUIRED",
      }, 403);
    }
    
    return await next();
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};
