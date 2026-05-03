import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award } from "lucide-react";

export default function Login() {
    const { login, signup } = useAuth();
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            if (mode === "signin") {
                await login(email.trim(), password);
            } else {
                if (password !== confirmPassword) {
                    setError("Passwords do not match.");
                    setLoading(false);
                    return;
                }
                await signup(email.trim(), password);
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
                    <div className="w-12 h-12 border-2 border-background/30 flex items-center justify-center mx-auto mb-4">
                        <Award className="w-6 h-6" />
                    </div>
                    <h1 className="text-lg font-black uppercase tracking-widest">Cephlow</h1>
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
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <Button
                            type="submit"
                            disabled={loading}
                            size="lg"
                            className="w-full h-11 font-bold uppercase tracking-widest text-xs border-2"
                        >
                            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
                        </Button>
                    </form>
                    <button
                        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setConfirmPassword(""); }}
                        className="text-xs text-muted-foreground underline mt-4 block mx-auto text-center w-full"
                    >
                        {mode === "signin" ? "No account? Sign up" : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
