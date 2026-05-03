import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { setWorkspaceIdProvider } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  currentBalance: number;
  createdAt: string;
  role: "owner" | "admin" | "member";
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  role: Workspace["role"] | null;
  loading: boolean;
  switchTo: (workspaceId: string) => void;
  reload: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const LS_KEY = "cephlow_active_workspace";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(LS_KEY));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch("/workspaces");
      const list: Workspace[] = data.workspaces || [];

      if (list.length === 0) {
        const created = await apiFetch("/workspaces", {
          method: "POST",
          body: JSON.stringify({ name: "Personal" }),
        });
        const ws: Workspace = created.workspace;
        setWorkspaces([ws]);
        setActiveId(ws.id);
        localStorage.setItem(LS_KEY, ws.id);
      } else {
        setWorkspaces(list);
        setActiveId((prev) => {
          const stillExists = prev && list.some((w) => w.id === prev);
          const next = stillExists ? prev : list[0].id;
          localStorage.setItem(LS_KEY, next!);
          return next;
        });
      }
    } catch (err) {
      console.error("[workspace] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") load();
      if (event === "SIGNED_OUT") {
        setWorkspaces([]);
        setActiveId(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  // Wire the workspace ID into the API client fetcher
  useEffect(() => {
    setWorkspaceIdProvider(() => activeId);
  }, [activeId]);

  const switchTo = useCallback((id: string) => {
    localStorage.setItem(LS_KEY, id);
    setActiveId(id);
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;
  const role = activeWorkspace?.role ?? null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, role, loading, switchTo, reload: load }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
