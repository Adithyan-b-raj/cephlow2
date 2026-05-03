import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/use-workspace";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PendingInvite {
  id: string;
  token: string;
  role: string;
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

async function acceptInvite(inviteToken: string): Promise<{ workspaceId?: string; workspaceName?: string; error?: string }> {
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
  if (!res.ok) return { error: data.error || "Failed to accept" };
  return { workspaceId: data.workspace?.id, workspaceName: data.workspace?.name };
}

export function PendingInviteBanner() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { reload, switchTo } = useWorkspace();

  useEffect(() => {
    fetchPendingInvites().then(setInvites);
  }, []);

  if (invites.length === 0) return null;

  async function handleAccept(invite: PendingInvite) {
    setAccepting(invite.id);
    const result = await acceptInvite(invite.token);
    if (result.error) {
      alert(result.error);
      setAccepting(null);
      return;
    }
    await reload();
    if (result.workspaceId) switchTo(result.workspaceId);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    setAccepting(null);
    navigate("/");
  }

  return (
    <div className="flex flex-col gap-2 mb-6">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center gap-3 border-2 border-foreground bg-background px-4 py-3"
        >
          <Mail className="w-4 h-4 shrink-0" />
          <p className="text-xs font-bold uppercase tracking-widest flex-1">
            You're invited to join{" "}
            <span className="underline">{invite.workspaces?.name ?? "a workspace"}</span>{" "}
            as {invite.role}
          </p>
          <Button
            size="sm"
            disabled={accepting === invite.id}
            onClick={() => handleAccept(invite)}
          >
            {accepting === invite.id ? "Accepting…" : "Accept"}
          </Button>
        </div>
      ))}
    </div>
  );
}
