import { useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/lib/supabase";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchTo, reload } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = await res.json();
        await reload();
        switchTo(data.workspace.id);
        setNewName("");
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  if (!activeWorkspace) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-muted border border-border rounded-none transition-colors"
      >
        <span className="truncate flex-1 text-left">{activeWorkspace.name}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 border border-border bg-background shadow-md">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => { switchTo(ws.id); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-muted text-left transition-colors"
            >
              <Check className={`w-3 h-3 shrink-0 ${ws.id === activeWorkspace.id ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{ws.name}</span>
              <span className="ml-auto text-[9px] text-muted-foreground uppercase">{ws.role}</span>
            </button>
          ))}

          <div className="border-t border-border p-2">
            <form onSubmit={handleCreate} className="flex gap-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New workspace…"
                className="flex-1 text-xs px-2 py-1 border border-border bg-transparent outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-2 py-1 border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                title="Create"
              >
                <Plus className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
