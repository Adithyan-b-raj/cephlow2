import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquareWarning } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/use-workspace";

interface Report {
  id: number;
  phone: string;
  cert_key?: string;
  message: string;
  created_at: string;
}

function maskPhone(phone: string) {
  if (!phone || phone.length <= 4) return "****";
  return `****${phone.slice(-4)}`;
}

async function fetchReports(workspaceId: string): Promise<Report[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/reports`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-workspace-id": workspaceId,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${res.status}`);
  }
  return res.json();
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const seenReportIdsRef = useRef<Set<number>>(new Set());
  const initialLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!activeWorkspace) return;

    let cancelled = false;

    const loadReports = (isInitial = false) => {
      fetchReports(activeWorkspace.id)
        .then((data) => {
          if (cancelled) return;
          setReports(data);
          setError(null);

          const seen = seenReportIdsRef.current;
          const newOnes: Report[] = [];
          for (const r of data) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              if (initialLoadedRef.current) newOnes.push(r);
            }
          }

          if (!initialLoadedRef.current) {
            initialLoadedRef.current = true;
          } else if (newOnes.length > 0) {
            if (newOnes.length === 1) {
              const r = newOnes[0];
              const certName = r.cert_key ? (r.cert_key.split("/").pop() || r.cert_key) : undefined;
              toast({
                title: "New issue reported",
                description: certName ? `${certName}: "${r.message}"` : r.message,
              });
            } else {
              toast({
                title: `${newOnes.length} new issue reports`,
                description: "Recipients reported issues via WhatsApp.",
              });
            }
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (isInitial) setError("Failed to load reports.");
        })
        .finally(() => {
          if (cancelled) return;
          if (isInitial) setLoading(false);
        });
    };

    loadReports(true);
    const intervalId = window.setInterval(() => loadReports(false), 15000);
    const onFocus = () => loadReports(false);
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadReports(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeWorkspace, toast]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b-2 border-foreground pb-4">
        <div className="bg-foreground text-background p-2">
          <MessageSquareWarning className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-black uppercase tracking-widest">Issue Reports</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Submitted via WhatsApp</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest">Loading...</span>
        </div>
      )}

      {error && (
        <div className="border-2 border-foreground p-4 text-xs font-bold uppercase tracking-widest text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="border-2 border-foreground p-8 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
          No reports yet.
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="border-2 border-foreground divide-y-2 divide-foreground">
          {reports.map((r) => (
            <div key={r.id} className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs font-bold">{maskPhone(r.phone)}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {format(new Date(r.created_at), "MMM d, yyyy · HH:mm")}
                </span>
              </div>
              {r.cert_key && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {r.cert_key.split("/").pop()}
                </p>
              )}
              <p className="text-sm">{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
