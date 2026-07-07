import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, ShieldOff, ScrollText } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface AuditEntry {
  id: string;
  adminEmail: string | null;
  adminUserId: string;
  action: string;
  targetWorkspaceId: string | null;
  targetWorkspaceName: string | null;
  targetUserId: string | null;
  targetUserEmail: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export default function AuditLog() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback((p = 1) => {
    setLoading(true);
    customFetch<{ entries: AuditEntry[]; total: number }>(`/api/admin/audit-log?page=${p}&limit=${limit}`)
      .then((d) => { setEntries(d.entries ?? []); setTotal(d.total ?? 0); setPage(p); })
      .catch((err: any) => {
        if (err?.status === 403) setUnauthorized(true);
        else toast({ title: "Failed to load audit log", description: err.message, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / limit);

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
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
          <ScrollText className="w-8 h-8 text-muted-foreground opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No audit entries yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="border-2 border-border p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="text-[9px] font-black px-1.5 py-0.5 border border-foreground uppercase tracking-widest">
                  {e.action.replace(/_/g, " ")}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("en-IN", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">by {e.adminEmail ?? e.adminUserId}</p>
              {(e.targetWorkspaceId || e.targetUserId) && (
                <p className="text-xs text-muted-foreground">
                  on {e.targetWorkspaceId && (e.targetWorkspaceName ?? e.targetWorkspaceId)}
                  {e.targetWorkspaceId && e.targetUserId && " / "}
                  {e.targetUserId && (e.targetUserEmail ?? e.targetUserId)}
                </p>
              )}
              {Object.keys(e.details).length > 0 && (
                <pre className="text-[10px] text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button disabled={page === 1} onClick={() => load(page - 1)} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-muted-foreground">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => load(page + 1)} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
