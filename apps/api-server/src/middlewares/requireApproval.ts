import type { Request, Response, NextFunction } from "express";
import { isApprovedInContext } from "../lib/approval.js";

/**
 * Express middleware that enforces the "approved organization" tier on a
 * route. Must run AFTER `requireAuth` so `req.user.uid` is populated.
 *
 * A user passes if they are personally approved OR if their active workspace
 * is owned by an approved organization.
 */
export async function requireApproval(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const workspaceId = req.workspace?.id ?? null;
    const ok = await isApprovedInContext(userId, workspaceId);
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
