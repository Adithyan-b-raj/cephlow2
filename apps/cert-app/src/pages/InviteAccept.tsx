import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Loader } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export default function InviteAccept() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { switchTo, reload } = useWorkspace();
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("");

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Preserve token across login redirect
      sessionStorage.setItem("pendingInviteToken", token || "");
      navigate("/login");
      return;
    }

    const tokenToUse = token || sessionStorage.getItem("pendingInviteToken") || "";
    sessionStorage.removeItem("pendingInviteToken");

    if (!tokenToUse) {
      setStatus("error");
      setMessage("No invite token found.");
      return;
    }

    async function accept() {
      try {
        const { data: session } = await supabase.auth.getSession();
        const authToken = session.session?.access_token;
        const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
        const res = await fetch(`${base}/api/invites/accept`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ token: tokenToUse }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `${res.status}`);

        if (data.workspace) {
          await reload();
          switchTo(data.workspace.id);
        }
        setStatus("success");
        setMessage(`You've joined "${data.workspace?.name || "the workspace"}" as ${data.workspace?.role}.`);
        setTimeout(() => navigate("/"), 2000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "Failed to accept invite.");
      }
    }

    accept();
  }, [authLoading, user, token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      {status === "pending" && (
        <>
          <Loader className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Accepting invite…</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="w-10 h-10 text-green-600" />
          <div className="text-center space-y-1">
            <p className="text-sm font-bold">Invite accepted!</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Redirecting…</p>
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="w-10 h-10 text-destructive" />
          <div className="text-center space-y-1">
            <p className="text-sm font-bold">Invite failed</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
            >
              Go to dashboard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
