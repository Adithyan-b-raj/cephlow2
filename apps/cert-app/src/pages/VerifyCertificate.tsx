import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  CalendarDays,
  User,
  Briefcase,
  Hash,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CertData {
  id: string;
  recipientName: string;
  status: string;
  batchName: string;
  issuedAt: string | null;
  r2PdfUrl: string | null;
  pdfUrl: string | null;
  slideUrl: string | null;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-2 border-foreground p-3">
      <div className="mt-0.5 border border-foreground p-1.5 shrink-0">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <div className="mt-1 break-words text-sm font-bold">{value}</div>
      </div>
    </div>
  );
}

export default function VerifyCertificate() {
  const [, params] = useRoute("/verify/:batchId/:certId");
  const batchId = params?.batchId ?? "";
  const certId  = params?.certId  ?? "";

  const [cert, setCert]     = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!batchId || !certId) return;
    fetch(`/api/verify/${batchId}/${certId}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(data.error); else setCert(data); })
      .catch(() => setError("Failed to load certificate"))
      .finally(() => setLoading(false));
  }, [batchId, certId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
        <div className="border-2 border-foreground p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest">Verifying...</p>
        </div>
      </div>
    );
  }

  const isValid = !!cert && !error && (cert.status === "sent" || cert.status === "generated");
  const viewUrl = cert?.r2PdfUrl || cert?.pdfUrl || cert?.slideUrl;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-foreground text-background p-2.5 shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-widest">Certificate Verification</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Official verification portal</p>
            </div>
          </div>

          {/* Main card */}
          <div className="border-2 border-foreground">

            {/* Status header bar */}
            <div className={`px-5 py-4 border-b-2 border-foreground flex items-start gap-3 ${isValid ? "bg-foreground text-background" : "bg-background text-foreground"}`}>
              <div className="shrink-0 mt-0.5">
                {isValid
                  ? <CheckCircle2 className="h-5 w-5" />
                  : <XCircle className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black uppercase tracking-widest text-sm">
                  {isValid ? "Certificate Verified" : "Verification Failed"}
                </p>
                <p className={`text-xs mt-0.5 normal-case tracking-normal font-normal ${isValid ? "opacity-70" : "text-muted-foreground"}`}>
                  {isValid
                    ? "This certificate is authentic and has been successfully validated."
                    : error || "This certificate could not be validated."}
                </p>
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] font-black uppercase tracking-widest ${isValid ? "border-background text-background bg-transparent" : "border-foreground text-foreground bg-background"}`}>
                {isValid ? "Valid" : "Invalid"}
              </Badge>
            </div>

            {/* Content */}
            <div className="p-4 space-y-2">
              {isValid && cert ? (
                <>
                  <InfoRow icon={User} label="Recipient" value={cert.recipientName} />
                  <InfoRow icon={Briefcase} label="Issued For" value={cert.batchName} />
                  <div className="grid grid-cols-2 gap-2">
                    <InfoRow
                      icon={CalendarDays}
                      label="Issue Date"
                      value={cert.issuedAt ? format(new Date(cert.issuedAt), "MMM d, yyyy") : "—"}
                    />
                    <InfoRow
                      icon={ShieldCheck}
                      label="Status"
                      value={
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {cert.status}
                        </span>
                      }
                    />
                  </div>
                  <InfoRow
                    icon={Hash}
                    label="Verification ID"
                    value={<code className="font-mono text-xs break-all">{certId}</code>}
                  />
                  {viewUrl && (
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex w-full items-center justify-center gap-2 bg-foreground text-background border-2 border-foreground px-4 py-2.5 text-xs font-black uppercase tracking-widest hover:bg-background hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Certificate
                    </a>
                  )}
                </>
              ) : (
                <>
                  <div className="border-2 border-foreground p-3 text-xs font-normal normal-case tracking-normal">
                    This certificate record could not be found, may be invalid, or may have been revoked.
                  </div>
                  <InfoRow
                    icon={Hash}
                    label="Verification ID"
                    value={<code className="font-mono text-xs break-all">{certId || "N/A"}</code>}
                  />
                </>
              )}
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            Powered by Cephlow Certificate Authority
          </p>
        </div>
      </div>
    </div>
  );
}
