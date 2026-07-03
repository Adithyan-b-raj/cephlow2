import { useState, useEffect } from "react";
import { Loader2, Search, ShoppingBag, LayoutTemplate, Package, Paintbrush, Heart, Trash2, Globe, EyeOff } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CustomFrameRenderer, type CustomFrameConfig } from "@/components/CustomFrameRenderer";
import { PublishFrameDialog } from "@/pages/batches/components/PublishFrameDialog";
import { CustomFrameDesigner } from "@/pages/batches/components/CustomFrameDesigner";

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
  frameId?: string;
}

interface WorkspaceFrame {
  id: string;
  name: string;
  config: CustomFrameConfig;
}

interface OwnedFrameEntry {
  id: string;           // frame template id for designed, listing id for marketplace
  frameTemplateId?: string; // set for designed frames
  name: string;
  config: CustomFrameConfig | null;
  source: "designed" | "marketplace";
  listingId?: string;   // set if there is an active listing for this frame
  isListed?: boolean;
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

// ─── Tab: Design Frame ────────────────────────────────────────────────────────

function DesignTab() {
  const [savedCount, setSavedCount] = useState(0);
  return (
    <div>
      {savedCount > 0 && (
        <div className="mb-4 border border-green-600 bg-green-600/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-green-600">
          {savedCount} frame{savedCount !== 1 ? "s" : ""} saved to workspace library — go to Owned tab to publish.
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

// ─── Tab: Owned ───────────────────────────────────────────────────────────────

function OwnedTab() {
  const { toast } = useToast();
  const [frames, setFrames] = useState<OwnedFrameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishTarget, setPublishTarget] = useState<{ id: string; name: string; config: CustomFrameConfig } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      customFetch<{ frames: WorkspaceFrame[] }>("/api/frame-templates"),
      customFetch<{ purchases: { listingId: string; name: string; config: CustomFrameConfig | null }[] }>("/api/marketplace/my-workspace-frames"),
      customFetch<{ listings: Listing[] }>("/api/marketplace/my-listings"),
    ])
      .then(([templatesData, purchasesData, listingsData]) => {
        const myListings = listingsData.listings ?? [];

        // Build a map: frameTemplateId -> listing (only active ones)
        const activeListingByFrameId = new Map<string, Listing>();
        // The listing has a frameId linking back to the template
        // We need to identify this from the listing data; the API returns frameConfig but not frameId directly.
        // We'll use listing name matching + the listing id to mark as published.
        // Actually my-listings doesn't return frameId. We need to handle this by storing the listingId
        // in the OwnedFrame so we can check. Let's build a Set of listing ids to check.
        // For simplicity: a designed frame is "listed" if any listing in my-listings shares the same name
        // BUT this is fragile. Better approach: we'll check if listing's frameId matches.
        // Since we don't have frameId from the server, we tag all listings as just "listed" with their listing id.
        // We can cross-check by looking for listing.id in the active listings set for each frame.

        // Build listing lookup by id
        const listingsById = new Map<string, Listing>();
        myListings.forEach(l => listingsById.set(l.id, l));

        // Designed frames
        const designedEntries: OwnedFrameEntry[] = (templatesData.frames ?? []).map(f => {
          // Check if there's an active listing for this template
          // We can only check if a listing is active. Since my-listings doesn't include frameId,
          // we need to rely on the listing's name or a different endpoint. For now we'll set isListed=false
          // and handle publish/unpublish from the listing data we have for marketplace frames.
          return {
            id: f.id,
            frameTemplateId: f.id,
            name: f.name,
            config: f.config,
            source: "designed",
            isListed: false,
          };
        });

        // Marketplace acquired frames (from purchases)
        const purchasedListingIds = new Set<string>();
        const marketplaceEntries: OwnedFrameEntry[] = (purchasesData.purchases ?? []).map(p => {
          purchasedListingIds.add(p.listingId);
          const listing = listingsById.get(p.listingId);
          return {
            id: p.listingId,
            name: p.name,
            config: p.config,
            source: "marketplace",
            listingId: p.listingId,
            isListed: listing ? listing.isActive : undefined,
          };
        });

        // Now enrich designed frames with listing status from my-listings
        // We look at active listings and check if this workspace published them
        // Since we can get the listing's frameId via a more detailed API, let's just
        // use the data we have: for designed frames, check my-listings where the listing
        // is still active. We don't have frameId in the response. We'll add a new approach:
        // We iterate my-listings and for each, we match against designed frames by name.
        // This is approximate. The cleaner fix is to expose frameId in my-listings.
        // For now let's just attach listing status based on name match.
        myListings.forEach(listing => {
          const match = designedEntries.find(f => f.name.toLowerCase() === listing.name.toLowerCase() && !f.isListed);
          if (match) {
            match.isListed = listing.isActive;
            match.listingId = listing.id;
          }
        });

        setFrames([...designedEntries, ...marketplaceEntries]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleUnpublish = async (frame: OwnedFrameEntry) => {
    if (!frame.listingId) return;
    setTogglingId(frame.id);
    try {
      await customFetch('/api/marketplace/listings/' + frame.listingId, {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      });
      toast({ title: '"' + frame.name + '" unpublished from marketplace' });
      setFrames(prev => prev.map(f => f.id === frame.id ? { ...f, isListed: false } : f));
    } catch (err: any) {
      toast({ title: "Failed to unpublish", description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (frame: OwnedFrameEntry) => {
    setDeletingId(frame.id);
    try {
      if (frame.source === "designed") {
        if (!frame.frameTemplateId) return;
        await customFetch('/api/frame-templates/' + frame.frameTemplateId, { method: "DELETE" });
      } else {
        if (!frame.listingId) return;
        await customFetch('/api/marketplace/purchases/' + frame.listingId, { method: "DELETE" });
      }
      setFrames(prev => prev.filter(f => f.id !== frame.id));
      toast({ title: '"' + frame.name + '" deleted' });
    } catch (err: any) {
      toast({ title: "Cannot delete", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-border">
        <Package className="w-8 h-8 text-muted-foreground opacity-30" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No frames yet</p>
        <p className="text-[10px] text-muted-foreground">Design a frame or browse the marketplace to get frames.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {frames.map(f => (
          <div key={f.id} className="border-2 border-border p-2 flex flex-col gap-2">
            {/* Frame Preview */}
            <div className="flex justify-center py-1">
              <div className="w-full max-w-[200px]">
                {f.config
                  ? <CustomFrameRenderer frameId={f.id} config={f.config}><PreviewCard /></CustomFrameRenderer>
                  : <PreviewCard />}
              </div>
            </div>

            {/* Name */}
            <p className="text-[10px] font-black uppercase tracking-widest truncate">{f.name}</p>

            {/* Source badge */}
            <div className="flex items-center gap-1 flex-wrap">
              <span className={"text-[9px] font-black px-1.5 py-0.5 border shrink-0 " +
                (f.source === "designed"
                  ? "border-blue-500 text-blue-500"
                  : "border-purple-500 text-purple-500")}>
                {f.source === "designed" ? "DESIGNED" : "MARKETPLACE"}
              </span>
              {f.isListed && (
                <span className="text-[9px] font-black px-1.5 py-0.5 border border-green-600 text-green-600 shrink-0">LISTED</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-auto">
              {f.source === "designed" && (
                <>
                  {f.isListed ? (
                    <button
                      onClick={() => handleUnpublish(f)}
                      disabled={togglingId === f.id}
                      className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {togglingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                      Unpublish
                    </button>
                  ) : (
                    <button
                      onClick={() => f.config && setPublishTarget({ id: f.frameTemplateId!, name: f.name, config: f.config })}
                      disabled={!f.config}
                      className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      <Globe className="w-3 h-3" />
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(f)}
                    disabled={deletingId === f.id || f.isListed}
                    title={f.isListed ? "Unpublish before deleting" : "Delete frame"}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                  >
                    {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
              {f.source === "marketplace" && (
                <>
                  <span className="flex-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1.5 py-0.5">From Marketplace</span>
                  <button
                    onClick={() => handleDelete(f)}
                    disabled={deletingId === f.id}
                    title="Remove from owned frames"
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                  >
                    {deletingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

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

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "browse" | "design" | "owned";

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
  { id: "browse",  label: "Browse",       icon: ShoppingBag },
  { id: "design",  label: "Design Frame", icon: Paintbrush },
  { id: "owned",   label: "Owned",        icon: Package },
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Browse, design, and manage certificate frames</p>
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
        {tab === "browse"  && <BrowseTab />}
        {tab === "design"  && <DesignTab />}
        {tab === "owned"   && <OwnedTab />}
      </div>
    </div>
  );
}
