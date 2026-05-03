import { Router, type IRouter } from "express";
import { ensureUserProfile, isUserApproved } from "../lib/approval.js";

const router: IRouter = Router();

// Returns the current user's approval state. Auto-creates a profile row
// on first call so unapproved users get a stable record we can later flip.
router.get("/me/approval", async (req, res) => {
  const userId = req.user?.uid;
  const email = req.user?.email ?? null;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    await ensureUserProfile(userId, email);
    const approved = await isUserApproved(userId);
    return res.json({ isApproved: approved, userId, email });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
