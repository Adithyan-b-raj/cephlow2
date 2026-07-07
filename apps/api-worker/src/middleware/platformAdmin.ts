import type { MiddlewareHandler } from "hono";
import { isPlatformAdmin } from "../lib/platformAdmin.js";

/**
 * Hono middleware that restricts a route to platform admins (cephlow team),
 * distinct from workspace-scoped owner/admin roles. Must run AFTER
 * authMiddleware so c.get("user") is populated. Does not require
 * workspaceMiddleware — admin routes act across workspaces, with the target
 * workspace id (if any) coming from the URL path.
 */
export const requirePlatformAdmin: MiddlewareHandler<ContextEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const ok = await isPlatformAdmin(c.env.DB, user.uid);
    if (!ok) {
      return c.json({ error: "Forbidden", code: "PLATFORM_ADMIN_REQUIRED" }, 403);
    }
    return await next();
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};
