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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-white p-3">
      <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <div className="mt-0.5 break-words text-sm font-semibold text-slate-900">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function VerifyCertificate() {
  const [, params] = useRoute("/verify/:batchId/:certId");
  const batchId = params?.batchId ?? "";
  const certId = params?.certId ?? "";

  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId || !certId) return;
    fetch(`/api/verify/${batchId}/${certId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setCert(data);
      })
      .catch(() => setError("Failed to load certificate"))
      .finally(() => setLoading(false));
  }, [batchId, certId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-green-100 px-4">
        <div className="w-full max-w-sm sm:max-w-md">
          <Card className="border-slate-200 shadow-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 sm:text-lg">
                Verifying certificate
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Please wait while we validate the certificate details.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isValid = !!cert && !error && (cert.status === "sent" || cert.status === "generated");
  const viewUrl = cert?.r2PdfUrl || cert?.pdfUrl || cert?.slideUrl;

  return (
    <div
      className={`fixed inset-0 overflow-y-auto ${
        isValid
          ? "bg-gradient-to-br from-green-200 via-emerald-50 to-teal-100"
          : "bg-gradient-to-br from-red-200 via-rose-50 to-orange-100"
      }`}
    >
    <div className="flex min-h-full items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
        <div className="mb-5 flex items-center gap-3 sm:mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm sm:h-12 sm:w-12">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">
              Certificate Verification
            </h1>
            <p className="text-xs text-slate-500 sm:text-sm">Official verification portal</p>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-lg sm:shadow-xl">
          <CardHeader
            className={
              isValid
                ? "border-b bg-green-50/80 px-4 py-3 sm:px-6 sm:py-5"
                : "border-b bg-red-50/80 px-4 py-3 sm:px-6 sm:py-5"
            }
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  isValid
                    ? "shrink-0 rounded-lg bg-green-100 p-2 text-green-700 sm:p-2.5"
                    : "shrink-0 rounded-lg bg-red-100 p-2 text-red-700 sm:p-2.5"
                }
              >
                {isValid ? (
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <CardTitle className="text-base text-slate-900 sm:text-lg">
                  {isValid ? "Certificate Verified" : "Verification Failed"}
                </CardTitle>
                <p className="mt-0.5 text-xs text-slate-600 sm:mt-1 sm:text-sm">
                  {isValid
                    ? "This certificate is authentic and has been successfully validated."
                    : error || "This certificate could not be validated."}
                </p>
              </div>

              <Badge
                variant="outline"
                className={
                  isValid
                    ? "shrink-0 bg-foreground text-background border-foreground"
                    : "shrink-0 bg-background text-foreground border-foreground"
                }
              >
                {isValid ? "Valid" : "Invalid"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {isValid && cert ? (
              <div className="space-y-2 sm:space-y-3">
                <InfoRow icon={User} label="Recipient" value={cert.recipientName} />
                <InfoRow icon={Briefcase} label="Issued For" value={cert.batchName} />

                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                  <InfoRow
                    icon={CalendarDays}
                    label="Issue Date"
                    value={cert.issuedAt ? format(new Date(cert.issuedAt), "MMMM d, yyyy") : "—"}
                  />
                  <InfoRow
                    icon={ShieldCheck}
                    label="Status"
                    value={
                      <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                        {cert.status}
                      </Badge>
                    }
                  />
                </div>

                <Separator className="my-1" />

                <InfoRow
                  icon={Hash}
                  label="Verification ID"
                  value={
                    <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {certId}
                    </code>
                  }
                />

                {viewUrl && (
                  <a
                    href={viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 sm:w-auto"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Certificate
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  This certificate record could not be found, may be invalid, or may have been revoked.
                </div>
                <InfoRow
                  icon={Hash}
                  label="Verification ID"
                  value={
                    <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {certId || "N/A"}
                    </code>
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] text-slate-500">
          Powered by Cephlow Certificate Authority
        </p>
      </div>
    </div>
    </div>
  );
}
