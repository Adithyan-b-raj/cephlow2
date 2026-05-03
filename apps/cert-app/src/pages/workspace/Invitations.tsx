import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/use-workspace";
import { Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PendingInvite {
  id: string;
  token: string;
  role: string;
  expiresAt: string;
  workspaces: { id: string; name: string } | null;
}

async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return [];
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/me/invites`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const j = await res.json();
  return j.invites || [];
}

async function acceptInvite(inviteToken: string) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/invites/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ token: inviteToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to accept");
  return data;
}

export default function Invitations() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [, navigate] = useLocation();
  const { reload, switchTo } = useWorkspace();

  useEffect(() => {
    fetchPendingInvites()
      .then(setInvites)
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept(invite: PendingInvite) {
    setAccepting(invite.id);
    try {
      const result = await acceptInvite(invite.token);
      await reload();
      if (result.workspace?.id) switchTo(result.workspace.id);
      setAccepted((prev) => [...prev, invite.id]);
      setTimeout(() => navigate("/"), 1500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-black tracking-tight uppercase">Invitations</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-wide">
          Pending workspace invitations sent to your email.
        </p>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Loading…</p>
      )}

      {!loading && invites.length === 0 && (
        <div className="border-2 border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <Mail className="w-8 h-8 text-muted-foreground" />
          <p className="text-xs font-bold uppercase tracking-widest">No pending invitations</p>
          <p className="text-xs text-muted-foreground">
            When someone invites you to a workspace, it will appear here.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {invites.map((invite) => {
          const isAccepted = accepted.includes(invite.id);
          return (
            <div
              key={invite.id}
              className="flex items-center gap-4 border-2 border-foreground bg-background px-5 py-4"
            >
              <Mail className="w-5 h-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest">
                  {invite.workspaces?.name ?? "Unknown workspace"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Role: {invite.role} &nbsp;·&nbsp; Expires:{" "}
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              {isAccepted ? (
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-green-600">
                  <CheckCircle className="w-4 h-4" /> Accepted
                </span>
              ) : (
                <Button
                  size="sm"
                  disabled={accepting === invite.id}
                  onClick={() => handleAccept(invite)}
                >
                  {accepting === invite.id ? "Accepting…" : "Accept"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
