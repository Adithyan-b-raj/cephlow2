import { Router, type IRouter } from "express";
import crypto from "crypto";
import { supabaseAdmin, toCamel } from "@workspace/supabase";
import { isAdminOrOwner, type WorkspaceRole } from "../middlewares/requireWorkspace.js";
import { sendEmail } from "../lib/gmail.js";

const router: IRouter = Router();

const INVITE_EXPIRY_DAYS = 7;

async function getMembership(workspaceId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? (data.role as WorkspaceRole) : null;
}

// List workspaces the user belongs to
router.get("/workspaces", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role, workspaces(id, name, owner_id, current_balance, created_at)")
    .eq("user_id", userId);

  if (error) return res.status(500).json({ error: error.message });

  const workspaces = (data || [])
    .filter((row: any) => row.workspaces)
    .map((row: any) => ({ ...toCamel(row.workspaces), role: row.role }));

  return res.json({ workspaces });
});

// Create a workspace
router.post("/workspaces", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .insert({ name, owner_id: userId, current_balance: 0 })
    .select("*")
    .single();
  if (wsErr) return res.status(500).json({ error: wsErr.message });

  const { error: memErr } = await supabaseAdmin
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (memErr) {
    await supabaseAdmin.from("workspaces").delete().eq("id", ws.id);
    return res.status(500).json({ error: memErr.message });
  }

  return res.status(201).json({ workspace: { ...toCamel(ws), role: "owner" } });
});

// Rename
router.patch("/workspaces/:id", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role || !isAdminOrOwner(role)) return res.status(403).json({ error: "Forbidden" });

  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ workspace: toCamel(data) });
});

// List members
router.get("/workspaces/:id/members", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id, role, joined_at")
    .eq("workspace_id", id);
  if (error) return res.status(500).json({ error: error.message });

  const userIds = (data || []).map((m: any) => m.user_id);
  const { data: profiles } = await supabaseAdmin
    .from("user_profiles")
    .select("id, email")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const emailById = new Map((profiles || []).map((p: any) => [p.id, p.email]));

  const members = (data || []).map((m: any) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    email: emailById.get(m.user_id) || null,
  }));
  return res.json({ members });
});

// Remove member
router.delete("/workspaces/:id/members/:userId", async (req, res) => {
  const actorId = req.user?.uid;
  if (!actorId) return res.status(401).json({ error: "Unauthorized" });
  const { id, userId: targetId } = req.params;
  const actorRole = await getMembership(id, actorId);
  if (!actorRole || !isAdminOrOwner(actorRole)) return res.status(403).json({ error: "Forbidden" });

  const targetRole = await getMembership(id, targetId);
  if (targetRole === "owner") return res.status(400).json({ error: "Cannot remove owner" });

  const { error } = await supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", id)
    .eq("user_id", targetId);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// Create invite
router.post("/workspaces/:id/invites", async (req, res) => {
  const userId = req.user?.uid;
  const inviterEmail = req.user?.email;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role || !isAdminOrOwner(role)) return res.status(403).json({ error: "Forbidden" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  const inviteRole = req.body?.role === "admin" ? "admin" : "member";
  if (!email) return res.status(400).json({ error: "Email required" });

  const { data: ws } = await supabaseAdmin
    .from("workspaces").select("name").eq("id", id).single();

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 86400 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("workspace_invites")
    .insert({
      workspace_id: id,
      email,
      role: inviteRole,
      token,
      invited_by: userId,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || process.env.VITE_APP_URL || "").replace(/\/$/, "");
  const link = `${appUrl}/invite?token=${encodeURIComponent(token)}`;
  const wsName = ws?.name || "a workspace";
  try {
    await sendEmail(userId, {
      to: email,
      subject: `Invitation to join ${wsName} on Cephlow`,
      body: `${inviterEmail || "An admin"} invited you to join "${wsName}" on Cephlow as ${inviteRole}.\n\nAccept here:\n${link}\n\nThis link expires in ${INVITE_EXPIRY_DAYS} days.`,
    });
  } catch (err: any) {
    // Don't fail the invite creation if email send fails — admin can copy the link.
    console.error("Invite email send failed:", err?.message || err);
  }

  return res.status(201).json({ invite: toCamel(data), link });
});

// List pending invites
router.get("/workspaces/:id/invites", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role || !isAdminOrOwner(role)) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("workspace_invites")
    .select("*")
    .eq("workspace_id", id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ invites: (data || []).map(toCamel) });
});

// Revoke invite
router.delete("/workspaces/:id/invites/:inviteId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { id, inviteId } = req.params;
  const role = await getMembership(id, userId);
  if (!role || !isAdminOrOwner(role)) return res.status(403).json({ error: "Forbidden" });

  const { error } = await supabaseAdmin
    .from("workspace_invites")
    .delete()
    .eq("id", inviteId)
    .eq("workspace_id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// Pending invites for the current user's email
router.get("/me/invites", async (req, res) => {
  const userEmail = (req.user?.email || "").toLowerCase();
  if (!userEmail) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, token, role, expires_at, workspaces(id, name)")
    .eq("email", userEmail)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ invites: (data || []).map(toCamel) });
});

// Accept invite — must NOT require workspace context
router.post("/invites/accept", async (req, res) => {
  const userId = req.user?.uid;
  const userEmail = (req.user?.email || "").toLowerCase();
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const token = String(req.body?.token || "");
  if (!token) return res.status(400).json({ error: "Token required" });

  const { data: invite, error: invErr } = await supabaseAdmin
    .from("workspace_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.accepted_at) return res.status(400).json({ error: "Invite already accepted" });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "Invite expired" });
  }
  if (invite.email.toLowerCase() !== userEmail) {
    return res.status(403).json({ error: "Invite email mismatch" });
  }

  const { error: memErr } = await supabaseAdmin
    .from("workspace_members")
    .upsert({
      workspace_id: invite.workspace_id,
      user_id: userId,
      role: invite.role,
    }, { onConflict: "workspace_id,user_id" });
  if (memErr) return res.status(500).json({ error: memErr.message });

  await supabaseAdmin
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("*")
    .eq("id", invite.workspace_id)
    .single();

  return res.json({ workspace: ws ? { ...toCamel(ws), role: invite.role } : null });
});

// Brand kit get
router.get("/workspaces/:id/brand", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role) return res.status(403).json({ error: "Forbidden" });

  const { data, error } = await supabaseAdmin
    .from("workspace_brands")
    .select("*")
    .eq("workspace_id", id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ brand: data ? toCamel(data) : null });
});

// Brand kit upsert
router.put("/workspaces/:id/brand", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = req.params.id;
  const role = await getMembership(id, userId);
  if (!role || !isAdminOrOwner(role)) return res.status(403).json({ error: "Forbidden" });

  const { logoUrl, primaryColor, secondaryColor, fontFamily } = req.body || {};

  const { data, error } = await supabaseAdmin
    .from("workspace_brands")
    .upsert({
      workspace_id: id,
      logo_url: logoUrl ?? null,
      primary_color: primaryColor ?? null,
      secondary_color: secondaryColor ?? null,
      font_family: fontFamily ?? null,
    }, { onConflict: "workspace_id" })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ brand: toCamel(data) });
});

export default router;
