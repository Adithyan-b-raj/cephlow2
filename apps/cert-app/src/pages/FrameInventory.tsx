import { useState, useEffect } from "react";
import { Loader2, Search, ShoppingBag, LayoutTemplate, Star, Package, Paintbrush, Heart, Pencil, Trash2, Check, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CustomFrameRenderer, type CustomFrameConfig } from "@/components/CustomFrameRenderer";
import { PublishFrameDialog } from "@/pages/batches/components/PublishFrameDialog";
import { CustomFrameDesigner } from "@/pages/batches/components/CustomFrameDesigner";
import { useWorkspace } from "@/hooks/use-workspace";
// ─── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  name: string;
  description: string;
  price: number;
  purchaseCount: number;
  likeCount: number;
  totalEarned?: number;
  isActive?: boolean;
  frameConfig: CustomFrameConfig | null;
  alreadyPurchased?: boolean;
  likedByMe?: boolean;
  creatorName?: string;
  createdAt: string;
}

interface OwnedFrame {
  listingId: string;
  name: string;
  config: CustomFrameConfig | null;
}

interface WorkspaceFrame {
  id: string;
  name: string;
  config: CustomFrameConfig;
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function PreviewCard() {
  return (
    <div className="border-2 border-foreground bg-background flex flex-col font-mono text-foreground cert-card-inner" style={{ position: "relative" }}>
      <div className="px-3 py-3 flex flex-col gap-2 border-b-2 border-foreground relative" style={{ aspectRatio: "300/140" }}>
        <div className="relative flex items-start justify-between gap-2">
          <div className="border p-1.5 shrink-0 border-foreground">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <span className="border-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border-foreground">cert</span>
        </div>
        <div className="relative flex-1" />
        <div className="relative flex items-end justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest">Frame</span>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Issued For</p>
            <p className="text-xs font-bold">Your Batch</p>
          </div>
        </div>
      </div>
      <div className="flex">
        <span className="flex-1 flex items-center justify-center bg-foreground text-background px-2 py-1.5 text-[9px] font-black uppercase tracking-widest border-r-2 border-foreground">View</span>
        <span className="flex-1 flex items-center justify-center px-2 py-1.5 text-[9px] font-black uppercase tracking-widest">Verify</span>
      </div>
    </div>
  );
}


// ─── Tab: Browse ──────────────────────────────────────────────────────────────

function BrowseTab() {
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = (p = 1) => {
    setLoading(true);
    customFetch<{ listings: Listing[]; total: number }>('/api/marketplace/listings?page=' + p + '&limit=24')
      .then((d) => {
        setListings(d.listings ?? []);
        setTotal(d.total ?? 0);
        setPage(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const filtered = listings.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleLike = async (listing: Listing) => {
    setLikingId(listing.id);
    try {
      const result = await customFetch<{ liked: boolean; likeCount: number }>(
        '/api/marketplace/listings/' + listing.id + '/like',
        { method: "POST", body: JSON.stringify({}) }
      );
      setListings(prev => prev.map(l =>
        l.id === listing.id ? { ...l, likedByMe: result.liked, likeCount: result.likeCount } : l
      ));
    } catch {
      // silent
    } finally {
      setLikingId(null);
    }
  };

  const handlePurchase = async (listing: Listing) => {
    if (!listing.frameConfig) return;
    if (listing.alreadyPurchased) {
      toast({ title: '"' + listing.name + '" is already in your workspace' });
      return;
    }
    setPurchasingId(listing.id);
    try {
      await customFetch('/api/marketplace/listings/' + listing.id + '/purchase', { method: "POST", body: JSON.stringify({}) });
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, alreadyPurchased: true } : l));
      toast({ title: '"' + listing.name + '" added to your workspace' });
    } catch (err: any) {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48 flex items-center gap-2 border-2 border-border px-3 py-1.5 focus-within:border-foreground transition-colors">
          <Search className="w-3 h-3 text-muted-foreground shrink-0" />
          <input className="flex-1 bg-transparent text-sm outline-none font-mono" placeholder="Search frames..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
          <ShoppingBag className="w-8 h-8 text-muted-foreground opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No frames found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(listing => (
            <div key={listing.id} className="border-2 border-border p-2 flex flex-col gap-2 hover:border-foreground/40 transition-colors">
              <div className="flex justify-center py-1">
                <div className="w-full max-w-[200px]">
                  {listing.frameConfig
                    ? <CustomFrameRenderer frameId={listing.id} config={listing.frameConfig}><PreviewCard /></CustomFrameRenderer>
                    : <PreviewCard />}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest truncate">{listing.name}</p>
                {listing.creatorName && (
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">by {listing.creatorName}</p>
                )}
                {listing.description && <p className="text-[9px] text-muted-foreground truncate mt-0.5">{listing.description}</p>}
                <p className="text-[9px] text-muted-foreground mt-0.5">Used in {listing.purchaseCount} event{listing.purchaseCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-black px-1.5 py-0.5 border border-green-600 text-green-600">
                  FREE
                </span>
                <div className="flex items-center gap-1">
                  {listing.alreadyPurchased && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-foreground text-background">OWNED</span>
                  )}
                  <button
                    onClick={() => handleLike(listing)}
                    disabled={likingId === listing.id}
                    className={"flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50 px-1 py-0.5"}
                  >
                    <Heart className={"w-4 h-4 " + (listing.likedByMe ? "fill-red-500 text-red-500" : "")} />
                    <span>{listing.likeCount ?? 0}</span>
                  </button>
                </div>
              </div>
              <button
                onClick={() => handlePurchase(listing)}
                disabled={purchasingId === listing.id || listing.alreadyPurchased}
                className={"w-full py-1.5 text-[9px] font-black uppercase tracking-widest border-2 transition-colors flex items-center justify-center gap-1 " +
                  (listing.alreadyPurchased
                    ? "border-foreground/30 text-foreground/30 cursor-default"
                    : "border-border hover:border-foreground hover:bg-foreground hover:text-background")}
              >
                {purchasingId === listing.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : listing.alreadyPurchased ? "Already Owned"
                  : "Get Free"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 24 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => load(page - 1)}>Prev</Button>
          <span className="text-xs font-mono text-muted-foreground">{page} / {Math.ceil(total / 24)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 24)} onClick={() => load(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function MyListingsTab() {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceFrames, setWorkspaceFrames] = useState<WorkspaceFrame[]>([]);
  const [publishTarget, setPublishTarget] = useState<WorkspaceFrame | null>(null);

  // Per-listing inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      customFetch<{ listings: Listing[] }>("/api/marketplace/my-listings"),
      customFetch<{ frames: WorkspaceFrame[] }>("/api/frame-templates"),
    ])
      .then(([d, t]) => {
        setListings(d.listings ?? []);
        setWorkspaceFrames(t.frames ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggleActive = async (listing: Listing) => {
    try {
      await customFetch(`/api/marketplace/listings/${listing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !listing.isActive }),
      });
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, isActive: !l.isActive } : l));
      toast({ title: listing.isActive ? "Listing unpublished" : "Listing re-published" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const startEdit = (listing: Listing) => {
    setEditingId(listing.id);
    setEditingValue(listing.name);
  };

  const cancelEdit = () => { setEditingId(null); setEditingValue(""); };

  const handleSaveEdit = async (listing: Listing) => {
    const newName = editingValue.trim();
    const nameChanged = newName && newName !== listing.name;
    if (!nameChanged) { cancelEdit(); return; }
    setSavingEditId(listing.id);
    try {
      const patch = { name: newName };
      await customFetch(`/api/marketplace/listings/${listing.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setListings(prev => prev.map(l => l.id === listing.id
        ? { ...l, name: newName }
        : l));
      setEditingId(null);
      toast({ title: "Listing updated" });
    } catch (err: any) {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (listing: Listing) => {
    setDeletingId(listing.id);
    try {
      await customFetch(`/api/marketplace/listings/${listing.id}`, { method: "DELETE" });
      setListings(prev => prev.filter(l => l.id !== listing.id));
      toast({ title: `"${listing.name}" deleted` });
    } catch (err: any) {
      toast({
        title: "Cannot delete",
        description: listing.purchaseCount > 0
          ? "This listing has been purchased. Unpublish it instead."
          : err.message,
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* Header bar: stats + publish */}
      <div className="border-2 border-border p-3 flex flex-wrap items-center justify-between gap-4">
        {/* Stats */}
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>{listings.length} listing{listings.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Publish */}
        {workspaceFrames.length > 0 && (
          <div className="relative group shrink-0">
            <Button size="sm">Publish a Frame</Button>
            <div className="hidden group-focus-within:block absolute right-0 top-full mt-1 z-10 border-2 border-foreground bg-background min-w-48 shadow-lg">
              {workspaceFrames.map(f => (
                <button key={f.id} onClick={() => setPublishTarget(f)}
                  className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-muted transition-colors border-b border-border last:border-0">
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
          <Star className="w-8 h-8 text-muted-foreground opacity-30" />
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No listings yet</p>
          <p className="text-[10px] text-muted-foreground">Design a frame and publish it to the marketplace.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listings.map(listing => (
            <div key={listing.id} className="border-2 border-border flex gap-3 p-3 items-center">
              {/* Thumbnail */}
              <div className="shrink-0 overflow-hidden relative" style={{ width: 80, height: 50 }}>
                <div style={{ width: 200, transform: "scale(0.4)", transformOrigin: "top left", pointerEvents: "none" }}>
                  {listing.frameConfig
                    ? <CustomFrameRenderer frameId={listing.id} config={listing.frameConfig}><PreviewCard /></CustomFrameRenderer>
                    : <PreviewCard />}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {editingId === listing.id ? (
                  <div className="flex items-center gap-1 mb-1 flex-wrap">
                    <input
                      autoFocus
                      className="flex-1 min-w-24 border border-border bg-background px-2 py-0.5 text-xs font-mono outline-none focus:border-foreground transition-colors uppercase"
                      value={editingValue}
                      onChange={e => setEditingValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(listing); if (e.key === "Escape") cancelEdit(); }}
                      placeholder="Name"
                    />
                    
                    <button onClick={() => handleSaveEdit(listing)} disabled={savingEditId === listing.id} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                      {savingEditId === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-black text-sm uppercase tracking-widest truncate">{listing.name}</p>
                    <button onClick={() => startEdit(listing)} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors" title="Edit name">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 border shrink-0 ${listing.isActive ? "border-green-600 text-green-600" : "border-muted-foreground text-muted-foreground"}`}>
                      {listing.isActive ? "LIVE" : "UNLISTED"}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                  <span>{listing.price === 0 ? "Free" : `₹${listing.price}`}</span>
                  <span>·</span>
                  <span>{listing.purchaseCount} purchase{listing.purchaseCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>₹{listing.totalEarned ?? 0} earned</span>
                  <span>·</span>
                  <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" />{listing.likeCount ?? 0}</span>
                </p>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => handleToggleActive(listing)}>
                  {listing.isActive ? "Unpublish" : "Republish"}
                </Button>
                <button
                  onClick={() => handleDelete(listing)}
                  disabled={deletingId === listing.id}
                  className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                  title={listing.purchaseCount > 0 ? "Has purchases — unpublish instead" : "Delete listing"}
                >
                  {deletingId === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {publishTarget && (
        <PublishFrameDialog
          open={!!publishTarget}
          onOpenChange={o => { if (!o) setPublishTarget(null); }}
          frameId={publishTarget.id}
          frameName={publishTarget.name}
          frameConfig={publishTarget.config}
          onPublished={() => { setPublishTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Design Frame ────────────────────────────────────────────────────────

function DesignTab() {
  const [savedCount, setSavedCount] = useState(0);
  return (
    <div>
      {savedCount > 0 && (
        <div className="mb-4 border border-green-600 bg-green-600/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-green-600">
          {savedCount} frame{savedCount !== 1 ? "s" : ""} saved to workspace library — go to My Listings to publish.
        </div>
      )}
      <CustomFrameDesigner
        standalone
        open={true}
        onOpenChange={() => {}}
        onSaved={(_tier, _name, _config) => setSavedCount(c => c + 1)}
      />
    </div>
  );
}

// ─── Tab: Credits ─────────────────────────────────────────────────────────────

function OwnedTab() {
  const [frames, setFrames] = useState<OwnedFrame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customFetch<{ purchases: OwnedFrame[] }>("/api/marketplace/my-workspace-frames")
      .then((d: { purchases: OwnedFrame[] }) => setFrames(d.purchases ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
        <Package className="w-8 h-8 text-muted-foreground opacity-30" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No owned frames yet</p>
        <p className="text-[10px] text-muted-foreground">Browse the marketplace and get frames to use in your batches.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {frames.map(f => (
        <div key={f.listingId} className="border-2 border-border p-2 flex flex-col gap-2">
          <div className="flex justify-center py-1">
            <div className="w-full max-w-[200px]">
              {f.config
                ? <CustomFrameRenderer frameId={f.listingId} config={f.config}><PreviewCard /></CustomFrameRenderer>
                : <PreviewCard />}
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest truncate">{f.name}</p>
          <span className="text-[9px] font-black px-1.5 py-0.5 bg-foreground text-background self-start">OWNED</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "browse" | "listings" | "design" | "owned";

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
  { id: "browse",   label: "Browse",        icon: ShoppingBag },
  { id: "listings", label: "My Listings",   icon: Star },
  { id: "design",   label: "Design Frame",  icon: Paintbrush },
    { id: "owned",    label: "Owned",         icon: Package },
];

export default function FrameInventory() {
  const [tab, setTab] = useState<Tab>("browse");

  return (
    <div className="min-h-screen bg-background font-mono">
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-foreground text-background p-2.5 shrink-0">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-widest">Frame Inventory</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Browse, publish, and manage certificate frames</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-2 border-foreground mb-6 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors
                  ${tab === t.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
              >
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "browse"   && <BrowseTab />}
        {tab === "listings" && <MyListingsTab />}
        {tab === "design"   && <DesignTab />}
        {tab === "owned"    && <OwnedTab />}
      </div>
    </div>
  );
}
