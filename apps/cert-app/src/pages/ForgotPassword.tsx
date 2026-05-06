import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award } from "lucide-react";
import { resetPasswordForEmail } from "@/lib/supabase";

export default function ForgotPassword() {
    const [, setLocation] = useLocation();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            await resetPasswordForEmail(email.trim());
            setSent(true);
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
                    {sent ? (
                        <div className="text-center space-y-4">
                            <p className="text-sm font-medium">Check your email</p>
                            <p className="text-xs text-muted-foreground">
                                We sent a password reset link to <span className="font-medium text-foreground">{email}</span>.
                                Check your inbox and follow the link to reset your password.
                            </p>
                            <button
                                onClick={() => setLocation("/login")}
                                className="text-xs text-muted-foreground underline mt-2 block mx-auto text-center w-full"
                            >
                                Back to sign in
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground mb-4 text-center">
                                Enter your email and we'll send you a link to reset your password.
                            </p>
                            <form onSubmit={handleSubmit} className="space-y-3">
                                <Input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    className="border-2 border-foreground rounded-none h-11"
                                />
                                {error && <p className="text-xs text-destructive">{error}</p>}
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    size="lg"
                                    className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2"
                                >
                                    {loading ? "Sending..." : "Send Reset Link"}
                                </Button>
                            </form>
                            <button
                                onClick={() => setLocation("/login")}
                                className="text-xs text-muted-foreground underline mt-4 block mx-auto text-center w-full"
                            >
                                Back to sign in
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
