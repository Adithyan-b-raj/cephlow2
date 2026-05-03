import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface ApprovalState {
  isApproved: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

const ApprovalContext = createContext<ApprovalState | null>(null);

async function fetchApproval(): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return false;
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
  const res = await fetch(`${apiUrl}/api/me/approval`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const j = await res.json();
  return Boolean(j?.isApproved);
}

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setIsApproved(await fetchApproval());
    } catch {
      setIsApproved(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refetch();
    });
    return () => sub.subscription.unsubscribe();
  }, [refetch]);

  return (
    <ApprovalContext.Provider value={{ isApproved, loading, refetch }}>
      {children}
    </ApprovalContext.Provider>
  );
}

export function useApproval(): ApprovalState {
  const ctx = useContext(ApprovalContext);
  if (!ctx) {
    // Outside the provider — return a sensible default so callers don't crash
    return { isApproved: false, loading: false, refetch: async () => {} };
  }
  return ctx;
}
