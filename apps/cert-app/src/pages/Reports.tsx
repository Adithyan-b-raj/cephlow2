import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquareWarning } from "lucide-react";

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

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const workerUrl = import.meta.env.VITE_WA_WORKER_URL;
  const token = import.meta.env.VITE_WA_ANALYTICS_TOKEN;

  useEffect(() => {
    if (!workerUrl || !token) {
      setError("VITE_WA_WORKER_URL or VITE_WA_ANALYTICS_TOKEN not set.");
      setLoading(false);
      return;
    }
    fetch(`${workerUrl.replace(/\/$/, '')}/reports?token=${token}`)
      .then(r => r.json())
      .then((data: Report[]) => setReports(data))
      .catch(() => setError("Failed to load reports."))
      .finally(() => setLoading(false));
  }, [workerUrl, token]);

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
          {reports.map(r => (
            <div key={r.id} className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-xs font-bold">{maskPhone(r.phone)}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {format(new Date(r.created_at), "MMM d, yyyy · HH:mm")}
                </span>
              </div>
              {r.cert_key && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {r.cert_key.split('/').pop()}
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
