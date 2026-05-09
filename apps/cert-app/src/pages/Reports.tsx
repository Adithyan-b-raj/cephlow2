import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquareWarning } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

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

async function getMyR2Urls(): Promise<Set<string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Set();

  // Get all batches the current user created
  const { data: batches } = await supabase
    .from("batches")
    .select("id")
    .eq("user_id", session.user.id);

  if (!batches || batches.length === 0) return new Set();

  const batchIds = batches.map((b: { id: string }) => b.id);

  // Get all r2_pdf_urls for those batches' certificates
  const { data: certs } = await supabase
    .from("certificates")
    .select("r2_pdf_url")
    .in("batch_id", batchIds)
    .not("r2_pdf_url", "is", null);

  return new Set((certs || []).map((c: { r2_pdf_url: string }) => c.r2_pdf_url));
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const seenReportIdsRef = useRef<Set<number>>(new Set());
  const initialLoadedRef = useRef<boolean>(false);
  const myR2UrlsRef = useRef<Set<string> | null>(null);

  const workerUrl = import.meta.env.VITE_WA_WORKER_URL;
  const token = import.meta.env.VITE_WA_ANALYTICS_TOKEN;

  useEffect(() => {
    if (!workerUrl || !token) {
      setError("Reports not configured.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const url = `${workerUrl.replace(/\/$/, "")}/reports?token=${token}`;

    const loadReports = async (isInitial = false) => {
      try {
        // Load the user's own R2 URLs once and cache them
        if (!myR2UrlsRef.current) {
          myR2UrlsRef.current = await getMyR2Urls();
        }
        const myUrls = myR2UrlsRef.current;

        const res = await fetch(url);
        const allReports: Report[] = await res.json();
        if (cancelled) return;

        // Only show reports for certificates this user generated
        const filtered = allReports.filter((r) => {
          if (!r.cert_key) return false;
          for (const u of myUrls) {
            if (u.endsWith(r.cert_key)) return true;
          }
          return false;
        });

        setReports(filtered);
        setError(null);

        const seen = seenReportIdsRef.current;
        const newOnes: Report[] = [];
        for (const r of filtered) {
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
      } catch {
        if (cancelled) return;
        if (isInitial) setError("Failed to load reports.");
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
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
  }, [workerUrl, token, toast]);

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
