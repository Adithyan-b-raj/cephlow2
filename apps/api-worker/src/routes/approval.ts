import { Hono } from "hono";
import { ensureUserProfile, isApprovedInContext } from "../lib/approval.js";
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

export default router;
