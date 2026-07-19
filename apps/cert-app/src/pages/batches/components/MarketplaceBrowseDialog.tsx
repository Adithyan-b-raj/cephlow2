import { useState, useEffect } from "react";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CustomFrameRenderer, type CustomFrameConfig } from "@/components/CustomFrameRenderer";

interface Listing {
  id: string;
  name: string;
  description: string;
  price: number;
  purchaseCount: number;
  frameConfig: CustomFrameConfig | null;
  alreadyPurchased: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFrameSelected: (tier: string, name: string, config: CustomFrameConfig) => void;
}

function MiniCard() {
  return (
    <div className="border-2 border-foreground bg-background flex flex-col font-mono text-foreground cert-card-inner" style={{ position: "relative" }}>
      <div className="px-2 py-2 flex flex-col gap-1 border-b-2 border-foreground relative" style={{ aspectRatio: "300/140" }}>
        <div className="relative flex items-start justify-between gap-1">
          <div className="border p-1 shrink-0 border-foreground">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <span className="border px-1 py-0 text-[7px] font-black uppercase tracking-widest border-foreground">cert</span>
        </div>
        <div className="relative flex-1" />
        <div className="relative flex items-end justify-between gap-1">
          <span className="text-[7px] font-bold uppercase tracking-widest">Frame</span>
          <div className="text-right">
            <p className="text-[6px] font-bold uppercase tracking-widest text-muted-foreground">Issued For</p>
            <p className="text-[8px] font-bold">Your Batch</p>
          </div>
        </div>
      </div>
      <div className="flex">
        <span className="flex-1 flex items-center justify-center bg-foreground text-background px-1 py-1 text-[7px] font-black uppercase tracking-widest border-r border-foreground">View</span>
        <span className="flex-1 flex items-center justify-center px-1 py-1 text-[7px] font-black uppercase tracking-widest">Verify</span>
      </div>
    </div>
  );
}

export function MarketplaceBrowseDialog({ open, onOpenChange, onFrameSelected }: Props) {
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    customFetch<{ listings: Listing[] }>("/api/marketplace/listings?limit=48")
      .then((d) => {
        setListings(d.listings ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = listings.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (listing: Listing) => {
    if (!listing.frameConfig) return;

    if (listing.alreadyPurchased) {
      onFrameSelected(`marketplace:${listing.id}`, listing.name, listing.frameConfig);
      onOpenChange(false);
      return;
    }

    setPurchasingId(listing.id);
    try {
      await customFetch("/api/marketplace/listings/" + listing.id + "/purchase", { method: "POST" });
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, alreadyPurchased: true } : l));
      toast({ title: `"${listing.name}" added to your workspace` });
      onFrameSelected(`marketplace:${listing.id}`, listing.name, listing.frameConfig);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6 gap-0">
        <DialogHeader className="shrink-0 pb-3">
          <DialogTitle>Frame Inventory — Marketplace</DialogTitle>
          <DialogDescription>Browse community frames and apply one to your batch.</DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="shrink-0 flex items-center gap-3 pb-3">
          <div className="flex-1 flex items-center gap-2 border-2 border-border px-3 py-1.5 focus-within:border-foreground transition-colors">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none font-mono"
              placeholder="Search frames..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Listings grid */}
        <div className="flex-1 overflow-y-auto themed-scroll min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <ShoppingBag className="w-8 h-8 text-muted-foreground opacity-30" />
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No frames found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-2">
              {filtered.map(listing => (
                <div key={listing.id} className="border-2 border-border p-2 flex flex-col gap-2 hover:border-foreground/40 transition-colors">
                  {/* Thumbnail */}
                  <div className="flex justify-center">
                    {listing.frameConfig ? (
                      <CustomFrameRenderer frameId={listing.id} config={listing.frameConfig}>
                        <MiniCard />
                      </CustomFrameRenderer>
                    ) : (
                      <MiniCard />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest truncate">{listing.name}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Used in {listing.purchaseCount} event{listing.purchaseCount !== 1 ? "s" : ""}</p>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => handleSelect(listing)}
                    disabled={purchasingId === listing.id}
                    className={`w-full py-1.5 text-[9px] font-black uppercase tracking-widest border-2 transition-colors flex items-center justify-center gap-1
                      ${listing.alreadyPurchased
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground hover:bg-foreground hover:text-background"
                      }`}
                  >
                    {purchasingId === listing.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : listing.alreadyPurchased
                        ? "Apply"
                        : listing.price === 0 ? "Get Free" : `Get ₹${listing.price}`}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
