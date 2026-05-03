import { useState, useEffect } from "react";
import { Upload, Save } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface Brand {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
}

async function apiFetch(path: string, workspaceId: string, opts: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-workspace-id": workspaceId,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${res.status}`);
  }
  return res.json();
}

export default function WorkspaceBrand() {
  const { activeWorkspace, role } = useWorkspace();
  const { toast } = useToast();
  const [brand, setBrand] = useState<Brand>({ logoUrl: null, primaryColor: "#000000", secondaryColor: "#ffffff", fontFamily: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const workspaceId = activeWorkspace?.id;
  const isAdmin = role === "owner" || role === "admin";

  useEffect(() => {
    if (!workspaceId) return;
    apiFetch(`/workspaces/${workspaceId}/brand`, workspaceId)
      .then((data) => { if (data.brand) setBrand(data.brand); })
      .catch(() => {});
  }, [workspaceId]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    setUploading(true);
    try {
      const data = await apiFetch("/builtin-templates/asset-upload-url", workspaceId, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, contentType: file.type, kind: "image" }),
      });
      await fetch(data.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      setBrand((b) => ({ ...b, logoUrl: data.publicUrl }));
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setSaving(true);
    try {
      await apiFetch(`/workspaces/${workspaceId}/brand`, workspaceId, {
        method: "PUT",
        body: JSON.stringify(brand),
      });
      toast({ title: "Brand kit saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!activeWorkspace) return null;

  return (
    <div className="max-w-xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-black uppercase tracking-widest">Brand Kit</h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{activeWorkspace.name}</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest">Logo</label>
          <div className="flex items-center gap-4">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt="Logo" className="h-12 w-auto border border-border object-contain p-1" />
            ) : (
              <div className="h-12 w-20 border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                No logo
              </div>
            )}
            {isAdmin && (
              <label className="cursor-pointer flex items-center gap-2 text-xs font-bold uppercase tracking-widest border border-border px-3 py-2 hover:bg-muted transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
              </label>
            )}
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest">Primary color</label>
            <div className="flex items-center gap-2 border border-border px-3 py-2">
              <input
                type="color"
                value={brand.primaryColor || "#000000"}
                onChange={(e) => setBrand((b) => ({ ...b, primaryColor: e.target.value }))}
                disabled={!isAdmin}
                className="w-6 h-6 border-none bg-transparent cursor-pointer"
              />
              <span className="text-xs font-mono">{brand.primaryColor || "#000000"}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest">Secondary color</label>
            <div className="flex items-center gap-2 border border-border px-3 py-2">
              <input
                type="color"
                value={brand.secondaryColor || "#ffffff"}
                onChange={(e) => setBrand((b) => ({ ...b, secondaryColor: e.target.value }))}
                disabled={!isAdmin}
                className="w-6 h-6 border-none bg-transparent cursor-pointer"
              />
              <span className="text-xs font-mono">{brand.secondaryColor || "#ffffff"}</span>
            </div>
          </div>
        </div>

        {/* Font */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest">Font family</label>
          <input
            type="text"
            value={brand.fontFamily || ""}
            onChange={(e) => setBrand((b) => ({ ...b, fontFamily: e.target.value }))}
            disabled={!isAdmin}
            placeholder="e.g. Inter, Roboto, Montserrat"
            className="w-full text-xs px-3 py-2 border border-border bg-transparent outline-none placeholder:text-muted-foreground focus:border-foreground disabled:opacity-60"
          />
        </div>

        {isAdmin && (
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest border border-foreground bg-foreground text-background hover:opacity-90 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save brand kit"}
          </button>
        )}
      </form>
    </div>
  );
}
