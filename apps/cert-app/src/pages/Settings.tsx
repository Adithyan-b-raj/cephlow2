import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { hasGoogleAuth, connectGoogle, disconnectGoogle } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectGoogle();
      toast({ title: "Google account disconnected" });
    } catch (err: any) {
      toast({ title: "Failed to disconnect", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      await connectGoogle();
    } catch (err: any) {
      toast({ title: "Failed to connect", description: err?.message || "Unknown error", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-5 h-5" />
        <h1 className="text-sm font-bold uppercase tracking-widest">Settings</h1>
      </div>

      <section className="border-2 border-border">
        <div className="px-5 py-3 border-b-2 border-border">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Google Account
          </span>
        </div>
        <div className="px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-1">
              {hasGoogleAuth ? "Connected" : "Not Connected"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hasGoogleAuth
                ? "Your Google account is linked. Cephlow can access Sheets, Slides, Drive, and Gmail on your behalf."
                : "Connect your Google account to enable certificate generation and delivery."}
            </p>
          </div>
          {hasGoogleAuth ? (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-destructive hover:text-destructive transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {loading ? "..." : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-border hover:border-foreground hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {loading ? "..." : "Connect"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
