import { useState, useRef, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/compressImage";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Upload, Loader2, Award, CalendarDays, ShieldCheck, ExternalLink, Check, Plus, ShoppingBag } from "lucide-react";
import { HudFrameByTier, CustomFrameRenderer, type CustomFrameConfig } from "@/components/CustomFrameRenderer";
import { CustomFrameDesigner } from "./CustomFrameDesigner";
import { MarketplaceBrowseDialog } from "./MarketplaceBrowseDialog";

const CARD_BANNER_ASPECT = 300 / 140;

const FRAME_OPTIONS: { value: string; label: string; hudType?: string; hudColor?: string }[] = [
  { value: 'none',              label: 'None'        },
  { value: 'bronze',            label: 'Bronze'      },
  { value: 'silver',            label: 'Silver'      },
  { value: 'gold',              label: 'Gold'        },
  { value: 'cyberpunk',         label: 'Cyberpunk'   },
  { value: 'fire',              label: 'Fire'        },
  { value: 'ice',               label: 'Ice'         },
  { value: 'matrix',            label: 'Matrix'      },
  { value: 'holographic',       label: 'Holo'        },
  { value: 'neon-pulse',        label: 'Neon'        },
  { value: 'hud-grid-blue',     label: 'Grid Blue',  hudType: 'grid',    hudColor: '#00aaff' },
  { value: 'hud-grid-purple',   label: 'Grid Purple',hudType: 'grid',    hudColor: '#aa55ff' },
  { value: 'hud-grid-gold',     label: 'Grid Gold',  hudType: 'grid',    hudColor: '#ffaa00' },
  { value: 'hud-command-blue',  label: 'Cmd Blue',   hudType: 'command', hudColor: '#00aaff' },
  { value: 'hud-command-gold',  label: 'Cmd Gold',   hudType: 'command', hudColor: '#ffaa00' },
];


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  batch: any;
  walletBalance: number;
  onSaved: () => void;
  onUploadingChange: (uploading: boolean) => void;
}

export function BatchBannerEditor({ open, onOpenChange, batchId, batch, walletBalance, onSaved, onUploadingChange }: Props) {
  const { toast } = useToast();

  const [bannerPreviewFile, setBannerPreviewFile] = useState<File | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [bannerOverlayOpacity, setBannerOverlayOpacity] = useState(0.70);
  const [bannerTextColor, setBannerTextColor] = useState<string>("default");
  const [bannerCropZoom, setBannerCropZoom] = useState(1.0);
  const [bannerCropX, setBannerCropX] = useState(50);
  const [bannerCropY, setBannerCropY] = useState(50);
  const [frameTier, setFrameTier] = useState("none");
  const [imageBounds, setImageBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [frameCosts, setFrameCosts] = useState<Record<string, number>>({});
  const [customFrames, setCustomFrames] = useState<{ id: string; name: string; config: CustomFrameConfig }[]>([]);
  const [ownedMarketplaceFrames, setOwnedMarketplaceFrames] = useState<{ listingId: string; name: string; frameConfig: CustomFrameConfig }[]>([]);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!open) return;
    setBannerPreviewFile(null);
    setBannerPreviewUrl(batch?.bannerUrl ?? null);
    setBannerOverlayOpacity(batch?.bannerOverlayOpacity ?? 0.70);
    setBannerTextColor(batch?.bannerTextColor ?? "default");
    setBannerCropZoom(batch?.bannerCropZoom ?? 1.0);
    setBannerCropX(batch?.bannerCropX ?? 50);
    setBannerCropY(batch?.bannerCropY ?? 50);
    setFrameTier(batch?.frameTier ?? "none");
    customFetch<Record<string, number>>("/api/frame-costs").then(setFrameCosts).catch(() => {});
    customFetch<{ frames: { id: string; name: string; config: CustomFrameConfig }[] }>("/api/frame-templates")
      .then((d: { frames: { id: string; name: string; config: CustomFrameConfig }[] }) => setCustomFrames(d.frames ?? []))
      .catch(() => {});
    customFetch<{ purchases: { listingId: string; name: string; frameConfig: CustomFrameConfig }[] }>("/api/marketplace/my-workspace-frames")
      .then((d: { purchases: { listingId: string; name: string; frameConfig: CustomFrameConfig }[] }) => setOwnedMarketplaceFrames(d.purchases ?? []))
      .catch(() => {});
  }, [open, batch]);

  const updateImageBounds = () => {
    if (!cropImageRef.current || !cropContainerRef.current) return;
    const imgRect = cropImageRef.current.getBoundingClientRect();
    const containerRect = cropContainerRef.current.getBoundingClientRect();
    setImageBounds({
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
      width: imgRect.width,
      height: imgRect.height,
    });
  };

  useEffect(() => {
    if (!open || !bannerPreviewUrl) { setImageBounds(null); return; }
    const timer = setTimeout(updateImageBounds, 80);
    return () => clearTimeout(timer);
  }, [open, bannerPreviewUrl]);

  useEffect(() => {
    if (!open || !cropContainerRef.current) return;
    const observer = new ResizeObserver(updateImageBounds);
    observer.observe(cropContainerRef.current);
    return () => observer.disconnect();
  }, [open]);

  const handleBannerEditorFileChange = (file: File) => {
    setBannerPreviewFile(file);
    const url = URL.createObjectURL(file);
    setBannerPreviewUrl(url);
    setBannerCropZoom(1.0);
    setBannerCropX(50);
    setBannerCropY(50);
    const img = new Image();
    img.onload = () => {
      const W = 64, H = 32;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      let rSum = 0, gSum = 0, bSum = 0;
      const px = W * H;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
      }
      const avgR = rSum / px / 255, avgG = gSum / px / 255, avgB = bSum / px / 255;
      const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const bgLum = 0.2126 * lin(avgR) + 0.7152 * lin(avgG) + 0.0722 * lin(avgB);
      const contrast = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const fgLum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const hi = Math.max(bgLum, fgLum), lo = Math.min(bgLum, fgLum);
        return (hi + 0.05) / (lo + 0.05);
      };
      const palette = ["#FFFFFF", "#000000", "#FFD700", "#00E5FF", "#FF6B6B", "#CCFF00", "#FF9800", "#E040FB"];
      const best = palette.reduce((a, b) => contrast(a) >= contrast(b) ? a : b);
      setBannerTextColor(best);
    };
    img.src = url;
  };

  const handleCropRectDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!imageBounds) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCropX = bannerCropX;
    const startCropY = bannerCropY;
    const { width: iw, height: ih } = imageBounds;
    const zoom = bannerCropZoom;
    const oc_w = Math.min(iw, ih * CARD_BANNER_ASPECT);
    const oc_h = oc_w / CARD_BANNER_ASPECT;
    const halfX = (oc_w / (2 * zoom)) / iw * 100;
    const halfY = (oc_h / (2 * zoom)) / ih * 100;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / iw * 100;
      const dy = (ev.clientY - startY) / ih * 100;
      setBannerCropX(Math.max(halfX, Math.min(100 - halfX, startCropX + dx)));
      setBannerCropY(Math.max(halfY, Math.min(100 - halfY, startCropY + dy)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleCropRectTouchStart = (e: React.TouchEvent) => {
    if (!imageBounds || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startCropX = bannerCropX;
    const startCropY = bannerCropY;
    const { width: iw, height: ih } = imageBounds;
    const zoom = bannerCropZoom;
    const oc_w = Math.min(iw, ih * CARD_BANNER_ASPECT);
    const oc_h = oc_w / CARD_BANNER_ASPECT;
    const halfX = (oc_w / (2 * zoom)) / iw * 100;
    const halfY = (oc_h / (2 * zoom)) / ih * 100;
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const dx = (t.clientX - startX) / iw * 100;
      const dy = (t.clientY - startY) / ih * 100;
      setBannerCropX(Math.max(halfX, Math.min(100 - halfX, startCropX + dx)));
      setBannerCropY(Math.max(halfY, Math.min(100 - halfY, startCropY + dy)));
    };
    const onUp = () => { window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp); };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const handleConfirm = async () => {
    setBannerUploading(true);
    onUploadingChange(true);
    let step = "upload";
    try {
      if (bannerPreviewFile) {
        const compressed = await compressImage(bannerPreviewFile, { maxDimension: 1600 });
        const mimeType = compressed.type || "application/octet-stream";
        await customFetch(`/api/batches/${batchId}/banner`, {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: compressed,
        });
      }
      step = "settings";
      await customFetch(`/api/batches/${batchId}/banner-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerOverlayOpacity, bannerTextColor, bannerCropZoom, bannerCropX, bannerCropY, frameTier }),
      });
      onSaved();
      toast({ title: "Banner updated" });
      onOpenChange(false);
      if (bannerPreviewUrl && bannerPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bannerPreviewUrl);
    } catch (err: any) {
      const isInsufficientFunds = err?.status === 402;
      const serverMessage = typeof err?.data?.error === "string" ? err.data.error : null;
      const detail = isInsufficientFunds
        ? "Not enough wallet balance to apply this frame. Top up your workspace wallet and try again."
        : serverMessage ?? err?.message ?? "Something went wrong";
      toast({ title: isInsufficientFunds ? "Insufficient balance" : `Banner update failed (${step})`, description: detail, variant: "destructive" });
    } finally {
      setBannerUploading(false);
      onUploadingChange(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (!o && bannerPreviewUrl && bannerPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bannerPreviewUrl);
    onOpenChange(o);
  };

  const frameCostKey = (tier: string): string | null => {
    if (tier.startsWith('marketplace:')) return null;
    if (tier.startsWith('custom:')) return 'custom';
    return tier;
  };

  // Build preview card JSX (shared between framed and plain variants)
  const tc = bannerTextColor;
  const isHex = tc.startsWith("#");
  const colorStyle = isHex ? { color: tc } : {};
  const borderColorStyle = isHex ? { borderColor: tc, color: tc } : {};
  const mutedColorStyle = isHex ? { color: tc, opacity: 0.75 } : {};
  const bgBadge = isHex ? undefined : tc === "white" ? "rgba(0,0,0,0.35)" : tc === "black" ? "rgba(255,255,255,0.45)" : undefined;
  const borderClass = !isHex ? (tc === "white" ? "border-white" : tc === "black" ? "border-black" : "border-foreground") : "";

  const previewCardInner = (
    <div className="border-2 border-foreground bg-background flex flex-col font-mono text-foreground w-full cert-card-inner" style={{ position: 'relative' }}>
      <div className="px-3 py-3 flex flex-col gap-2 border-b-2 border-foreground relative overflow-hidden" style={{ aspectRatio: "300 / 140", ...colorStyle }}>
        {bannerPreviewUrl && (
          <>
            <img src={bannerPreviewUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: `${bannerCropX}% ${bannerCropY}%`, transform: `scale(${bannerCropZoom})`, transformOrigin: `${bannerCropX}% ${bannerCropY}%` }} />
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(255,255,255,${bannerOverlayOpacity})` }} />
          </>
        )}
        <div className="relative flex items-start justify-between gap-2">
          <div className={`border p-1.5 shrink-0 ${borderClass}`} style={{ ...borderColorStyle, ...(bgBadge ? { backgroundColor: bgBadge } : {}) }}>
            <Award className="h-3.5 w-3.5" />
          </div>
          <span className={`border-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${borderClass}`} style={{ ...borderColorStyle, ...(bgBadge ? { backgroundColor: bgBadge } : {}) }}>generated</span>
        </div>
        <div className="relative flex-1" />
        <div className="relative flex items-end justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px]">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="font-bold uppercase tracking-widest">
              {batch?.createdAt ? new Date(batch.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            </span>
          </div>
          <div className="text-right">
            <p className={`text-[9px] font-bold uppercase tracking-widest ${!isHex && tc !== "white" && tc !== "black" ? "text-muted-foreground" : ""}`} style={mutedColorStyle}>Issued For</p>
            <p className="text-xs font-bold break-words leading-snug">{batch?.name}</p>
          </div>
        </div>
      </div>
      <div className="flex">
        <span className="flex-1 flex items-center justify-center gap-1 bg-foreground text-background border-r-2 border-foreground px-2 py-2 text-[9px] font-black uppercase tracking-widest">
          <ExternalLink className="h-3 w-3 shrink-0" /> View
        </span>
        <span className="flex-1 flex items-center justify-center gap-1 bg-background px-2 py-2 text-[9px] font-black uppercase tracking-widest">
          <ShieldCheck className="h-3 w-3 shrink-0" /> Verify
        </span>
      </div>
    </div>
  );

  const isHudFrame = frameTier.startsWith('hud-');
  const isCustomFrame = frameTier.startsWith('custom:');
  const isMarketplaceFrame = frameTier.startsWith('marketplace:');
  const customFrameConfig = isCustomFrame
    ? customFrames.find((cf) => `custom:${cf.id}` === frameTier)?.config ?? null
    : isMarketplaceFrame
      ? ownedMarketplaceFrames.find(f => `marketplace:${f.listingId}` === frameTier)?.frameConfig ?? null
      : null;

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-h-[95vh] lg:h-[95vh] max-w-none flex flex-col p-4 sm:p-6 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>Event Banner</DialogTitle>
          <DialogDescription>
            Upload a banner image and preview exactly how it will appear on each student's certificate card.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row flex-1 gap-4 lg:gap-6 min-h-0 overflow-y-auto lg:overflow-hidden">

          {/* Left: upload + crop zone */}
          <div className="flex flex-col gap-3 w-full lg:flex-1 lg:min-h-0">

            <label
              className="shrink-0 flex items-center gap-3 border-2 border-dashed border-border rounded-lg px-4 py-3 cursor-pointer hover:border-foreground transition-colors text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) handleBannerEditorFileChange(file);
              }}
            >
              <input type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleBannerEditorFileChange(file); e.target.value = ""; }}
              />
              <Upload className="w-4 h-4 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs">{bannerPreviewFile ? bannerPreviewFile.name : "Click or drag & drop an image"}</span>
                {!bannerPreviewFile && <span className="text-[10px] text-muted-foreground/60">Aspect ratio 15:7 (300×140) · max 1 MB</span>}
              </div>
            </label>

            <div ref={cropContainerRef}
              className="h-48 sm:h-64 lg:flex-1 lg:min-h-0 relative overflow-hidden rounded border-2 border-border select-none bg-muted/20 flex items-center justify-center">
              {bannerPreviewUrl ? (
                <>
                  <img ref={cropImageRef} src={bannerPreviewUrl} alt="" draggable={false}
                    onLoad={updateImageBounds}
                    className="max-w-full max-h-full w-auto h-auto pointer-events-none block" />
                  {imageBounds && (() => {
                    const { left: il, top: it, width: iw, height: ih } = imageBounds;
                    const oc_w = Math.min(iw, ih * CARD_BANNER_ASPECT);
                    const oc_h = oc_w / CARD_BANNER_ASPECT;
                    const cw = oc_w / bannerCropZoom;
                    const ch = oc_h / bannerCropZoom;
                    const cx = il + (bannerCropX / 100) * iw;
                    const cy = it + (bannerCropY / 100) * ih;
                    const rl = Math.max(il, cx - cw / 2);
                    const rt = Math.max(it, cy - ch / 2);
                    const rr = Math.min(il + iw, rl + cw);
                    const rb = Math.min(it + ih, rt + ch);
                    return (
                      <>
                        <div className="absolute left-0 right-0 bg-black/55 pointer-events-none" style={{ top: 0, height: rt }} />
                        <div className="absolute left-0 right-0 bg-black/55 pointer-events-none" style={{ top: rb, bottom: 0 }} />
                        <div className="absolute bg-black/55 pointer-events-none" style={{ top: rt, height: rb - rt, left: 0, width: rl }} />
                        <div className="absolute bg-black/55 pointer-events-none" style={{ top: rt, height: rb - rt, left: rr, right: 0 }} />
                        <div className="absolute border-2 border-white cursor-move"
                          style={{ top: rt, left: rl, width: rr - rl, height: rb - rt }}
                          onMouseDown={handleCropRectDragStart}
                          onTouchStart={handleCropRectTouchStart}>
                          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white" />
                          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white" />
                          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white" />
                          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white" />
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Upload an image to crop</div>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0">Zoom</span>
              <Slider min={100} max={300} step={5}
                value={[Math.round(bannerCropZoom * 100)]}
                onValueChange={([v]) => {
                  const z = v / 100;
                  setBannerCropZoom(z);
                  const minXY = 50 / z;
                  setBannerCropX(x => Math.max(minXY, Math.min(100 - minXY, x)));
                  setBannerCropY(y => Math.max(minXY, Math.min(100 - minXY, y)));
                }}
                className="flex-1" />
              <span className="text-xs text-muted-foreground font-mono w-8 text-right">{Math.round(bannerCropZoom * 100)}%</span>
            </div>
            <p className="shrink-0 text-[10px] text-muted-foreground">Drag the crop box to reposition · slider to resize it</p>
          </div>

          {/* Right: appearance controls + live preview */}
          <div className="flex flex-col gap-4 sm:gap-5 w-full lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:min-h-0 themed-scroll">

            {/* Overlay opacity */}
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Overlay opacity</p>
                <span className="text-xs text-muted-foreground font-mono">{Math.round(bannerOverlayOpacity * 100)}%</span>
              </div>
              <Slider min={0} max={100} step={1}
                value={[Math.round(bannerOverlayOpacity * 100)]}
                onValueChange={([v]) => setBannerOverlayOpacity(v / 100)}
                className="w-full" />
              <p className="text-[10px] text-muted-foreground">0% = fully visible · 100% = hidden</p>
            </div>

            {/* Text colour */}
            <div className="space-y-2 shrink-0">
              <p className="text-sm font-medium">Text &amp; icon colour</p>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setBannerTextColor("default")}
                  className={`px-3 py-1.5 text-xs font-semibold border-2 rounded transition-all ${bannerTextColor === "default" ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/50"}`}
                >Default</button>
                {["#FFFFFF","#000000","#FFD700","#00E5FF","#FF6B6B","#CCFF00","#FF9800","#E040FB"].map((hex) => (
                  <button key={hex} title={hex} onClick={() => setBannerTextColor(hex)}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{ backgroundColor: hex, borderColor: bannerTextColor === hex ? "#000" : "#ccc", boxShadow: bannerTextColor === hex ? "0 0 0 2px #fff, 0 0 0 4px #000" : undefined }} />
                ))}
                <label title="Custom colour"
                  className="w-7 h-7 rounded-full border-2 cursor-pointer overflow-hidden shrink-0 transition-all"
                  style={{
                    background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                    borderColor: (bannerTextColor.startsWith("#") && !["#FFFFFF","#000000","#FFD700","#00E5FF","#FF6B6B","#CCFF00","#FF9800","#E040FB"].includes(bannerTextColor)) ? "#000" : "#ccc",
                    boxShadow: (bannerTextColor.startsWith("#") && !["#FFFFFF","#000000","#FFD700","#00E5FF","#FF6B6B","#CCFF00","#FF9800","#E040FB"].includes(bannerTextColor)) ? "0 0 0 2px #fff, 0 0 0 4px #000" : undefined,
                  }}>
                  <input type="color" className="opacity-0 w-full h-full cursor-pointer"
                    value={bannerTextColor.startsWith("#") ? bannerTextColor : "#ffffff"}
                    onChange={(e) => setBannerTextColor(e.target.value.toUpperCase())} />
                </label>
              </div>
              {bannerTextColor.startsWith("#") && (
                <p className="text-[10px] text-muted-foreground font-mono">{bannerTextColor}</p>
              )}
            </div>

            {/* Frame style picker */}
            {(() => {
              const paidFrames: string[] = batch?.paidFrames ?? [];
              const costKey = frameCostKey(frameTier);
              const isPaidFrame = frameTier !== 'none' && costKey !== null && !paidFrames.includes(frameTier);
              const frameCost = isPaidFrame && costKey ? (frameCosts[costKey] ?? 0) : 0;
              const canAfford = walletBalance >= frameCost;
              return (
                <div className="space-y-2 shrink-0">
                  <p className="text-sm font-medium">Certificate frame</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 themed-scroll">
                    {FRAME_OPTIONS.map((opt) => {
                      const selected = frameTier === opt.value;
                      const isHudOpt = !!opt.hudType;
                      const alreadyOwned = opt.value !== 'none' && paidFrames.includes(opt.value);
                      const optCost = opt.value !== 'none' && !alreadyOwned ? (frameCosts[opt.value] ?? 0) : 0;
                      return (
                        <button key={opt.value} type="button" onClick={() => setFrameTier(opt.value)}
                          className={`shrink-0 flex flex-col items-center gap-1 p-1 rounded transition-opacity ${selected ? 'ring-2 ring-foreground opacity-100' : 'opacity-60 hover:opacity-90'}`}>
                          <div className="relative" style={{ width: 40, height: 54 }}>
                            {opt.value === 'none' ? (
                              <div className="w-full h-full border-2 border-dashed border-border rounded" />
                            ) : isHudOpt ? (
                              <div className="w-full h-full rounded relative overflow-hidden" style={{ background: `${opt.hudColor}12` }}>
                                <svg viewBox="0 0 180 240" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} xmlns="http://www.w3.org/2000/svg">
                                  {opt.hudType === 'grid' ? (<>
                                    <rect x="0" y="0" width="180" height="240" fill="none" stroke={opt.hudColor} strokeWidth="2"/>
                                    <path d="M 0 50 L 0 0 L 50 0" fill="none" stroke={opt.hudColor} strokeWidth="9"/>
                                    <path d="M 130 0 L 180 0 L 180 50" fill="none" stroke={opt.hudColor} strokeWidth="9"/>
                                    <path d="M 0 190 L 0 240 L 50 240" fill="none" stroke={opt.hudColor} strokeWidth="9"/>
                                    <path d="M 130 240 L 180 240 L 180 190" fill="none" stroke={opt.hudColor} strokeWidth="9"/>
                                    <rect x="0" y="0" width="18" height="18" fill={opt.hudColor}/>
                                    <rect x="162" y="0" width="18" height="18" fill={opt.hudColor}/>
                                    <rect x="0" y="222" width="18" height="18" fill={opt.hudColor}/>
                                    <rect x="162" y="222" width="18" height="18" fill={opt.hudColor}/>
                                    {[55,80,100,125].map((cx, i) => (
                                      <circle key={cx} cx={cx} cy="10" r="5" fill={opt.hudColor}>
                                        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" begin={`${i*0.3}s`} repeatCount="indefinite"/>
                                      </circle>
                                    ))}
                                  </>) : opt.hudType === 'command' ? (<>
                                    <rect x="0" y="0" width="180" height="28" fill={opt.hudColor} opacity="0.9"/>
                                    {[8,16,24,32,40,48,56].map(x => <rect key={x} x={x} y="5" width="5" height="18" fill={opt.hudColor} opacity="0.22"/>)}
                                    <line x1="0" y1="28" x2="0" y2="240" stroke={opt.hudColor} strokeWidth="2.5"/>
                                    <line x1="180" y1="28" x2="180" y2="240" stroke={opt.hudColor} strokeWidth="2.5"/>
                                    <line x1="0" y1="240" x2="180" y2="240" stroke={opt.hudColor} strokeWidth="2.5"/>
                                    {[106,118,130,142].map(y => (
                                      <rect key={y} x="0" y={y} width="12" height="8" fill="none" stroke={opt.hudColor} strokeWidth="1.5"/>
                                    ))}
                                    <line x1="126" y1="240" x2="152" y2="210" stroke={opt.hudColor} strokeWidth="3"/>
                                    <line x1="144" y1="240" x2="170" y2="210" stroke={opt.hudColor} strokeWidth="3"/>
                                  </>) : null}
                                </svg>
                              </div>
                            ) : (
                              <div className={`cert-frame-wrapper frame-${opt.value}`} style={{ width: '100%', height: '100%', borderRadius: 2 }}>
                                <div style={{ width: '100%', height: '100%', background: 'var(--background)', borderRadius: 1 }} />
                              </div>
                            )}
                            {selected && (
                              <div className="absolute -top-1 -right-1 bg-foreground text-background rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                <Check className="w-2 h-2" />
                              </div>
                            )}
                            {alreadyOwned ? (
                              <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                                <span className="text-[7px] font-bold bg-green-600 text-white px-1 leading-tight">owned</span>
                              </div>
                            ) : optCost > 0 ? (
                              <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                                <span className="text-[7px] font-bold bg-foreground text-background px-1 leading-tight">₹{optCost}</span>
                              </div>
                            ) : null}
                          </div>
                          <span className="text-[9px] font-medium text-center leading-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                    {/* Workspace custom frames */}
                    {customFrames.map((cf) => {
                      const tier = `custom:${cf.id}`;
                      const selected = frameTier === tier;
                      const alreadyOwned = paidFrames.includes(tier);
                      const optCost = !alreadyOwned ? (frameCosts['custom'] ?? 0) : 0;
                      return (
                        <button key={tier} type="button" onClick={() => setFrameTier(tier)}
                          className={`shrink-0 flex flex-col items-center gap-1 p-1 rounded transition-opacity ${selected ? 'ring-2 ring-foreground opacity-100' : 'opacity-60 hover:opacity-90'}`}>
                          <div className="relative" style={{ width: 40, height: 54 }}>
                            {cf.config ? (
                              <CustomFrameRenderer frameId={cf.id} config={cf.config}>
                                <div style={{ width: 40, height: 54, background: 'var(--background)' }} />
                              </CustomFrameRenderer>
                            ) : (
                              <div style={{ width: 40, height: 54, background: 'var(--background)', border: '1px solid var(--border)' }} />
                            )}
                            {selected && (
                              <div className="absolute -top-1 -right-1 bg-foreground text-background rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                <Check className="w-2 h-2" />
                              </div>
                            )}
                            {alreadyOwned ? (
                              <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                                <span className="text-[7px] font-bold bg-green-600 text-white px-1 leading-tight">owned</span>
                              </div>
                            ) : optCost > 0 ? (
                              <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                                <span className="text-[7px] font-bold bg-foreground text-background px-1 leading-tight">₹{optCost}</span>
                              </div>
                            ) : null}
                          </div>
                          <span className="text-[9px] font-medium text-center leading-tight truncate max-w-[40px]">{cf.name}</span>
                        </button>
                      );
                    })}
                    {/* Owned marketplace frames */}
                    {ownedMarketplaceFrames.map((mf) => {
                      const tier = `marketplace:${mf.listingId}`;
                      const selected = frameTier === tier;
                      return (
                        <button key={tier} type="button" onClick={() => setFrameTier(tier)}
                          className={`shrink-0 flex flex-col items-center gap-1 p-1 rounded transition-opacity ${selected ? 'ring-2 ring-foreground opacity-100' : 'opacity-60 hover:opacity-90'}`}>
                          <div className="relative" style={{ width: 40, height: 54 }}>
                            {mf.frameConfig ? (
                              <CustomFrameRenderer frameId={mf.listingId} config={mf.frameConfig}>
                                <div style={{ width: 40, height: 54, background: 'var(--background)' }} />
                              </CustomFrameRenderer>
                            ) : (
                              <div style={{ width: 40, height: 54, background: 'var(--background)', border: '1px solid var(--border)' }} />
                            )}
                            {selected && (
                              <div className="absolute -top-1 -right-1 bg-foreground text-background rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                <Check className="w-2 h-2" />
                              </div>
                            )}
                            <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                              <span className="text-[7px] font-bold bg-green-600 text-white px-1 leading-tight">owned</span>
                            </div>
                          </div>
                          <span className="text-[9px] font-medium text-center leading-tight truncate max-w-[40px]">{mf.name}</span>
                        </button>
                      );
                    })}
                    {/* Design new frame button */}
                    <button type="button" onClick={() => setDesignerOpen(true)}
                      className="shrink-0 flex flex-col items-center gap-1 p-1 rounded opacity-60 hover:opacity-90 transition-opacity">
                      <div className="relative flex items-center justify-center border-2 border-dashed border-foreground/40 rounded" style={{ width: 40, height: 54 }}>
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-medium text-center leading-tight">New</span>
                    </button>
                    {/* Browse marketplace button */}
                    <button type="button" onClick={() => setMarketplaceOpen(true)}
                      className="shrink-0 flex flex-col items-center gap-1 p-1 rounded opacity-60 hover:opacity-90 transition-opacity">
                      <div className="relative flex items-center justify-center border-2 border-dashed border-foreground/40 rounded" style={{ width: 40, height: 54 }}>
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-medium text-center leading-tight">Browse</span>
                    </button>
                  </div>
                  {isPaidFrame && (
                    <div className={`border-2 px-3 py-2 text-xs space-y-0.5 ${canAfford ? 'border-foreground bg-foreground/5' : 'border-destructive bg-destructive/5 text-destructive'}`}>
                      <p className="font-bold uppercase tracking-widest">
                        {canAfford ? `₹${frameCost} will be deducted` : 'Insufficient balance'}
                      </p>
                      <p className="font-normal normal-case tracking-normal opacity-75">
                        {canAfford
                          ? `Workspace balance: ₹${walletBalance.toFixed(2)} → ₹${(walletBalance - frameCost).toFixed(2)}`
                          : `Need ₹${frameCost}, available ₹${walletBalance.toFixed(2)}. Top up your wallet to continue.`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Live card preview */}
            <div className="space-y-2 shrink-0">
              <p className="text-sm font-medium">Preview</p>
              {(isCustomFrame || isMarketplaceFrame) && customFrameConfig ? (
                <CustomFrameRenderer frameId={isCustomFrame ? frameTier.slice(7) : frameTier.slice(12)} config={customFrameConfig}>
                  {previewCardInner}
                </CustomFrameRenderer>
              ) : frameTier !== 'none' ? (
                <div className={`cert-frame-wrapper frame-${frameTier}`} style={{ position: 'relative' }}>
                  {isHudFrame && <HudFrameByTier tier={frameTier} />}
                  {previewCardInner}
                </div>
              ) : previewCardInner}
              <p className="text-[10px] text-muted-foreground">Live preview of the student's public profile card.</p>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex justify-end gap-2 pt-4 border-t border-border mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {(() => {
            const paidFrames: string[] = batch?.paidFrames ?? [];
            const costKey2 = frameCostKey(frameTier);
            const isPaidFrame = frameTier !== 'none' && costKey2 !== null && !paidFrames.includes(frameTier);
            const frameCost = isPaidFrame && costKey2 ? (frameCosts[costKey2] ?? 0) : 0;
            const canAfford = walletBalance >= frameCost;
            return (
              <Button onClick={handleConfirm} disabled={bannerUploading || (isPaidFrame && !canAfford)}>
                {bannerUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {bannerUploading ? "Uploading…" : isPaidFrame && frameCost > 0 ? `Save Banner — ₹${frameCost}` : "Save Banner"}
              </Button>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>

    <CustomFrameDesigner
      open={designerOpen}
      onOpenChange={setDesignerOpen}
      onSaved={(tier, name, config) => {
        setCustomFrames((prev) => {
          const id = tier.slice(7);
          return [...prev, { id, name, config }];
        });
        setFrameTier(tier);
        setDesignerOpen(false);
      }}
    />
    <MarketplaceBrowseDialog
      open={marketplaceOpen}
      onOpenChange={setMarketplaceOpen}
      onFrameSelected={(tier, name, config) => {
        const listingId = tier.slice(12);
        setOwnedMarketplaceFrames(prev => {
          if (prev.some(f => f.listingId === listingId)) return prev;
          return [...prev, { listingId, name, frameConfig: config }];
        });
        setFrameTier(tier);
      }}
    />
    </>
  );
}
