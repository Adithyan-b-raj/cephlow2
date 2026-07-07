import { useState, useEffect, useCallback } from "react";
import { Loader2, ShieldOff, UserCheck } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface ApprovalUser {
  userId: string;
  email: string | null;
  isApproved: boolean;
}

export default function Approvals() {
  const { toast } = useToast();
  const [users, setUsers] = useState<ApprovalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved">("pending");

  const load = useCallback((status = statusFilter) => {
    setLoading(true);
    customFetch<{ users: ApprovalUser[] }>(`/api/admin/approvals?status=${status}`)
      .then((d) => setUsers(d.users ?? []))
      .catch((err: any) => {
        if (err?.status === 403) setUnauthorized(true);
        else toast({ title: "Failed to load approvals", description: err.message, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(statusFilter); }, [statusFilter]);

  const setApproved = async (userId: string, approved: boolean) => {
    try {
      await customFetch(`/api/admin/approvals/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ approved }),
      });
      toast({ title: approved ? "User approved" : "User unapproved" });
      load(statusFilter);
    } catch (err: any) {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    }
  };

  if (unauthorized) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="border-2 border-foreground p-8 flex flex-col items-center gap-4 text-center max-w-sm">
          <ShieldOff className="w-8 h-8" />
          <p className="text-sm font-black uppercase tracking-widest">Access Denied</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex border-2 border-foreground w-fit overflow-hidden">
        {(["pending", "approved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap
              ${statusFilter === s ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
          <UserCheck className="w-8 h-8 text-muted-foreground opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No {statusFilter} users</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.userId} className="border-2 border-border p-4 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs">{u.email ?? u.userId}</span>
              {u.isApproved ? (
                <Button size="sm" variant="outline" onClick={() => setApproved(u.userId, false)}>Unapprove</Button>
              ) : (
                <Button size="sm" onClick={() => setApproved(u.userId, true)}>Approve</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
