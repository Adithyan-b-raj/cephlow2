import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, XCircle, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-10 text-center border border-red-100">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Certificate Not Found</h1>
          <p className="text-gray-500 text-sm">{error || "This certificate could not be verified."}</p>
        </div>
      </div>
    );
  }

  const isValid = cert.status === "sent" || cert.status === "generated";
  const viewUrl = cert.r2PdfUrl || cert.pdfUrl || cert.slideUrl;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-green-100">
        {/* Header band */}
        <div className={`px-8 py-6 text-center ${isValid ? "bg-green-600" : "bg-orange-500"}`}>
          <ShieldCheck className="w-12 h-12 text-white mx-auto mb-2 opacity-90" />
          <p className="text-white font-semibold text-lg tracking-wide">
            {isValid ? "Certificate Verified" : "Certificate Pending"}
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-8 text-center space-y-4">
          <div>
            <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">This certifies that</p>
            <h1 className="text-3xl font-bold text-gray-900">{cert.recipientName}</h1>
          </div>

          <div>
            <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">has successfully completed</p>
            <p className="text-xl font-semibold text-gray-700">{cert.batchName}</p>
          </div>

          {cert.issuedAt && (
            <p className="text-sm text-gray-400">
              Issued on{" "}
              <span className="text-gray-600 font-medium">
                {format(new Date(cert.issuedAt), "MMMM d, yyyy")}
              </span>
            </p>
          )}

          {isValid && (
            <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 rounded-lg px-4 py-2 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Authenticity confirmed
            </div>
          )}

          {viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-2 px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors shadow-md shadow-green-200"
            >
              <ExternalLink className="w-4 h-4" />
              View Certificate
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 bg-gray-50 text-center">
          <p className="text-xs text-gray-400">Certificate ID: {certId}</p>
        </div>
      </div>
    </div>
  );
}
