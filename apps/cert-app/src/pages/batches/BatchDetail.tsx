import { useState } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBatch,
  useGenerateBatch,
  useSendBatch,
  useShareBatchFolder,
  getGetBatchQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Play, Send, MailCheck, Loader2, FileText, CheckCircle2, XCircle, Clock, Share2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function BatchDetail() {
  const [, params] = useRoute("/batches/:id");
  const batchId = params?.id ?? "";

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: batch, isLoading, refetch } = useGetBatch(batchId, {
    query: {
      enabled: !!batchId,
      refetchInterval: (query) => {
        const status = (query.state.data as any)?.status;
        return status === "generating" || status === "sending" ? 2000 : false;
      }
    }
  });

  const { mutate: generateCerts, isPending: isGenerating } = useGenerateBatch({
    mutation: {
      onSuccess: () => {
        toast({ title: "Generation started!" });
        refetch();
      },
      onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" })
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
      onSuccess: (data) => {
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

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  if (!batch) return <div className="p-8 text-center text-red-500">Batch not found</div>;

  const handleOpenSend = () => {
    setEmailSubject(batch.emailSubject || "");
    setEmailBody(batch.emailBody || "");
    setSendModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
      case 'generated': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-display font-bold">{batch.name}</h1>
            <Badge className={`uppercase ${getStatusColor(batch.status)}`}>{batch.status}</Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-4 text-sm">
            <span>Created {format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
            <span>•</span>
            <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> {batch.sheetName}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => shareFolder({ batchId })}
            disabled={isSharing || !batch.pdfFolderId}
            className="hover-elevate bg-background"
          >
            {isSharing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2 text-green-500" />}
            Share PDF Folder
          </Button>
          <Button
            variant="outline"
            onClick={() => generateCerts({ batchId })}
            disabled={isGenerating || batch.status === 'generating'}
            className="hover-elevate bg-background"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 text-blue-500" />}
            Generate Certificates
          </Button>
          <Button
            onClick={handleOpenSend}
            disabled={isSending || batch.status === 'sending' || batch.generatedCount === 0}
            className="hover-elevate bg-primary text-primary-foreground shadow-md shadow-primary/20"
          >
            {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Emails
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
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl"><CheckCircle2 className="w-6 h-6 text-blue-600 dark:text-blue-400" /></div>
            <div>
              <div className="text-2xl font-bold font-display">{batch.generatedCount}</div>
              <div className="text-sm font-medium text-muted-foreground">Generated</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card shadow-sm">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl"><MailCheck className="w-6 h-6 text-green-600 dark:text-green-400" /></div>
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
                <TableHead>Recipient</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.certificates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No recipients found.</TableCell>
                </TableRow>
              ) : (
                batch.certificates.map(cert => (
                  <TableRow key={cert.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{cert.recipientName}</TableCell>
                    <TableCell className="text-muted-foreground">{cert.recipientEmail}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(cert.status)}>
                        {cert.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {cert.status === 'generated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {cert.status === 'sent' && <MailCheck className="w-3 h-3 mr-1" />}
                        {cert.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                        {cert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {cert.sentAt ? format(new Date(cert.sentAt), 'MMM d, h:mm a') : '-'}
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      {cert.slideUrl && (
                        <Button variant="ghost" size="sm" asChild className="hover-elevate">
                          <a href={cert.slideUrl} target="_blank" rel="noopener noreferrer">Slides</a>
                        </Button>
                      )}
                      {cert.pdfUrl && (
                        <Button variant="outline" size="sm" asChild className="hover-elevate">
                          <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</a>
                        </Button>
                      )}
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
              onClick={() => sendCerts({ batchId, data: { emailSubject, emailBody } })}
              disabled={isSending || !emailSubject || !emailBody}
            >
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
