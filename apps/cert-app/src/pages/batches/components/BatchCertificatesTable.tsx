import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { LockedFeature } from "@/components/LockedFeature";
import { Loader2, Clock, CheckCircle2, MailCheck, XCircle, AlertCircle, MessageCircle, CheckCheck, Truck, Send, FileDown, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { QrCodePopover } from "./QrCodePopover";

export interface ReportDetail { message: string; phone: string; created_at: string; }

interface Props {
  batch: any;
  sortedCertificates: any[];
  selectedCertIds: string[];
  onSelectionChange: (ids: string[]) => void;
  certHasReport: (cert: any) => boolean;
  getCertReport: (cert: any) => ReportDetail | null;
  onReportClick: (entry: { cert: any; report: ReportDetail }) => void;
  onIndivEmail: (cert: any) => void;
  onIndivWa: (cert: any) => void;
  onDelete: (cert: any) => void;
  batchId: string;
  getStatusColor: (status: string) => string;
}

export function BatchCertificatesTable({
  batch, sortedCertificates, selectedCertIds, onSelectionChange,
  certHasReport, getCertReport, onReportClick,
  onIndivEmail, onIndivWa, onDelete,
  batchId, getStatusColor,
}: Props) {
  const [expandedCertIds, setExpandedCertIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedCertIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const colSpan = batch.categoryColumn && batch.categoryTemplateMap ? 7 : 6;

  const canEmail = (cert: any) =>
    cert.status === 'generated' || cert.status === 'sent' || cert.status === 'failed';
  const canWa = (cert: any) =>
    (cert.status === 'generated' || cert.status === 'sent' || cert.status === 'failed') && !!cert.r2PdfUrl;

  // Desktop: labelled buttons
  const DesktopActions = ({ cert }: { cert: any }) => (
    <>
      {(cert.r2PdfUrl || cert.pdfUrl) && (
        <Button variant="outline" size="sm" asChild className="hover-elevate">
          <a href={`${(cert.r2PdfUrl || cert.pdfUrl)}${(cert.r2PdfUrl || cert.pdfUrl).includes('?') ? '&' : '?'}v=${cert.updatedAt ? encodeURIComponent(cert.updatedAt) : Date.now()}`} target="_blank" rel="noopener noreferrer">
            <FileDown className="w-3.5 h-3.5 mr-1.5" />PDF
          </a>
        </Button>
      )}
      {canEmail(cert) && (
        <LockedFeature feature="Email delivery" featureKey="email_delivery" inline>
          <Button variant="outline" size="sm" className="hover-elevate" onClick={() => onIndivEmail(cert)}>
            <Send className="w-3.5 h-3.5 mr-1.5" />Email
          </Button>
        </LockedFeature>
      )}
      {canWa(cert) && (
        <LockedFeature feature="WhatsApp delivery" featureKey="whatsapp_delivery" inline>
          <Button variant="outline" size="sm" className="hover-elevate" onClick={() => onIndivWa(cert)}>
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />WA
          </Button>
        </LockedFeature>
      )}
      {(cert.status === 'generated' || cert.status === 'sent') && (
        <QrCodePopover batchId={batchId} certId={cert.id} />
      )}
      <Button variant="outline" size="sm" className="hover-elevate text-destructive hover:text-destructive" onClick={() => onDelete(cert)} aria-label="Delete recipient">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </>
  );

  // Mobile: labelled buttons
  const MobileActions = ({ cert }: { cert: any }) => (
    <>
      {(cert.r2PdfUrl || cert.pdfUrl) && (
        <Button variant="outline" size="sm" asChild className="hover-elevate w-full justify-start">
          <a href={`${(cert.r2PdfUrl || cert.pdfUrl)}${(cert.r2PdfUrl || cert.pdfUrl).includes('?') ? '&' : '?'}v=${cert.updatedAt ? encodeURIComponent(cert.updatedAt) : Date.now()}`} target="_blank" rel="noopener noreferrer">
            <FileDown className="w-3.5 h-3.5 mr-1.5" />PDF
          </a>
        </Button>
      )}
      {canEmail(cert) && (
        <LockedFeature feature="Email delivery" featureKey="email_delivery" inline>
          <Button variant="outline" size="sm" className="hover-elevate w-full justify-start" onClick={() => onIndivEmail(cert)}>
            <Send className="w-3.5 h-3.5 mr-1.5" />Email
          </Button>
        </LockedFeature>
      )}
      {canWa(cert) && (
        <LockedFeature feature="WhatsApp delivery" featureKey="whatsapp_delivery" inline>
          <Button variant="outline" size="sm" className="hover-elevate w-full justify-start" onClick={() => onIndivWa(cert)}>
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />WA
          </Button>
        </LockedFeature>
      )}
      {(cert.status === 'generated' || cert.status === 'sent') && (
        <QrCodePopover batchId={batchId} certId={cert.id} />
      )}
      <Button variant="outline" size="sm" className="hover-elevate w-full justify-start text-destructive hover:text-destructive" onClick={() => onDelete(cert)}>
        <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
      </Button>
    </>
  );

  const hasActions = (_cert: any) => true;

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-[50px] text-center">
                <Checkbox
                  checked={batch.certificates?.length > 0 && selectedCertIds.length === batch.certificates.length}
                  onCheckedChange={(checked) => {
                    onSelectionChange(checked ? (batch.certificates?.map((c: any) => c.id) || []) : []);
                  }}
                />
              </TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Status</TableHead>
              {batch.categoryColumn && batch.categoryTemplateMap && (
                <TableHead className="hidden lg:table-cell">Template</TableHead>
              )}
              <TableHead className="hidden md:table-cell">Sent At</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCertificates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-32 text-center text-muted-foreground">No recipients found.</TableCell>
              </TableRow>
            ) : (
              sortedCertificates.map((cert: any) => {
                const isExpanded = expandedCertIds.has(cert.id);
                const rowClass = certHasReport(cert)
                  ? 'bg-foreground text-background [&_*]:text-background [&_*]:border-background hover:bg-foreground'
                  : 'hover:bg-muted/50 transition-colors';

                return (
                  <>
                    <TableRow key={cert.id} className={rowClass}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedCertIds.includes(cert.id)}
                          onCheckedChange={(checked) => {
                            onSelectionChange(checked ? [...selectedCertIds, cert.id] : selectedCertIds.filter(id => id !== cert.id));
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {cert.recipientName}
                          {cert.isPaid && <Badge variant="secondary" className={`text-[10px] px-1 py-0 h-4 ${certHasReport(cert) ? 'bg-background/20 text-background border-background/30' : ''}`}>Paid</Badge>}
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
                              certHasReport(cert)
                                ? 'bg-transparent text-background border-background/40'
                                : cert.whatsappStatus === 'read'
                                ? 'border-border text-blue-600'
                                : cert.whatsappStatus === 'delivered'
                                ? 'border-border text-green-600'
                                : cert.whatsappStatus === 'wa_failed'
                                ? 'border-border text-red-600'
                                : 'border-border text-muted-foreground'
                            }>
                              {cert.whatsappStatus === 'read' && <CheckCheck className="w-3 h-3 mr-1" />}
                              {cert.whatsappStatus === 'delivered' && <Truck className="w-3 h-3 mr-1" />}
                              {cert.whatsappStatus === 'wa_failed' && <XCircle className="w-3 h-3 mr-1" />}
                              {cert.whatsappStatus === 'sent' && <MessageCircle className="w-3 h-3 mr-1" />}
                              WA: {cert.whatsappStatus === 'wa_failed' ? 'failed' : cert.whatsappStatus}
                            </Badge>
                          )}
                          {getCertReport(cert) && (
                            <span
                              onClick={() => onReportClick({ cert, report: getCertReport(cert)! })}
                              className="text-[11px] opacity-80 italic normal-case tracking-normal font-normal line-clamp-2 max-w-[220px] cursor-pointer underline underline-offset-2"
                            >
                              "{getCertReport(cert)!.message}"
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {batch.categoryColumn && batch.categoryTemplateMap && (() => {
                        const condVal = cert.rowData?.[batch.categoryColumn] ?? "";
                        const mapped = condVal && batch.categoryTemplateMap[condVal];
                        const tplName = mapped ? mapped.templateName : batch.templateName;
                        const isRouted = !!(condVal && mapped);
                        return (
                          <TableCell className="hidden lg:table-cell">
                            <span className={`text-xs font-mono px-1.5 py-0.5 border ${isRouted ? "border-amber-400/60 text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : "border-border text-muted-foreground"}`}>
                              {tplName || "—"}
                            </span>
                          </TableCell>
                        );
                      })()}
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {cert.sentAt ? format(new Date(cert.sentAt), 'MMM d, h:mm a') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Mobile: expand toggle */}
                        {hasActions(cert) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="sm:hidden px-2"
                            onClick={() => toggleExpanded(cert.id)}
                            aria-label={isExpanded ? "Hide actions" : "Show actions"}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        )}
                        {/* Desktop: icon-only actions */}
                        <div className="hidden sm:flex items-center justify-end gap-1">
                          <DesktopActions cert={cert} />
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Mobile expanded actions row */}
                    {isExpanded && (
                      <TableRow key={`${cert.id}-actions`} className={`sm:hidden ${certHasReport(cert) ? 'bg-foreground' : 'bg-muted/30'}`}>
                        <TableCell colSpan={colSpan} className="py-2 px-4">
                          <div className="grid grid-cols-3 gap-2">
                            <MobileActions cert={cert} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
