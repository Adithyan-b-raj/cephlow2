import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { ReportDetail } from "../components/BatchIssueReportDialog";

export function useWaReports(batch: any) {
  const { toast } = useToast();
  const [reportsByCertKey, setReportsByCertKey] = useState<Map<string, ReportDetail>>(new Map());
  const seenReportKeysRef = useRef<Set<string>>(new Set());
  const initialReportsLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    if (!apiBaseUrl) return;

    let cancelled = false;
    const loadReports = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        
        const wsId = batch?.workspaceId || batch?.workspace_id || localStorage.getItem("cephlow_active_workspace");
        
        const res = await fetch(`${apiBaseUrl}/api/reports`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(wsId ? { "x-workspace-id": wsId } : {}),
          },
        });
        if (!res.ok) return;
        
        const data = await res.json().catch(() => []) as { cert_key?: string; message: string; phone: string; created_at: string }[];
        if (cancelled) return;
        
        const scoped = data.filter(r => r.cert_key);
        const map = new Map<string, ReportDetail>();
        scoped.forEach(r => map.set(r.cert_key!, { message: r.message, phone: r.phone, created_at: r.created_at }));
        setReportsByCertKey(map);

          const seen = seenReportKeysRef.current;
          const currentBatchCertKeys = new Set<string>(
            ((batch?.certificates as any[]) || [])
              .map((c: any) => {
                if (!c.r2PdfUrl) return null;
                try { return decodeURIComponent(new URL(c.r2PdfUrl).pathname.slice(1)); } catch { return null; }
              })
              .filter((k): k is string => !!k)
          );

          const newReports: { cert_key: string; message: string; phone: string; created_at: string }[] = [];
          for (const r of scoped) {
            const dedupKey = `${r.cert_key}|${r.created_at}`;
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              if (initialReportsLoadedRef.current && currentBatchCertKeys.has(r.cert_key!)) {
                newReports.push(r as any);
              }
            }
          }

          if (!initialReportsLoadedRef.current) {
            initialReportsLoadedRef.current = true;
          } else if (newReports.length > 0) {
            if (newReports.length === 1) {
              const r = newReports[0];
              const certName = r.cert_key.split('/').pop() || r.cert_key;
              toast({ title: "New issue reported", description: `${certName}: "${r.message}"` });
            } else {
              toast({ title: `${newReports.length} new issue reports`, description: "Recipients reported issues with their certificates via WhatsApp." });
            }
          }
      } catch (err) {
        console.error("Failed to load reports:", err);
      }
    };

    loadReports();
    const intervalId = window.setInterval(loadReports, 15000);
    const onFocus = () => loadReports();
    const onVisibility = () => { if (document.visibilityState === 'visible') loadReports(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [batch, toast]);

  const getCertKey = (cert: any): string | null => {
    if (!cert.r2PdfUrl) return null;
    try { return decodeURIComponent(new URL(cert.r2PdfUrl).pathname.slice(1)); } catch { return null; }
  };

  const certHasReport = (cert: any): boolean => {
    const key = getCertKey(cert);
    return !!key && reportsByCertKey.has(key);
  };

  const getCertReport = (cert: any): ReportDetail | null => {
    const key = getCertKey(cert);
    return key ? (reportsByCertKey.get(key) ?? null) : null;
  };

  return { reportsByCertKey, getCertKey, certHasReport, getCertReport };
}
