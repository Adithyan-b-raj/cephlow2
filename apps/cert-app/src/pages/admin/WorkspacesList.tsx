import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw, Building2, ShieldOff, Search } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface WorkspaceRow {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  currentBalance: number;
  suspended: boolean;
  batchCount: number;
  createdAt: string;
}

export default function WorkspacesList() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const load = useCallback((p = 1, q = query) => {
    setLoading(true);
    customFetch<{ workspaces: WorkspaceRow[]; total: number }>(
      `/api/admin/workspaces?q=${encodeURIComponent(q)}&page=${p}&limit=${limit}`
    )
      .then((d) => { setWorkspaces(d.workspaces ?? []); setTotal(d.total ?? 0); setPage(p); })
      .catch((err: any) => {
        if (err?.status === 403) {
          setUnauthorized(true);
        } else {
          toast({ title: "Failed to load workspaces", description: err.message, variant: "destructive" });
        }
      })
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { load(1, query); }, []);

  const totalPages = Math.ceil(total / limit);

  if (unauthorized) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="border-2 border-foreground p-8 flex flex-col items-center gap-4 text-center max-w-sm">
          <ShieldOff className="w-8 h-8" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest">Access Denied</p>
            <p className="text-[10px] text-muted-foreground mt-1">You must be a platform admin to view this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 border-2 border-border px-2 py-1.5 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-xs outline-none"
            placeholder="Search by workspace name or owner email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(1, query); }}
          />
        </div>
        <button onClick={() => load(page)} className="p-2 text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
          <Building2 className="w-8 h-8 text-muted-foreground opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No workspaces found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => setLocation(`/admin/workspaces/${w.id}`)}
              className="w-full text-left border-2 border-border hover:border-foreground transition-colors p-4 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black truncate">{w.name}</span>
                  {w.suspended && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 border border-red-500 text-red-500">SUSPENDED</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{w.ownerEmail ?? w.ownerId}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-right">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Balance</p>
                  <p className="text-xs font-bold">{w.currentBalance}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Batches</p>
                  <p className="text-xs font-bold">{w.batchCount}</p>
                </div>
              </div>
            </button>
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
