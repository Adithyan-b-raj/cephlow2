import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase, signInWithPassword, signUpWithPassword, signOut, type User } from "@/lib/supabase";
import { setAuthTokenProvider, setBaseUrl } from "@workspace/api-client-react";

export type GoogleScopeType = "drive";

export interface GoogleAuthStatus {
    drive: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    hasGoogleAuth: boolean;
    googleAuthStatus: GoogleAuthStatus;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    connectGoogle: (scope?: GoogleScopeType) => Promise<void>;
    disconnectGoogle: () => Promise<void>;
    recheckGoogleAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus>({ drive: false });

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) setBaseUrl(apiUrl);
        setAuthTokenProvider(getAccessToken);
    }, []);

    const checkGoogleAuth = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${apiUrl}/api/auth/google/status`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const legacy = data.connected && !data.drive;
                setGoogleAuthStatus({
                    drive: data.drive || legacy,
                });
            }
        } catch {
            setGoogleAuthStatus({ drive: false });
        }
    }, []);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null);
            setLoading(false);
            if (data.session?.user) checkGoogleAuth();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                if (window.location.pathname !== "/reset-password") {
                    window.location.replace("/reset-password");
                }
                return;
            }
            setUser(session?.user ?? null);
            setLoading(false);
            if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
                checkGoogleAuth();
            } else if (!session?.user) {
                setGoogleAuthStatus({ drive: false });
            }
        });

        return () => subscription.unsubscribe();
    }, [checkGoogleAuth]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get("google_auth");
        if (result === "success") {
            checkGoogleAuth();
            params.delete("google_auth");
            const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
            window.history.replaceState({}, "", newUrl);
        } else if (result === "error") {
            params.delete("google_auth");
            params.delete("reason");
            const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
            window.history.replaceState({}, "", newUrl);
        }
    }, [checkGoogleAuth]);

    useEffect(() => {
        if (user && !user.user_metadata?.agreed_to_terms) {
            if (sessionStorage.getItem("agreed_to_terms") === "true") {
                sessionStorage.removeItem("agreed_to_terms");
                supabase.auth.updateUser({
                    data: { agreed_to_terms: true }
                }).then(({ data }) => {
                    if (data.user) setUser(data.user);
                }).catch(() => null);
            }
        }
    }, [user]);


    const login = async (email: string, password: string) => { await signInWithPassword(email, password); };
    const signup = async (email: string, password: string) => { await signUpWithPassword(email, password); };
    const loginWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    };
    const logout = async () => {
        await signOut();
        setUser(null);
        setGoogleAuthStatus({ drive: false });
    };

    const connectGoogle = async (scope: GoogleScopeType = "drive") => {
        const token = await getAccessToken();
        if (!token) return;
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
        const origin = encodeURIComponent(window.location.origin);
        const res = await fetch(`${apiUrl}/api/auth/google/url?origin=${origin}&scope=${scope}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const { url } = await res.json();
            window.location.href = url;
        }
    };

    const disconnectGoogle = async () => {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
        const url = `${apiUrl}/api/auth/google/disconnect`;
        const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${res.status})`);
        }
        setGoogleAuthStatus({ drive: false });
    };

    const hasGoogleAuth = googleAuthStatus.drive;

    return (
        <AuthContext.Provider value={{ user, loading, hasGoogleAuth, googleAuthStatus, login, signup, loginWithGoogle, logout, connectGoogle, disconnectGoogle, recheckGoogleAuth: checkGoogleAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
