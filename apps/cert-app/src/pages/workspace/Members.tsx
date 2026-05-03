import { useState, useEffect, useCallback } from "react";
import { Trash2, Mail, UserPlus, Clock, X } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface Member {
  userId: string;
  email: string | null;
  role: string;
  joinedAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const { activeWorkspace } = (window as any).__workspaceCtx__ || {};
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${res.status}`);
  }
  return res.json();
}

export default function WorkspaceMembers() {
  const { activeWorkspace, role, reload: reloadWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);

  const workspaceId = activeWorkspace?.id;
  const isAdmin = role === "owner" || role === "admin";

  async function fetchWithWorkspaceHeader(path: string, opts: RequestInit = {}) {
    return apiFetch(path, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
      },
    });
  }

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingData(true);
    try {
      const [membersData, invitesData] = await Promise.all([
        fetchWithWorkspaceHeader(`/workspaces/${workspaceId}/members`),
        isAdmin ? fetchWithWorkspaceHeader(`/workspaces/${workspaceId}/invites`) : Promise.resolve({ invites: [] }),
      ]);
      setMembers(membersData.members || []);
      setInvites(invitesData.invites || []);
    } catch (err: any) {
      toast({ title: "Failed to load members", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [workspaceId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !workspaceId) return;
    setSending(true);
    try {
      await fetchWithWorkspaceHeader(`/workspaces/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      toast({ title: "Invite sent", description: `Invite sent to ${email}` });
      setInviteEmail("");
      await load();
    } catch (err: any) {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function removeMember(userId: string) {
    if (!workspaceId) return;
    try {
      await fetchWithWorkspaceHeader(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
      await load();
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!workspaceId) return;
    try {
      await fetchWithWorkspaceHeader(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: "DELETE" });
      await load();
      toast({ title: "Invite revoked" });
    } catch (err: any) {
      toast({ title: "Failed to revoke", description: err.message, variant: "destructive" });
    }
  }

  if (!activeWorkspace) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-black uppercase tracking-widest">Members</h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{activeWorkspace.name}</p>
      </div>

      {isAdmin && (
        <form onSubmit={handleInvite} className="border border-border p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5" /> Invite member
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              required
              className="flex-1 text-xs px-3 py-2 border border-border bg-transparent outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="text-xs px-2 py-2 border border-border bg-background outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-foreground bg-foreground text-background hover:opacity-90 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Invite"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </p>
        {loadingData ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : (
          members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 border border-border px-4 py-3">
              <div className="w-7 h-7 bg-foreground text-background flex items-center justify-center text-[10px] font-black shrink-0">
                {(m.email?.[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{m.email || m.userId}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.role}</p>
              </div>
              {isAdmin && m.role !== "owner" && (
                <button
                  onClick={() => removeMember(m.userId)}
                  className="p-1.5 text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive transition-colors"
                  title="Remove member"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {isAdmin && invites.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Pending invites
          </p>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 border border-dashed border-border px-4 py-3">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{inv.email}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => revokeInvite(inv.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive border border-transparent hover:border-destructive transition-colors"
                title="Revoke invite"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
