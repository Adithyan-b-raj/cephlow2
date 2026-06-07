import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LockedFeature } from "@/components/LockedFeature";
import { useApproval } from "@/hooks/use-approval";
import { useToast } from "@/hooks/use-toast";
import { Play, Send, Loader2, Share2, Link2, MessageCircle, RefreshCcw, Eye, X, ChevronDown, ChevronUp, Pencil, Check } from "lucide-react";
import { FileSpreadsheet, Table2 } from "lucide-react";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { useLocation } from "wouter";

interface Props {
  batch: any;
  batchId: string;
  isGenerating: boolean;
  isSyncing: boolean;
  isSharing: boolean;
  isSending: boolean;
  isSendingWhatsapp: boolean;
  bannerUploading: boolean;
  generateBtnText: string;
  canResumeAll: boolean;
  selectedCertIds: string[];
  generationLimit: number;
  getStatusColor: (status: string) => string;
  onGenerate: () => void;
  onCancelGeneration: () => void;
  onSync: () => void;
  onShare: () => void;
  onBannerEdit: () => void;
  onOpenSend: () => void;
  onOpenWa: () => void;
  onRename: (newName: string) => void;
  isRenaming?: boolean;
}

export function BatchHeader({
  batch, batchId, isGenerating, isSyncing, isSharing, isSending, isSendingWhatsapp,
  bannerUploading, generateBtnText, canResumeAll, selectedCertIds, generationLimit,
  getStatusColor, onGenerate, onCancelGeneration, onSync, onShare, onBannerEdit, onOpenSend, onOpenWa,
  onRename, isRenaming,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { isApproved } = useApproval();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const copyGalleryLink = () => {
    const slug = batch.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event";
    const url = `${window.location.origin}/event/${slug}/${batchId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: "Anyone with this link can view recipient names and their certificate PDFs (no email addresses shown)." });
  };
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(batch.name);

  const startEditingName = () => {
    setNameDraft(batch.name);
    setEditingName(true);
  };

  const commitNameEdit = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== batch.name) onRename(trimmed);
    setEditingName(false);
  };

  const isInbuilt = batch.dataSourceKind === "inbuilt";

  function EditSheetButton({ className }: { className?: string }) {
    if (isInbuilt) {
      return (
        <Button variant="outline" size="sm" className={`hover-elevate bg-background ${className ?? ""}`}
          onClick={() => setLocation(`/spreadsheets/${batch.spreadsheetId}`)}>
          <Table2 className="w-4 h-4 mr-1.5 text-blue-600" />
          Edit Sheet
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" asChild className={`hover-elevate bg-background ${className ?? ""}`} title="Edit Google Sheet">
        <a href={`https://docs.google.com/spreadsheets/d/${batch.sheetId}/edit`} target="_blank" rel="noopener noreferrer">
          <FileSpreadsheet className="w-4 h-4 mr-1.5 text-green-600" />
          Edit Sheet
        </a>
      </Button>
    );
  }

  const generateDisabled = isGenerating || batch.status === 'generating' || (!canResumeAll && selectedCertIds.length === 0);
  const sendDisabled = isSending || batch.status === 'sending' || batch.generatedCount === 0;
  const waDisabled = isSendingWhatsapp || batch.status === 'sending' || batch.generatedCount === 0;

  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-4">
      {/* Title */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNameEdit();
                  if (e.key === "Escape") setEditingName(false);
                }}
                disabled={isRenaming}
                className="h-9 text-xl sm:text-2xl font-display font-bold max-w-xs sm:max-w-md"
              />
              <Button size="icon" variant="ghost" onClick={commitNameEdit} disabled={isRenaming || !nameDraft.trim()} title="Save">
                {isRenaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)} disabled={isRenaming} title="Cancel">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group/title">
              <h1 className="text-xl sm:text-3xl font-display font-bold truncate">{batch.name}</h1>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 opacity-0 group-hover/title:opacity-100 transition-opacity"
                onClick={startEditingName}
                title="Rename batch"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Badge className={`uppercase shrink-0 ${getStatusColor(batch.status)}`}>
            {batch.status.toLowerCase() === 'outdated' ? (
              batch.certificates?.some((c: any) => c.status === 'outdated' && c.requiresVisualRegen)
                ? "Outdated (Visual)"
                : "Outdated (Info)"
            ) : batch.status}
          </Badge>
        </div>
        <p className="text-muted-foreground flex items-center gap-2 text-sm flex-wrap">
          <span>Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
          <span className="hidden sm:inline">•</span>
          <span className="flex items-center gap-1">
            {isInbuilt ? <Table2 className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5" />}
            {isInbuilt ? (batch.sheetName || "Inbuilt Spreadsheet") : batch.sheetName}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* Mobile: primary actions always visible */}
        <div className="flex items-center gap-2 md:hidden w-full">
          <div className="relative flex items-center gap-1 flex-1">
            <Button
              variant="outline" size="sm"
              onClick={onGenerate}
              disabled={generateDisabled}
              className="hover-elevate bg-background flex-1"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
              {isGenerating ? 'Generating…' : generateBtnText}
            </Button>
            {isGenerating && (
              <Button variant="ghost" size="sm" onClick={onCancelGeneration} className="px-2 shrink-0" title="Cancel">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          {isApproved ? (
            <Button
              onClick={onOpenWa}
              disabled={waDisabled}
              size="sm"
              className="hover-elevate flex-1"
            >
              {isSendingWhatsapp ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1.5" />}
              WhatsApp
            </Button>
          ) : (
            <Button
              onClick={onOpenSend}
              disabled={sendDisabled}
              size="sm"
              className="hover-elevate flex-1"
            >
              {isSending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Send
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="px-2 shrink-0 bg-background"
            onClick={() => setMoreOpen(v => !v)}
            aria-label={moreOpen ? "Hide options" : "More options"}
          >
            {moreOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Mobile: expandable secondary actions */}
        {moreOpen && (
          <div className="grid grid-cols-2 gap-2 md:hidden p-3 bg-secondary/40 rounded-xl border border-border/50">
            <EditSheetButton className="w-full justify-start" />
            <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing || batch.status === 'generating'} className="hover-elevate bg-background w-full justify-start">
              {isSyncing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-1.5" />}
              Sync Data
            </Button>
            <Button variant="outline" size="sm" onClick={onShare} disabled={isSharing || batch.generatedCount === 0} className="hover-elevate bg-background w-full justify-start">
              {isSharing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Share2 className="w-4 h-4 mr-1.5" />}
              Share PDFs
            </Button>
            <Button variant="outline" size="sm" onClick={copyGalleryLink} disabled={batch.generatedCount === 0} className="hover-elevate bg-background w-full justify-start" title="Copy a public link recipients can use to find their certificate">
              <Link2 className="w-4 h-4 mr-1.5" />
              Share Page
            </Button>
            <LockedFeature feature="custom event banners" inline>
              <Button variant="outline" size="sm" onClick={onBannerEdit} disabled={bannerUploading} className="hover-elevate bg-background w-full justify-start">
                {bannerUploading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Eye className="w-4 h-4 mr-1.5" />}
                {batch.bannerUrl ? "Edit Banner" : "Add Banner"}
              </Button>
            </LockedFeature>
            {/* Paid: Send Emails moves to dropdown. Free: WhatsApp stays here (locked). */}
            {isApproved ? (
              <Button variant="outline" size="sm" onClick={onOpenSend} disabled={sendDisabled} className="hover-elevate bg-background w-full justify-start">
                {isSending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                Send Emails
              </Button>
            ) : (
              <LockedFeature feature="WhatsApp delivery" inline>
                <Button variant="outline" size="sm" onClick={onOpenWa} disabled={waDisabled} className="hover-elevate bg-background w-full justify-start">
                  {isSendingWhatsapp ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1.5" />}
                  WhatsApp
                </Button>
              </LockedFeature>
            )}
            <p className="col-span-2 text-[10px] text-muted-foreground pt-1">
              Generation limit: {generationLimit.toLocaleString()}
            </p>
          </div>
        )}

        {/* Desktop: single compact row */}
        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
          {/* Data group */}
          <EditSheetButton />
          <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing || batch.status === 'generating'} className="hover-elevate bg-background">
            {isSyncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />}
            Sync Data
          </Button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Output group */}
          <Button variant="outline" size="sm" onClick={onShare} disabled={isSharing || batch.generatedCount === 0} className="hover-elevate bg-background">
            {isSharing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5 mr-1.5" />}
            Share PDFs
          </Button>
          <Button variant="outline" size="sm" onClick={copyGalleryLink} disabled={batch.generatedCount === 0} className="hover-elevate bg-background" title="Copy a public link recipients can use to find their certificate">
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            Share Page
          </Button>
          <LockedFeature feature="custom event banners" inline>
            <Button variant="outline" size="sm" onClick={onBannerEdit} disabled={bannerUploading} className="hover-elevate bg-background">
              {bannerUploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              {batch.bannerUrl ? "Edit Banner" : "Add Banner"}
            </Button>
          </LockedFeature>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Generate group */}
          <div className="flex items-center gap-1 min-w-[240px]">
            <Button size="sm" variant="outline" onClick={onGenerate} disabled={generateDisabled} className="hover-elevate bg-background min-w-[148px] justify-start">
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              {isGenerating ? 'Generating...' : generateBtnText}
            </Button>
            {isGenerating && (
              <Button variant="ghost" size="sm" onClick={onCancelGeneration} className="px-1.5" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              Limit: {generationLimit.toLocaleString()}
            </span>
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Send group */}
          <Button size="sm" onClick={onOpenSend} disabled={sendDisabled} className="hover-elevate">
            {isSending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Send Emails
          </Button>
          <LockedFeature feature="WhatsApp delivery" inline>
            <Button variant="outline" size="sm" onClick={onOpenWa} disabled={isSendingWhatsapp || batch.status === 'sending' || batch.generatedCount === 0} className="hover-elevate bg-background">
              {isSendingWhatsapp ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5 mr-1.5" />}
              WhatsApp
            </Button>
          </LockedFeature>
        </div>
      </div>
    </div>
  );
}
