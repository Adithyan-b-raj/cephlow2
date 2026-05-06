import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award } from "lucide-react";
import { supabase, updatePassword } from "@/lib/supabase";

export default function ResetPassword() {
    const [, setLocation] = useLocation();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(() => {
        // After a redirect, Supabase has already stored the recovery session in localStorage.
        // getSession() picks it up; PASSWORD_RECOVERY won't fire a second time.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSessionReady(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
                setSessionReady(true);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            await updatePassword(password);
            setDone(true);
        } catch (err: any) {
            setError(err.message ?? "Something went wrong. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm border-2 border-foreground">
                <div className="bg-foreground text-background p-6 text-center">
                    <div className="w-12 h-12 border-2 border-background/30 flex items-center justify-center mx-auto mb-4">
                        <Award className="w-6 h-6" />
                    </div>
                    <h1 className="text-lg font-black uppercase tracking-widest">Cephlow</h1>
                    <p className="text-[10px] uppercase tracking-widest text-background/50 mt-1">Certificate Automation</p>
                </div>

                <div className="p-8">
                    {done ? (
                        <div className="text-center space-y-4">
                            <p className="text-sm font-medium">Password updated</p>
                            <p className="text-xs text-muted-foreground">
                                Your password has been reset successfully.
                            </p>
                            <Button
                                size="lg"
                                className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2 mt-2"
                                onClick={() => setLocation("/")}
                            >
                                Go to Dashboard
                            </Button>
                        </div>
                    ) : !sessionReady ? (
                        <div className="text-center space-y-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto" />
                            <p className="text-xs text-muted-foreground">Verifying reset link...</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground mb-4 text-center">
                                Choose a new password for your account.
                            </p>
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <Input
                                    type="password"
                                    placeholder="New Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoFocus
                                    minLength={6}
                                    className="border-2 border-foreground rounded-none h-11"
                                />
                                <Input
                                    type="password"
                                    placeholder="Confirm New Password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="border-2 border-foreground rounded-none h-11"
                                />
                                {error && <p className="text-xs text-destructive">{error}</p>}
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    size="lg"
                                    className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2"
                                >
                                    {loading ? "Updating..." : "Update Password"}
                                </Button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
