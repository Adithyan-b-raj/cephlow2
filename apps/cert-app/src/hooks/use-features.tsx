import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/hooks/use-workspace";

export type FeatureKey = "whatsapp_delivery" | "email_delivery" | "custom_event_banners" | "google_slides_templates" | "qr_codes";

type Features = Record<FeatureKey, boolean>;

const EMPTY_FEATURES: Features = {
  whatsapp_delivery: false,
  email_delivery: false,
  custom_event_banners: false,
  google_slides_templates: false,
  qr_codes: false,
};

interface FeaturesState {
  features: Features;
  loading: boolean;
  refetch: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesState | null>(null);

async function fetchFeatures(workspaceId?: string | null): Promise<Features> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token || !workspaceId) return EMPTY_FEATURES;
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "x-workspace-id": workspaceId };
  const res = await fetch(`${apiUrl}/api/me/features?workspaceId=${workspaceId}`, { headers });
  if (!res.ok) return EMPTY_FEATURES;
  const j = await res.json();
  return { ...EMPTY_FEATURES, ...(j?.features ?? {}) };
}

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Features>(EMPTY_FEATURES);
  const [loading, setLoading] = useState(true);
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setFeatures(await fetchFeatures(workspaceId));
    } catch {
      setFeatures(EMPTY_FEATURES);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refetch();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refetch();
    });
    return () => sub.subscription.unsubscribe();
  }, [refetch]);

  return (
    <FeaturesContext.Provider value={{ features, loading, refetch }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): FeaturesState {
  const ctx = useContext(FeaturesContext);
  if (!ctx) {
    return { features: EMPTY_FEATURES, loading: false, refetch: async () => {} };
  }
  return ctx;
}
