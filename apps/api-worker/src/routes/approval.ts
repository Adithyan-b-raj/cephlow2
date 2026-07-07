import { Hono } from "hono";
import { ensureUserProfile, isApprovedInContext, getWorkspaceFeatures } from "../lib/approval.js";
import { authMiddleware } from "../middleware/auth.js";

const router = new Hono<ContextEnv>();

// Returns the current user's approval state.
router.get("/me/approval", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const email = user.email ?? null;
  const workspaceId = c.req.header("x-workspace-id") || c.req.query("workspaceId") || null;

  try {
    await ensureUserProfile(c.env.DB, user.uid, email);
    const approved = await isApprovedInContext(c.env.DB, user.uid, workspaceId);
    return c.json({ isApproved: approved, userId: user.uid, email });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Returns the active workspace's per-feature access flags.
router.get("/me/features", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workspaceId = c.req.header("x-workspace-id") || c.req.query("workspaceId") || null;
  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  try {
    const member = await c.env.DB.prepare(`
      SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `).bind(workspaceId, user.uid).first();
    if (!member) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    const features = await getWorkspaceFeatures(c.env.DB, workspaceId);
    return c.json({ features });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
