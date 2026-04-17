import { useState } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBatch,
  useSendBatch,
  useShareBatchFolder,
  getGetBatchQueryKey,
  useSendBatchWhatsapp,
  useSendCertEmail,
  useSendCertWhatsapp,
  useGenerateSmartBatch,
  useSyncBatch,
  useGetWalletBalance,
} from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Play, Send, MailCheck, Loader2, FileText, CheckCircle2, XCircle, Clock, Share2, ExternalLink, QrCode, Copy, Check, MessageCircle, CheckCheck, Truck, RefreshCcw, Grid, Layout, Mail, Layers, Presentation, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

function QrCodePopover({ batchId, certId }: { batchId: string; certId: string }) {
  const [copied, setCopied] = useState(false);
  const verifyUrl = `${window.location.origin}/verify/${batchId}/${certId}`;
  // Add a timestamp for cache busting if available
  const qrSrc = `/api/verify/${batchId}/${certId}/qr`;

  const copyUrl = () => {
    navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="hover-elevate" title="View QR Code">
          <QrCode className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 text-center space-y-3" align="end">
        <p className="text-sm font-semibold text-foreground">Scan to Verify</p>
        <img src={qrSrc} alt="Certificate QR Code" className="w-40 h-40 mx-auto rounded-lg border" />
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={verifyUrl}
            className="flex-1 text-xs bg-muted rounded px-2 py-1 text-muted-foreground truncate border"
          />
          <Button variant="ghost" size="sm" onClick={copyUrl} className="shrink-0 px-2">
            {copied ? <Check className="w-3.5 h-3.5 text-foreground" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}



export default function BatchDetail() {
  const [, params] = useRoute("/batches/:id");
  const batchId = params?.id ?? "";

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: batch, isLoading, refetch } = useGetBatch(batchId as any, {
    query: {
      enabled: !!batchId,
      refetchInterval: (query: any) => {
        const status = (query.state.data as any)?.status;
        return status === "generating" || status === "sending" ? 2000 : false;
      }
    } as any
  });

  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);

  // Calculate unpaid count from selected certificates
  const targetCerts = selectedCertIds.length > 0 
    ? (batch?.certificates || []).filter((c: any) => selectedCertIds.includes(c.id))
    : (batch?.certificates || []);
  const unpaidCount = targetCerts.filter((c: any) => !c.isPaid).length;
  const visualRegenCount = targetCerts.filter((c: any) => c.isPaid && c.status === "outdated" && c.requiresVisualRegen).length;
  const infoRegenCount = targetCerts.filter((c: any) => c.isPaid && c.status === "outdated" && !c.requiresVisualRegen).length;

  const RATE = Number(import.meta.env.VITE_CERT_GENERATION_RATE || 1);
  const REGEN_RATE = Number(import.meta.env.VITE_CERT_REGENERATION_RATE || 0.2);
  const totalCost = (unpaidCount * RATE) + (visualRegenCount * REGEN_RATE);

  const generateBtnText = (unpaidCount > 0 ? `Generate Selected (${selectedCertIds.length})` : `Regenerate Selected (${selectedCertIds.length})`);

  const { data: balanceData, refetch: refetchBalance } = useGetWalletBalance();
  const currentBalance = balanceData?.currentBalance ?? 0;
  
  // Dynamic capacity based on what's available
  const generationLimit = Math.floor(currentBalance / RATE);

  const { mutate: generateCerts, isPending: isGenerating } = useGenerateSmartBatch({
    mutation: {
      onSuccess: () => {
        toast({ title: "Generation started!" });
        refetch();
        refetchBalance();
      },
      onError: (err: any) => {
        const isLowBalance = err.status === 402;
        toast({ 
          title: isLowBalance ? "Insufficient Balance" : "Generation failed", 
          description: isLowBalance 
            ? "Your wallet balance is too low to generate this batch. Please add credits to continue."
            : (err.data?.error || "An unexpected error occurred"),
          variant: "destructive",
          action: isLowBalance ? (
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/wallet'}>
              Top Up
            </Button>
          ) : undefined
        });
      }
    }
  });

  const { mutate: syncData, isPending: isSyncing } = useSyncBatch({
    mutation: {
      onSuccess: (data: any) => {
        toast({ 
          title: "Batch Synced!", 
          description: data.message || "Spreadsheet data synced successfully." 
        });
        refetch();
      },
      onError: (err: any) => toast({ title: "Sync failed", description: err.message || err.data?.error, variant: "destructive" })
    }
  });





  const { mutate: sendCerts, isPending: isSending } = useSendBatch({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sending started!" });
        setSendModalOpen(false);
        refetch();
      },
      onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" })
    }
  });

  const { mutate: shareFolder, isPending: isSharing } = useShareBatchFolder({
    mutation: {
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
      onError: (err: any) => toast({ title: "Sharing failed", description: err.message, variant: "destructive" })
    }
  });

  const { mutate: sendWhatsapp, isPending: isSendingWhatsapp } = useSendBatchWhatsapp({
    mutation: {
      onSuccess: () => {
        toast({ title: "WhatsApp sending started!" });
        setWaModalOpen(false);
        refetch();
      },
      onError: (err: any) => toast({ title: "WhatsApp send failed", description: err.message, variant: "destructive" })
    }
  });

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waVar1, setWaVar1] = useState("");
  const [waVar2, setWaVar2] = useState("");

  // Individual certificate send
  const [indivEmailCert, setIndivEmailCert] = useState<any | null>(null);
  const [indivEmailSubject, setIndivEmailSubject] = useState("");
  const [indivEmailBody, setIndivEmailBody] = useState("");
  const [indivWaCert, setIndivWaCert] = useState<any | null>(null);
  const [indivWaVar1, setIndivWaVar1] = useState("");
  const [indivWaVar2, setIndivWaVar2] = useState("");

  const { mutate: sendOneCertEmail, isPending: isSendingOne } = useSendCertEmail({
    mutation: {
      onSuccess: () => {
        toast({ title: "Certificate sent!" });
        setIndivEmailCert(null);
        refetch();
      },
      onError: (err: any) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
    },
  });

  const { mutate: sendOneCertWa, isPending: isSendingOneWa } = useSendCertWhatsapp({
    mutation: {
      onSuccess: () => {
        toast({ title: "WhatsApp sent!" });
        setIndivWaCert(null);
        refetch();
      },
      onError: (err: any) => toast({ title: "WhatsApp send failed", description: err.message, variant: "destructive" }),
    },
  });

  const handleOpenIndivEmail = (cert: any) => {
    setIndivEmailCert(cert);
    setIndivEmailSubject((batch as any).emailSubject || "");
    setIndivEmailBody((batch as any).emailBody || "");
  };

  const handleOpenIndivWa = (cert: any) => {
    setIndivWaCert(cert);
    setIndivWaVar1((batch as any).nameColumn ? `<<${(batch as any).nameColumn}>>` : "");
    setIndivWaVar2((batch as any).name || "");
  };

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!batch) return <div className="p-8 text-center text-muted-foreground">Batch not found</div>;

  const handleOpenSend = () => {
    setEmailSubject(batch.emailSubject || "");
    setEmailBody(batch.emailBody || "");
    setSendModalOpen(true);
  };

  const handleOpenWa = () => {
    setWaVar1(batch.nameColumn ? `<<${batch.nameColumn}>>` : "");
    setWaVar2(batch.name || "");
    setWaModalOpen(true);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-display font-bold">{batch.name}</h1>
            <Badge className={`uppercase ${getStatusColor(batch.status)}`}>
              {batch.status.toLowerCase() === 'outdated' ? (
                batch.certificates?.some((c: any) => c.status === 'outdated' && c.requiresVisualRegen) 
                  ? "Outdated (Visual)" 
                  : "Outdated (Info)"
              ) : batch.status}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-4 text-sm">
            <span>Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
            <span>•</span>
            <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> {batch.sheetName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          <Button
            variant="outline"
            size="sm"
            asChild
            className="hover-elevate bg-background"
            title="Edit Google Sheet"
          >
            <a href={`https://docs.google.com/spreadsheets/d/${batch.sheetId}/edit`} target="_blank" rel="noopener noreferrer">
              <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
              Edit Sheet
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncData({ batchId })}
            disabled={isSyncing || batch.status === 'generating'}
            className="hover-elevate bg-background"
            title="Pull latest data from Google Sheet"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Sync Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => shareFolder({ batchId })}
            disabled={isSharing || !(batch as any).pdfFolderId}
            className="hover-elevate bg-background"
          >
            {isSharing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
            Share PDFs
          </Button>
          <div className="relative flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateCerts({ batchId, selectedCertIds })}
              disabled={isGenerating || batch.status === 'generating' || selectedCertIds.length === 0}
              className="hover-elevate bg-background relative"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {generateBtnText}
            </Button>
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
              Generation Limit: {generationLimit.toLocaleString()}
            </span>
          </div>
          <Button
            onClick={handleOpenSend}
            disabled={isSending || batch.status === 'sending' || batch.generatedCount === 0}
            className="hover-elevate"
          >
            {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Emails
          </Button>
          <Button
            variant="outline"
            onClick={handleOpenWa}
            disabled={isSendingWhatsapp || batch.status === 'sending' || batch.generatedCount === 0}
            className="hover-elevate bg-background"
          >
            {isSendingWhatsapp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
            Send via WhatsApp
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-secondary rounded-xl"><FileText className="w-6 h-6 text-muted-foreground" /></div>
            <div>
              <div className="text-2xl font-bold font-display">{batch.totalCount}</div>
              <div className="text-sm font-medium text-muted-foreground">Total Recipients</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-secondary rounded-xl"><CheckCircle2 className="w-6 h-6 text-muted-foreground" /></div>
            <div>
              <div className="text-2xl font-bold font-display">{batch.generatedCount}</div>
              <div className="text-sm font-medium text-muted-foreground">Generated</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-secondary rounded-xl"><MailCheck className="w-6 h-6 text-muted-foreground" /></div>
            <div>
              <div className="text-2xl font-bold font-display">{batch.sentCount}</div>
              <div className="text-sm font-medium text-muted-foreground">Successfully Sent</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <Checkbox 
                    checked={batch.certificates?.length > 0 && selectedCertIds.length === batch.certificates.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCertIds(batch.certificates?.map((c: any) => c.id) || []);
                      } else {
                        setSelectedCertIds([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Sent At</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.certificates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No recipients found.</TableCell>
                </TableRow>
              ) : (
                batch.certificates.map((cert: any) => (
                  <TableRow key={cert.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={selectedCertIds.includes(cert.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedCertIds(prev => [...prev, cert.id]);
                          } else {
                            setSelectedCertIds(prev => prev.filter(id => id !== cert.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {cert.recipientName}
                        {cert.isPaid && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Paid</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{cert.recipientEmail}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={getStatusColor(cert.status)}>
                          {cert.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {cert.status === 'generating' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {cert.status.toLowerCase() === 'outdated' && (
                            <>
                              {cert.requiresVisualRegen ? (
                                <><AlertCircle className="w-3 h-3 mr-1" /> Outdated (Visual)</>
                              ) : (
                                <><Loader2 className="w-3 h-3 mr-1" /> Outdated (Info)</>
                              )}
                            </>
                          )}
                          {cert.status === 'generated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {cert.status === 'sent' && <MailCheck className="w-3 h-3 mr-1" />}
                          {cert.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                          {cert.status.toLowerCase() !== 'outdated' && cert.status}
                        </Badge>
                        {cert.status === 'failed' && cert.errorMessage && (
                          <span className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={cert.errorMessage}>
                            {cert.errorMessage}
                          </span>
                        )}
                        {cert.whatsappStatus && (
                          <Badge variant="outline" className={
                            cert.whatsappStatus === 'read'
                              ? 'border-blue-400 text-blue-600 bg-blue-50'
                              : cert.whatsappStatus === 'delivered'
                              ? 'border-green-400 text-green-600 bg-green-50'
                              : cert.whatsappStatus === 'wa_failed'
                              ? 'border-red-400 text-red-600 bg-red-50'
                              : 'border-border text-muted-foreground'
                          }>
                            {cert.whatsappStatus === 'read' && <CheckCheck className="w-3 h-3 mr-1" />}
                            {cert.whatsappStatus === 'delivered' && <Truck className="w-3 h-3 mr-1" />}
                            {cert.whatsappStatus === 'wa_failed' && <XCircle className="w-3 h-3 mr-1" />}
                            {cert.whatsappStatus === 'sent' && <MessageCircle className="w-3 h-3 mr-1" />}
                            WA: {cert.whatsappStatus === 'wa_failed' ? 'failed' : cert.whatsappStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {cert.sentAt ? format(new Date(cert.sentAt), 'MMM d, h:mm a') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {cert.slideUrl && (
                          <Button variant="ghost" size="sm" asChild className="hover-elevate">
                            <a href={`${cert.slideUrl}${cert.slideUrl.includes('?') ? '&' : '?'}v=${cert.updatedAt ? encodeURIComponent(cert.updatedAt) : Date.now()}`} target="_blank" rel="noopener noreferrer">Slides</a>
                          </Button>
                        )}
                        {(cert.r2PdfUrl || cert.pdfUrl) && (
                          <Button variant="outline" size="sm" asChild className="hover-elevate">
                            <a href={`${(cert.r2PdfUrl || cert.pdfUrl)}${(cert.r2PdfUrl || cert.pdfUrl).includes('?') ? '&' : '?'}v=${cert.updatedAt ? encodeURIComponent(cert.updatedAt) : Date.now()}`} target="_blank" rel="noopener noreferrer">PDF</a>
                          </Button>
                        )}
                        {(cert.status === 'generated' || cert.status === 'sent' || cert.status === 'failed') && cert.slideUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover-elevate"
                            title="Send email"
                            onClick={() => handleOpenIndivEmail(cert as any)}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" />
                            Email
                          </Button>
                        )}
                        {(cert.status === 'generated' || cert.status === 'sent' || cert.status === 'failed') && (cert as any).r2PdfUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover-elevate"
                            title="Send via WhatsApp"
                            onClick={() => handleOpenIndivWa(cert as any)}
                          >
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />
                            WA
                          </Button>
                        )}
                        {(cert.status === 'generated' || cert.status === 'sent') && (
                          <QrCodePopover batchId={batchId} certId={cert.id} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Send Certificates</DialogTitle>
            <DialogDescription>
              This will send emails with the generated PDF certificates attached to all recipients who haven't received them yet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-3 gap-6 py-4">
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject Line</label>
                <Input 
                  value={emailSubject} 
                  onChange={e => setEmailSubject(e.target.value)} 
                  placeholder="e.g. Your certificate is ready!"
                  className="transition-all duration-200"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    const target = e.target as HTMLInputElement;
                    target.focus();
                    
                    const rect = target.getBoundingClientRect();
                    const x = e.clientX - rect.left - 12;
                    const charWidth = 8;
                    const pos = Math.max(0, Math.floor(x / charWidth));
                    target.setSelectionRange(pos, pos);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const target = e.target as HTMLInputElement;
                    const text = e.dataTransfer.getData("text/plain");
                    if (text) {
                      const start = target.selectionStart || 0;
                      const end = target.selectionEnd || 0;
                      const newValue = emailSubject.substring(0, start) + text + emailSubject.substring(end);
                      setEmailSubject(newValue);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Body</label>
                <Textarea
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={8}
                  className="resize-none font-sans leading-relaxed transition-all duration-200"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    const target = e.target as HTMLTextAreaElement;
                    target.focus();

                    const rect = target.getBoundingClientRect();
                    const x = e.clientX - rect.left - 12;
                    const y = e.clientY - rect.top - 12;
                    
                    const charWidth = 8.4;
                    const lineHeight = 24; 
                    
                    const lineIdx = Math.max(0, Math.floor(y / lineHeight));
                    const colIdx = Math.max(0, Math.floor(x / charWidth));
                    
                    const textLines = target.value.split('\n');
                    let pos = 0;
                    for (let i = 0; i < Math.min(lineIdx, textLines.length); i++) {
                      pos += textLines[i].length + 1;
                    }
                    pos += Math.min(colIdx, textLines[lineIdx]?.length || 0);
                    
                    target.setSelectionRange(pos, pos);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const target = e.target as HTMLTextAreaElement;
                    const text = e.dataTransfer.getData("text/plain");
                    if (text) {
                      const start = target.selectionStart || 0;
                      const end = target.selectionEnd || 0;
                      const newValue = emailBody.substring(0, start) + text + emailBody.substring(end);
                      setEmailBody(newValue);
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 h-full">
                <label className="text-sm font-semibold mb-3 block">Placeholders</label>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Drag and drop to insert
                </p>
                
                <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[250px] pr-1">
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", batch.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-2 py-1 rounded-md text-[11px] font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-1.5 group shadow-sm"
                  >
                    <div className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                    Batch Name
                  </div>
                  {batch.certificates[0]?.rowData ? (
                    Object.keys(batch.certificates[0].rowData).map(header => (
                      <div
                        key={header}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `<<${header}>>`);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-2 py-1 rounded-md text-[11px] font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-1.5 group shadow-sm"
                      >
                        <div className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                        {header}
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic text-center w-full py-4">
                      No data fields available.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendCerts({ batchId: batchId as any, data: { emailSubject, emailBody } })}
              disabled={isSending || !emailSubject || !emailBody}
            >
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual Email Send Modal */}
      <Dialog open={!!indivEmailCert} onOpenChange={(open) => { if (!open) setIndivEmailCert(null); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Send Certificate — {(indivEmailCert as any)?.recipientName}</DialogTitle>
            <DialogDescription>
              Sending to <strong>{(indivEmailCert as any)?.recipientEmail}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject Line</label>
              <Input value={indivEmailSubject} onChange={e => setIndivEmailSubject(e.target.value)} placeholder="e.g. Your certificate is ready!" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Body</label>
              <Textarea value={indivEmailBody} onChange={e => setIndivEmailBody(e.target.value)} rows={6} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIndivEmailCert(null)}>Cancel</Button>
            <Button
              onClick={() => sendOneCertEmail({ batchId, certId: (indivEmailCert as any)?.id, data: { emailSubject: indivEmailSubject, emailBody: indivEmailBody } })}
              disabled={isSendingOne || !indivEmailSubject || !indivEmailBody}
            >
              {isSendingOne ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual WhatsApp Send Modal */}
      <Dialog open={!!indivWaCert} onOpenChange={(open) => { if (!open) setIndivWaCert(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Send via WhatsApp — {(indivWaCert as any)?.recipientName}</DialogTitle>
            <DialogDescription>
              Uses the <strong>document_sender</strong> template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 text-sm font-mono text-muted-foreground">
              Hi <span className="text-foreground font-semibold">{indivWaVar1 || "{{1}}"}</span>, your certificate for <span className="text-foreground font-semibold">{indivWaVar2 || "{{2}}"}</span> is attached below
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{"{{1}}"} — Participant Name</label>
              <Input value={indivWaVar1} onChange={e => setIndivWaVar1(e.target.value)} placeholder="e.g. <<Name>>" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{"{{2}}"} — Event Name</label>
              <Input value={indivWaVar2} onChange={e => setIndivWaVar2(e.target.value)} placeholder="e.g. batch name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIndivWaCert(null)}>Cancel</Button>
            <Button
              onClick={() => sendOneCertWa({ batchId, certId: (indivWaCert as any)?.id, data: { var1Template: indivWaVar1, var2Template: indivWaVar2 } })}
              disabled={isSendingOneWa || !indivWaVar1 || !indivWaVar2}
              className=""
            >
              {isSendingOneWa ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
              Send via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Send Modal */}
      <Dialog open={waModalOpen} onOpenChange={setWaModalOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Send via WhatsApp</DialogTitle>
            <DialogDescription>
              Uses the <strong>document_sender</strong> template. The PDF certificate will be attached and sent to each recipient's phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="grid md:grid-cols-3 gap-6 py-4">
            <div className="md:col-span-2 space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 text-sm font-mono text-muted-foreground mb-2">
                Hi <span className="text-foreground font-semibold">{waVar1 || "{{1}}"}</span>, your certificate for <span className="text-foreground font-semibold">{waVar2 || "{{2}}"}</span> is attached below
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{"{{1}}"} — Participant Name</label>
                <Input
                  value={waVar1}
                  onChange={e => setWaVar1(e.target.value)}
                  placeholder="e.g. <<Name>>"
                  className="transition-all duration-200"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    const target = e.target as HTMLInputElement;
                    target.focus();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const text = e.dataTransfer.getData("text/plain");
                    if (text) setWaVar1(text);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{"{{2}}"} — Event Name</label>
                <Input
                  value={waVar2}
                  onChange={e => setWaVar2(e.target.value)}
                  placeholder="e.g. batch name or <<EventName>>"
                  className="transition-all duration-200"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    const target = e.target as HTMLInputElement;
                    target.focus();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const text = e.dataTransfer.getData("text/plain");
                    if (text) setWaVar2(text);
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 border border-border/50 h-full">
                <label className="text-sm font-semibold mb-3 block">Placeholders</label>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Drag and drop to insert
                </p>
                <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[250px] pr-1">
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", batch.name);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-2 py-1 rounded-md text-[11px] font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-1.5 group shadow-sm"
                  >
                    <div className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                    Batch Name
                  </div>
                  {batch.certificates[0]?.rowData ? (
                    Object.keys(batch.certificates[0].rowData).map(header => (
                      <div
                        key={header}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `<<${header}>>`);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-2 py-1 rounded-md text-[11px] font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-1.5 group shadow-sm"
                      >
                        <div className="w-1 h-1 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                        {header}
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-muted-foreground italic text-center w-full py-4">
                      No data fields available.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaModalOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendWhatsapp({ batchId, data: { var1Template: waVar1, var2Template: waVar2 } })}
              disabled={isSendingWhatsapp || !waVar1 || !waVar2}
              className=""
            >
              {isSendingWhatsapp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
              Send via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}
