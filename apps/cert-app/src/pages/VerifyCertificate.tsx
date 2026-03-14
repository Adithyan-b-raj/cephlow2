import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, Award } from "lucide-react";
import { format } from "date-fns";

export default function VerifyCertificate() {
  const [, params] = useRoute("/verify/:id");
  const certId = params?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    valid: boolean;
    recipientName: string;
    batchName: string;
    issuedAt: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    async function verify() {
      if (!certId) return;
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response: Response;
        try {
          response = await fetch(`${apiUrl}/api/certificates/${certId}/verify`, {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        if (!response.ok) {
          throw new Error("Certificate not found or invalid");
        }
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        if (err.name === "AbortError") {
          setError("Verification is taking longer than expected. Please try again in a moment.");
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [certId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Verifying certificate...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Award className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Cephlow Verify</h1>
          <p className="text-slate-500 mt-2">Official Certificate Verification System</p>
        </div>

        {error ? (
          <Card className="border-destructive/20 bg-destructive/5 overflow-hidden shadow-xl border-t-4 border-t-destructive">
            <CardContent className="pt-8 pb-8 text-center">
              <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <CardTitle className="text-2xl font-bold text-destructive mb-2">Invalid Certificate</CardTitle>
              <p className="text-slate-600 mb-6">{error}</p>
              <div className="p-4 bg-white/50 rounded-xl text-sm text-slate-500 border border-destructive/10">
                This certificate record could not be found or has been revoked. Please contact the issuer for more information.
              </div>
            </CardContent>
          </Card>
        ) : data && (
          <Card className="border-green-100 bg-white overflow-hidden shadow-2xl border-t-4 border-t-green-500 rounded-3xl">
            <CardContent className="pt-10 pb-10">
              <div className="text-center mb-8">
                <div className="relative inline-block">
                    <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 uppercase font-bold text-[10px] tracking-wider py-0.5">Verified</Badge>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mt-6">Authenticity Confirmed</h2>
                <p className="text-slate-500 text-sm mt-1">This digital certificate is genuine and valid.</p>
              </div>

              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 group transition-colors hover:bg-white hover:border-primary/20 hover:shadow-sm">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Recipient Name</label>
                  <p className="text-xl font-bold text-slate-800">{data.recipientName}</p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 group transition-colors hover:bg-white hover:border-primary/20 hover:shadow-sm">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Issued For</label>
                  <p className="text-lg font-semibold text-slate-700">{data.batchName}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Issue Date</label>
                    <p className="font-semibold text-slate-700">{format(new Date(data.issuedAt), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Status</label>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 capitalize font-bold">
                      {data.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-4">Verification ID</p>
                <code className="px-4 py-2 bg-slate-100 rounded-lg text-xs font-mono text-slate-600 break-all block">
                  {certId}
                </code>
              </div>
            </CardContent>
          </Card>
        )}
        
        <p className="text-center text-[10px] text-slate-400 mt-8 uppercase tracking-[0.2em] font-bold">
          Powered by Cephlow Certificate Authority
        </p>
      </div>
    </div>
  );
}
