import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useClientGenerate } from "@/hooks/useClientGenerate";
import { useApproval } from "@/hooks/use-approval";
import { useAuth } from "@/hooks/use-auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBatch,
  useSendBatch,
  useShareBatchFolder,
  getGetBatchQueryKey,
  useSendBatchWhatsapp,
  useSendCertEmail,
  useSendCertWhatsapp,
  useSyncBatch,
  useGetWalletBalance,
  useUpdateBatchFields,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { BatchHeader } from "./components/BatchHeader";
import { BatchStatsCards } from "./components/BatchStatsCards";
import { BatchGenerationProgress } from "./components/BatchGenerationProgress";
import { BatchCertificatesTable } from "./components/BatchCertificatesTable";
import { BatchBannerEditor } from "./components/BatchBannerEditor";
import { BatchSendEmailModal } from "./components/BatchSendEmailModal";
import { BatchSendWaModal } from "./components/BatchSendWaModal";
import { BatchIndivEmailModal } from "./components/BatchIndivEmailModal";
import { BatchIndivWaModal } from "./components/BatchIndivWaModal";
import { BatchIssueReportDialog, type ReportDetail } from "./components/BatchIssueReportDialog";
import { useWaReports } from "./hooks/useWaReports";

export default function BatchDetail() {
  const [, params] = useRoute("/batches/:id");
  const batchId = params?.id ?? "";
  const { isApproved } = useApproval();
  const { data: balanceData, refetch: refetchBalance } = useGetWalletBalance({
    query: { enabled: isApproved }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { connectGoogle } = useAuth();
  const [showConnectDriveDialog, setShowConnectDriveDialog] = useState(false);

  const { mutate: updateBatchFields, isPending: isRenaming } = useUpdateBatchFields({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBatchQueryKey(batchId) });
        toast({ title: "Batch renamed" });
      },
      onError: (err: any) => {
        toast({ title: "Rename failed", description: err?.message, variant: "destructive" });
      },
    },
  });
  const handleRename = (newName: string) => updateBatchFields({ batchId, data: { name: newName } });

  const { data: batch, isLoading, error: batchError, refetch } = useGetBatch(batchId as any, {
    query: {
      enabled: !!batchId,
      refetchInterval: (query: any) => {
        const status = (query.state.data as any)?.status;
        return status === "generating" || status === "sending" ? 2000 : false;
      }
    } as any
  });

  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waVar1, setWaVar1] = useState("");
  const [waVar2, setWaVar2] = useState("");
  const [waVar3, setWaVar3] = useState("<<EmailPrefix>>");

  const [indivEmailCert, setIndivEmailCert] = useState<any | null>(null);
  const [indivEmailSubject, setIndivEmailSubject] = useState("");
  const [indivEmailBody, setIndivEmailBody] = useState("");
  const [indivWaCert, setIndivWaCert] = useState<any | null>(null);
  const [indivWaVar1, setIndivWaVar1] = useState("");
  const [indivWaVar2, setIndivWaVar2] = useState("");
  const [indivWaVar3, setIndivWaVar3] = useState("<<EmailPrefix>>");


  const [activeReport, setActiveReport] = useState<{ cert: any; report: ReportDetail } | null>(null);

  const [deleteCert, setDeleteCert] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingCert, setIsDeletingCert] = useState(false);

  const handleConfirmDeleteCert = async () => {
    if (!deleteCert) return;
    setIsDeletingCert(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      const wsId = localStorage.getItem("cephlow_active_workspace");
      const res = await fetch(`${apiBase}/api/certificates/${deleteCert.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, ...(wsId ? { "x-workspace-id": wsId } : {}) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete recipient");
      }
      toast({ title: "Recipient removed", description: `${deleteCert.recipientName}'s certificate and data have been deleted.` });
      setDeleteCert(null);
      setDeleteConfirmText("");
      queryClient.invalidateQueries({ queryKey: getGetBatchQueryKey(batchId) });
      refetch();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeletingCert(false);
    }
  };

  const { getCertKey, certHasReport, getCertReport } = useWaReports(batch);

  const { mutate: syncData, isPending: isSyncing } = useSyncBatch({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: "Batch Synced!", description: data.message || "Spreadsheet data synced successfully." });
        refetch();
      },
      onError: (err: any) => toast({ title: "Sync failed", description: err.message || err.data?.error, variant: "destructive" })
    }
  });

  // Auto-sync when returning from the spreadsheet editor (?synced=1)
  const [, setLocation] = useLocation();
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current || !batch || isSyncing) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("synced") !== "1") return;
    autoSyncedRef.current = true;
    // Strip the param from the URL without a reload
    setLocation(`/batches/${batchId}`, { replace: true });
    syncData({ batchId });
  }, [batch, batchId, isSyncing, syncData, setLocation]);

  const { mutate: sendCerts, isPending: isSending } = useSendBatch({
    mutation: {
      onSuccess: () => { toast({ title: "Sending started!" }); setSendModalOpen(false); refetch(); },
      onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" })
    }
  });

  const { mutate: shareFolder, isPending: isSharing } = useShareBatchFolder({
    mutation: {
      onMutate: () => {
        if (!batch?.pdfFolderId) {
          toast({ title: "Uploading to Drive...", description: "Uploading certificates to Google Drive. This may take a moment.", duration: Infinity });
        }
      },
      onSuccess: (data: any) => {
        toast({
          title: "Folder Shared!",
          description: "Anyone with the link can now view the PDF certificates.",
          action: (
            <Button variant="outline" size="sm" asChild>
              <a href={data.shareLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Open Link
              </a>
            </Button>
          )
        });
      },
      onError: (err: any) => {
        if (err?.message?.includes("not connected") || err?.data?.code === "GOOGLE_NOT_CONNECTED") {
          setShowConnectDriveDialog(true);
        } else {
          toast({ title: "Sharing failed", description: err.message, variant: "destructive" });
        }
      }
    }
  });

  const { mutate: sendWhatsapp, isPending: isSendingWhatsapp } = useSendBatchWhatsapp({
    mutation: {
      onSuccess: () => { toast({ title: "WhatsApp sending started!" }); setWaModalOpen(false); refetch(); },
      onError: (err: any) => toast({ title: "WhatsApp send failed", description: err.message, variant: "destructive" })
    }
  });

  const { mutate: sendOneCertEmail, isPending: isSendingOne } = useSendCertEmail({
    mutation: {
      onSuccess: () => { toast({ title: "Certificate sent!" }); setIndivEmailCert(null); refetch(); },
      onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
    },
  });

  const { mutate: sendOneCertWa, isPending: isSendingOneWa } = useSendCertWhatsapp({
    mutation: {
      onSuccess: () => { toast({ title: "WhatsApp sent!" }); setIndivWaCert(null); refetch(); },
      onError: (err: any) => toast({ title: "WhatsApp send failed", description: err.message, variant: "destructive" }),
    },
  });

  const handleOpenIndivEmail = (cert: any) => {
    setIndivEmailCert(cert);
    setIndivEmailSubject((batch as any).emailSubject || DEFAULT_SUBJECT);
    setIndivEmailBody((batch as any).emailBody || DEFAULT_BODY);
  };

  const handleOpenIndivWa = (cert: any) => {
    setIndivWaCert(cert);
    setIndivWaVar1((batch as any).nameColumn ? `<<${(batch as any).nameColumn}>>` : "");
    setIndivWaVar2((batch as any).name || "");
  };

  const allCerts = (batch?.certificates || []) as any[];

  const sortedCertificates = [...allCerts].sort((a, b) => {
    const priority: Record<string, number> = { sent: 1, generated: 2, failed: 3, outdated: 4, generating: 5, pending: 6 };
    const pA = priority[a.status.toLowerCase()] || 99;
    const pB = priority[b.status.toLowerCase()] || 99;
    if (pA !== pB) return pA - pB;
    return (a.recipientName || "").localeCompare(b.recipientName || "");
  });

  const pendingCount = allCerts.filter((c: any) => ["pending", "failed"].includes(c.status)).length;
  const targetCerts = selectedCertIds.length > 0 ? allCerts.filter((c: any) => selectedCertIds.includes(c.id)) : allCerts;
  const unpaidCount = targetCerts.filter((c: any) => !c.isPaid).length;
  const rate = isApproved ? Number((balanceData as any)?.costs?.generation ?? 1.0) : 0;
  const estimatedCost = unpaidCount * rate;
  const canResumeAll = selectedCertIds.length === 0 && pendingCount > 0;

  const generateBtnText = selectedCertIds.length > 0
    ? (unpaidCount > 0 ? `Generate Selected (${selectedCertIds.length})` : `Regenerate (${selectedCertIds.length})`)
    : batch?.status === "partial"
      ? `Resume (${pendingCount} remaining)`
      : `Generate All (${pendingCount})`;

  const { generate: clientGenerateFn, cancel: cancelGeneration, isGenerating, progress: genProgress } = useClientGenerate();

  const handleGenerate = async () => {
    try {
      const result = await clientGenerateFn(batchId, selectedCertIds.length > 0 ? selectedCertIds : undefined);
      toast({
        title: result.failed === 0 ? "Generation complete!" : "Generation partially complete",
        description: result.failed === 0
          ? `All ${result.generated} certificates generated successfully.`
          : `${result.generated} generated, ${result.failed} failed.`,
        variant: result.failed > 0 ? "destructive" : undefined,
      });
      refetch();
      if (isApproved) refetchBalance();
    } catch (err: any) {
      const isCancelled = err.message === "Generation cancelled";
      const isLowBalance = err.message?.includes('Insufficient funds') || err.message?.includes('402');
      toast({
        title: isCancelled ? "Generation cancelled" : isLowBalance ? "Insufficient Balance" : "Generation failed",
        description: isCancelled
          ? "Generation was cancelled. Certificates processed so far have been saved."
          : isLowBalance
          ? "Your wallet balance is too low to generate this batch. Please add credits to continue."
          : (err.message || "An unexpected error occurred"),
        variant: isCancelled ? undefined : "destructive",
        action: isLowBalance ? <Button variant="outline" size="sm" onClick={() => window.location.href = '/wallet'}>Top Up</Button> : undefined
      });
      setTimeout(() => { refetch(); if (isApproved) refetchBalance(); }, 600);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-foreground text-background border-foreground';
      case 'generated': return 'bg-secondary text-secondary-foreground border-border';
      case 'generating': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'outdated': return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'failed': return 'bg-background text-foreground border-foreground';
      default: return 'bg-background text-muted-foreground border-border';
    }
  };

  // Stuck-batch auto-recovery
  useEffect(() => {
    if (batch?.status !== "generating" || isGenerating) return;

    const timer = setTimeout(async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
        const wsId = localStorage.getItem("cephlow_active_workspace");
        const res = await fetch(`${apiBaseUrl}/api/batches/${batchId}/recover-stuck`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, ...(wsId ? { "x-workspace-id": wsId } : {}) },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.recovered) {
          refetch();
          toast({
            title: "Generation interrupted",
            description:
              data.status === "partial"
                ? `Previous session was interrupted. ${data.doneCount}/${data.totalCount} certificates were saved. Click Resume to continue.`
                : data.status === "generated"
                ? "All certificates were already generated — status has been corrected."
                : "No certificates were saved from the previous session. You can start again.",
          });
        }
      } catch { /* best-effort */ }
    }, 2000);

    return () => clearTimeout(timer);
  }, [batch?.status, isGenerating, batchId, refetch, toast]);

  // Auto-sync student profiles for approved orgs
  useEffect(() => {
    if (!isApproved || !batchId) return;
    const status = batch?.status;
    if (status !== "sent" && status !== "generated" && status !== "partial") return;

    (async () => {
      try {
        const { supabase } = await import("@/lib/supabase");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;
        const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
        const wsId = localStorage.getItem("cephlow_active_workspace");
        await fetch(`${apiBase}/api/batches/${batchId}/sync-profiles`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, ...(wsId ? { "x-workspace-id": wsId } : {}) },
        });
      } catch { /* best-effort */ }
    })();
  }, [batchId, batch?.status, isApproved]);

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!batch) return (
    <div className="p-8 text-center text-muted-foreground space-y-1">
      <div>Batch not found</div>
      {batchError && <div className="text-xs text-destructive">{(batchError as any)?.message || String(batchError)}</div>}
    </div>
  );

  const handleOpenSend = () => { setEmailSubject(batch.emailSubject || DEFAULT_SUBJECT); setEmailBody(batch.emailBody || DEFAULT_BODY); setSendModalOpen(true); };
  const handleOpenWa = () => { setWaVar1(batch.nameColumn ? `<<${batch.nameColumn}>>` : ""); setWaVar2(batch.name || ""); setWaModalOpen(true); };
  const rowDataHeaders: string[] = batch.certificates[0]?.rowData ? Object.keys(batch.certificates[0].rowData) : [];
  const DEFAULT_SUBJECT = "Your Certificate is ready!";
  const DEFAULT_BODY = `Hi <<${batch.nameColumn || "name"}>>,\n\nPlease find your certificate for ${batch.name} attached.\n\nBest,\nThe Team`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <BatchHeader
        batch={batch}
        batchId={batchId}
        isGenerating={isGenerating}
        isSharing={isSharing}
        isSending={isSending}
        isSendingWhatsapp={isSendingWhatsapp}
        bannerUploading={bannerUploading}
        generateBtnText={generateBtnText}
        canResumeAll={canResumeAll}
        selectedCertIds={selectedCertIds}
        getStatusColor={getStatusColor}
        onGenerate={handleGenerate}
        onCancelGeneration={cancelGeneration}
        onShare={() => shareFolder({ batchId })}
        onBannerEdit={() => setBannerEditorOpen(true)}
        onOpenSend={handleOpenSend}
        onOpenWa={handleOpenWa}
        onRename={handleRename}
        isRenaming={isRenaming}
      />

      {/* Cost calculation & balance check */}
      {isApproved && (pendingCount > 0 || selectedCertIds.length > 0) && (
        <div className={`p-4 border-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
          (balanceData?.currentBalance ?? 0) < estimatedCost
            ? "border-destructive bg-destructive/5 text-destructive"
            : "border-foreground bg-muted/20 text-foreground"
        }`}>
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest">
              Estimated Generation Cost
            </p>
            <p className="text-xs normal-case tracking-normal">
              Rate: <span className="font-bold font-mono">{rate} credits</span>/new cert.
              {selectedCertIds.length > 0 ? " Selected: " : " Batch remaining: "}
              <span className="font-bold font-mono">{unpaidCount} new</span>.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-black font-mono">
              {estimatedCost.toFixed(2)} credits
            </p>
            {(balanceData?.currentBalance ?? 0) < estimatedCost ? (
              <p className="text-[10px] font-bold uppercase tracking-widest text-destructive animate-pulse mt-0.5">
                ⚠️ Insufficient balance (Available: {balanceData?.currentBalance ?? 0} credits)
              </p>
            ) : (
              <p className="text-[10px] font-bold uppercase tracking-widest text-green-600 mt-0.5">
                ✓ Balance sufficient (Available: {balanceData?.currentBalance ?? 0} credits)
              </p>
            )}
          </div>
        </div>
      )}

      <BatchStatsCards
        totalCount={batch.totalCount}
        generatedCount={batch.generatedCount}
        sentCount={batch.sentCount}
      />

      <BatchGenerationProgress
        isGenerating={isGenerating}
        genProgress={genProgress}
        isApproved={isApproved}
        onCancel={cancelGeneration}
      />

      <BatchCertificatesTable
        batch={batch}
        sortedCertificates={sortedCertificates}
        selectedCertIds={selectedCertIds}
        onSelectionChange={setSelectedCertIds}
        certHasReport={certHasReport}
        getCertReport={getCertReport}
        onReportClick={setActiveReport}
        onIndivEmail={handleOpenIndivEmail}
        onIndivWa={handleOpenIndivWa}
        onDelete={(cert) => { setDeleteCert(cert); setDeleteConfirmText(""); }}
        batchId={batchId}
        getStatusColor={getStatusColor}
      />

      <BatchSendEmailModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        emailSubject={emailSubject}
        onSubjectChange={setEmailSubject}
        emailBody={emailBody}
        onBodyChange={setEmailBody}
        isSending={isSending}
        onSend={() => sendCerts({ batchId: batchId as any, data: { emailSubject, emailBody } })}
        batchName={batch.name}
        rowDataHeaders={rowDataHeaders}
      />

      <BatchIndivEmailModal
        cert={indivEmailCert}
        onClose={() => setIndivEmailCert(null)}
        emailSubject={indivEmailSubject}
        onSubjectChange={setIndivEmailSubject}
        emailBody={indivEmailBody}
        onBodyChange={setIndivEmailBody}
        isSending={isSendingOne}
        onSend={() => sendOneCertEmail({ batchId, certId: indivEmailCert?.id, data: { emailSubject: indivEmailSubject, emailBody: indivEmailBody } })}
      />

      <BatchIndivWaModal
        cert={indivWaCert}
        onClose={() => setIndivWaCert(null)}
        var1={indivWaVar1} onVar1Change={setIndivWaVar1}
        var2={indivWaVar2} onVar2Change={setIndivWaVar2}
        var3={indivWaVar3} onVar3Change={setIndivWaVar3}
        isSending={isSendingOneWa}
        onSend={() => sendOneCertWa({ batchId, certId: indivWaCert?.id, data: { var1Template: indivWaVar1, var2Template: indivWaVar2, var3Template: indivWaVar3 } })}
      />

      <BatchSendWaModal
        open={waModalOpen}
        onOpenChange={setWaModalOpen}
        var1={waVar1} onVar1Change={setWaVar1}
        var2={waVar2} onVar2Change={setWaVar2}
        var3={waVar3} onVar3Change={setWaVar3}
        isSending={isSendingWhatsapp}
        onSend={() => sendWhatsapp({ batchId, data: { var1Template: waVar1, var2Template: waVar2, var3Template: waVar3 } })}
        batchName={batch.name}
        rowDataHeaders={rowDataHeaders}
      />

      <BatchBannerEditor
        open={bannerEditorOpen}
        onOpenChange={setBannerEditorOpen}
        batchId={batchId}
        batch={batch}
        walletBalance={balanceData?.currentBalance ?? 0}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: getGetBatchQueryKey(batchId) });
          if (isApproved) refetchBalance();
        }}
        onUploadingChange={setBannerUploading}
      />

      <BatchIssueReportDialog
        activeReport={activeReport}
        onClose={() => setActiveReport(null)}
        getCertKey={getCertKey}
      />

      <AlertDialog open={showConnectDriveDialog} onOpenChange={setShowConnectDriveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Google Drive Not Connected</AlertDialogTitle>
            <AlertDialogDescription>
              Sharing PDFs requires Google Drive access. Connect your Google Drive to upload and share the certificate folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowConnectDriveDialog(false); connectGoogle("drive"); }}>
              Connect Google Drive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCert} onOpenChange={(open) => { if (!open) { setDeleteCert(null); setDeleteConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recipient?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteCert?.recipientName}</strong>'s certificate, generated PDF, and any
              event/profile data linked to them in this batch. This cannot be undone.
              <br /><br />
              Type <strong>{deleteCert?.recipientName}</strong> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={deleteCert?.recipientName || ""}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteCert(null); setDeleteConfirmText(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== deleteCert?.recipientName || isDeletingCert}
              onClick={(e) => { e.preventDefault(); handleConfirmDeleteCert(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCert ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete Recipient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
