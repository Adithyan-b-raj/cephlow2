import { useState } from "react";
import { Loader2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CustomFrameRenderer, type CustomFrameConfig } from "@/components/CustomFrameRenderer";

const PRICE_OPTIONS = [0, 20, 40, 60, 80, 100];

function PreviewCard() {
  return (
    <div className="border-2 border-foreground bg-background flex flex-col font-mono text-foreground cert-card-inner" style={{ position: "relative" }}>
      <div className="px-3 py-3 flex flex-col gap-2 border-b-2 border-foreground relative" style={{ aspectRatio: "300/140" }}>
        <div className="relative flex items-start justify-between gap-2">
          <div className="border p-1.5 shrink-0 border-foreground">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <span className="border-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border-foreground">preview</span>
        </div>
        <div className="relative flex-1" />
        <div className="relative flex items-end justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest">Your Frame</span>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Issued For</p>
            <p className="text-xs font-bold">Your Batch</p>
          </div>
        </div>
      </div>
      <div className="flex">
        <span className="flex-1 flex items-center justify-center gap-1 bg-foreground text-background px-2 py-2 text-[9px] font-black uppercase tracking-widest border-r-2 border-foreground">View</span>
        <span className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[9px] font-black uppercase tracking-widest">Verify</span>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  frameId: string;
  frameName: string;
  frameConfig: CustomFrameConfig;
  onPublished?: (listingId: string) => void;
}

export function PublishFrameDialog({ open, onOpenChange, frameId, frameName, frameConfig, onPublished }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(frameName);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const handlePublish = async () => {
    if (!name.trim()) { toast({ title: "Enter a name for your listing", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const result = await customFetch<{ listing: { id: string } }>("/api/marketplace/listings", {
        method: "POST",
        body: JSON.stringify({ frameId, name: name.trim(), description: description.trim(), price }),
      });
      toast({ title: `"${name.trim()}" published to Frame Inventory marketplace` });
      onPublished?.(result.listing.id);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Failed to publish", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg p-4 sm:p-6 gap-0">
        <DialogHeader className="pb-4 shrink-0">
          <DialogTitle>Publish to Marketplace</DialogTitle>
          <DialogDescription>
            Make this frame available for other organizers to discover and use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-5">
          {/* Preview */}
          <div className="shrink-0 flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-widest">Preview</p>
            <div style={{ width: 160 }}>
              <CustomFrameRenderer frameId={frameId} config={frameConfig}>
                <PreviewCard />
              </CustomFrameRenderer>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-widest">Listing name</p>
              <input
                className="w-full border-2 border-border bg-background px-3 py-1.5 text-sm font-bold uppercase tracking-widest outline-none focus:border-foreground transition-colors"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Awesome Frame"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-widest">Description <span className="font-normal normal-case tracking-normal text-muted-foreground">(optional)</span></p>
              <textarea
                className="w-full border-2 border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground transition-colors resize-none"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your frame style..."
              />
            </div>

          </div>
        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-border mt-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? "Publishing…" : "Publish Frame"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
