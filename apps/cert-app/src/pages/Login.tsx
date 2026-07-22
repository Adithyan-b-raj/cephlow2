import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { isStaging } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award } from "lucide-react";

export default function Login() {
    const { login, signup, loginWithGoogle } = useAuth();
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<"signin" | "signup">(() =>
        new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin"
    );
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [termsAccepted, setTermsAccepted] = useState(false);

    useEffect(() => {
        sessionStorage.removeItem("agreed_to_terms");
    }, []);

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            const normalizedEmail = email.trim().toLowerCase();
            if (mode === "signin") {
                await login(normalizedEmail, password);
            } else {
                if (password !== confirmPassword) {
                    setError("Passwords do not match.");
                    setLoading(false);
                    return;
                }
                await signup(normalizedEmail, password);
            }
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
                    <div className="w-12 h-12 border-2 border-background/30 flex items-center justify-center mx-auto mb-4 bg-background/10">
                        <img src="/favicon-32x32.png" alt="Cephlow" className="w-6 h-6" />
                    </div>
                    <div className="flex items-center justify-center gap-1.5 mx-auto">
                        <h1 className="text-lg font-black uppercase tracking-widest text-background">Cephlow</h1>
                        {isStaging && (
                            <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-background text-foreground border border-background/25 rounded-sm tracking-wider leading-none uppercase">Beta</span>
                        )}
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-background/50 mt-1">Certificate Automation</p>
                </div>

                <div className="p-8">
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
                        <Input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="border-2 border-foreground rounded-none h-11"
                        />
                        {mode === "signup" && (
                            <Input
                                type="password"
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                className="border-2 border-foreground rounded-none h-11"
                            />
                        )}
                        {mode === "signup" && (
                            <label className="flex items-start gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 shrink-0 appearance-none border-2 border-foreground bg-background checked:bg-foreground cursor-pointer"
                                />
                                <span className="text-[11px] text-muted-foreground leading-tight">
                                    I agree to the{" "}
                                    <a href="/terms" target="_blank" className="underline text-foreground">Terms of Service</a>
                                    {" "}and{" "}
                                    <a href="/privacy" target="_blank" className="underline text-foreground">Privacy Policy</a>
                                </span>
                            </label>
                        )}
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <Button
                            type="submit"
                            disabled={loading || (mode === "signup" && !termsAccepted)}
                            size="lg"
                            className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2"
                        >
                            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
                        </Button>
                    </form>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t-2 border-foreground" />
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                            <span className="bg-background px-2 text-muted-foreground font-bold">Or</span>
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={async () => {
                            if (loading) return;
                            setLoading(true);
                            setError("");
                            try {
                                if (mode === "signup") {
                                    sessionStorage.setItem("agreed_to_terms", "true");
                                }
                                await loginWithGoogle();
                            } catch (err: any) {
                                setError(err.message ?? "Google Sign-In failed.");
                                setLoading(false);
                            }
                        }}
                        disabled={loading || (mode === "signup" && !termsAccepted)}
                        variant="outline"
                        className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2 border-foreground rounded-none bg-background hover:bg-foreground hover:text-background transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.355 0-6.075-2.72-6.075-6.075s2.72-6.075 6.075-6.075c1.497 0 2.868.543 3.935 1.44l3.056-3.057C19.14 1.944 15.93 1 12.24 1c-6.075 0-11 4.925-11 11s4.925 11 11 11c5.932 0 10.875-4.285 10.875-10.285 0-.693-.06-1.37-.173-2.03H12.24z"/>
                        </svg>
                        Continue with Google
                    </Button>
                    {mode === "signin" && (
                        <p className="text-[10px] text-muted-foreground text-center mt-3 leading-snug">
                            By signing in, you agree to our{" "}
                            <a href="/terms" target="_blank" className="underline text-foreground">Terms of Service</a>
                            {" "}and{" "}
                            <a href="/privacy" target="_blank" className="underline text-foreground">Privacy Policy</a>.
                        </p>
                    )}
                    {mode === "signin" && (
                        <button
                            onClick={() => setLocation("/forgot-password")}
                            className="text-xs text-muted-foreground underline mt-3 block mx-auto text-center w-full"
                        >
                            Forgot password?
                        </button>
                    )}
                    <button
                        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setConfirmPassword(""); }}
                        className="text-xs text-muted-foreground underline mt-3 block mx-auto text-center w-full"
                    >
                        {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
