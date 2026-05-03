import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "@workspace/supabase";

export type WorkspaceRole = "owner" | "admin" | "member";

declare global {
  namespace Express {
    interface Request {
      workspace?: {
        id: string;
        role: WorkspaceRole;
      };
    }
  }
}

export async function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const headerVal = req.header("x-workspace-id");
  const queryVal = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const workspaceId = headerVal || queryVal;

  if (!workspaceId) {
    return res.status(400).json({ error: "Missing workspace context" });
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(403).json({ error: "Not a member of this workspace" });

  req.workspace = { id: workspaceId, role: data.role as WorkspaceRole };
  next();
  return;
}

export function isAdminOrOwner(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
