import type { Request, Response, NextFunction } from "express";
import { isUserApproved } from "../lib/approval.js";

/**
 * Express middleware that enforces the "approved organization" tier on a
 * route. Must run AFTER `requireAuth` so `req.user.uid` is populated.
 *
 * Returns HTTP 403 with `{ error, code: "APPROVAL_REQUIRED" }` if the
 * caller is not yet approved, so the frontend can show a friendly modal.
 */
export async function requireApproval(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const ok = await isUserApproved(userId);
    if (!ok) {
      return res.status(403).json({
        error: "Organization approval required to use this feature.",
        code: "APPROVAL_REQUIRED",
      });
    }
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
