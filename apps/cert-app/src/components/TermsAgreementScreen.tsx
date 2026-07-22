import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Award } from "lucide-react";

export default function TermsAgreementScreen() {
    const { logout } = useAuth();
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleAgree = async () => {
        if (!termsAccepted || loading) return;
        setLoading(true);
        setError("");
        try {
            const { error: err } = await supabase.auth.updateUser({
                data: { agreed_to_terms: true }
            });
            if (err) throw err;
            // Force reload window to propagate metadata updates across context
            window.location.reload();
        } catch (e: any) {
            setError(e.message ?? "Failed to save agreement. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 z-50 fixed inset-0">
            <div className="w-full max-w-md border-2 border-foreground bg-background shadow-md animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-foreground text-background p-6 text-center">
                    <img src="/android-chrome-512x512.png" alt="Cephlow" className="w-12 h-12 mx-auto mb-3 object-contain" />
                    <h1 className="text-lg font-black uppercase tracking-widest text-background">Welcome to Cephlow</h1>
                    <p className="text-[10px] uppercase tracking-widest text-background/50 mt-1">One last step before you start</p>
                </div>

                <div className="p-8 space-y-6">
                    <p className="text-sm text-foreground leading-relaxed">
                        To use Cephlow's certificate automation tools, you must accept our updated Terms of Service and Privacy Policy.
                    </p>

                    <label className="flex items-start gap-3 cursor-pointer group p-3 border-2 border-dashed border-foreground/30 hover:border-foreground transition-colors">
                        <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            className="mt-0.5 w-4 h-4 shrink-0 appearance-none border-2 border-foreground bg-background checked:bg-foreground cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground leading-snug">
                            I understand and agree to the{" "}
                            <a href="/terms" target="_blank" className="underline text-foreground font-bold">Terms of Service</a>
                            {" "}and{" "}
                            <a href="/privacy" target="_blank" className="underline text-foreground font-bold">Privacy Policy</a>.
                        </span>
                    </label>

                    {error && <p className="text-xs text-destructive">{error}</p>}

                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={logout}
                            className="flex-1 h-11 font-bold uppercase tracking-widest text-xs border-2 border-foreground rounded-none bg-background hover:bg-foreground hover:text-background transition-colors"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleAgree}
                            disabled={!termsAccepted || loading}
                            className="flex-1 h-11 font-bold uppercase tracking-widest text-xs border-2"
                        >
                            {loading ? "Saving..." : "I Agree"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
