import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase, signInWithPassword, signUpWithPassword, signOut, type User } from "@/lib/supabase";
import { setAuthTokenProvider, setBaseUrl } from "@workspace/api-client-react";

export type GoogleScopeType = "drive" | "sheets" | "slides";

export interface GoogleAuthStatus {
    drive: boolean;
    sheets: boolean;
    slides: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    /** true if any Google scope is connected (backwards compat) */
    hasGoogleAuth: boolean;
    googleAuthStatus: GoogleAuthStatus;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    connectGoogle: (scope?: GoogleScopeType) => Promise<void>;
    disconnectGoogle: (scope?: GoogleScopeType) => Promise<void>;
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
    const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus>({ drive: false, sheets: false, slides: false });

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
                // Legacy 'all' tokens count for all scopes
                const legacy = data.connected && !data.drive && !data.sheets && !data.slides;
                setGoogleAuthStatus({
                    drive: data.drive || legacy,
                    sheets: data.sheets || legacy,
                    slides: data.slides || legacy,
                });
            }
        } catch {
            setGoogleAuthStatus({ drive: false, sheets: false, slides: false });
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
                setGoogleAuthStatus({ drive: false, sheets: false, slides: false });
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
        setGoogleAuthStatus({ drive: false, sheets: false, slides: false });
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

    const disconnectGoogle = async (scope?: GoogleScopeType) => {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
        const url = scope
            ? `${apiUrl}/api/auth/google/disconnect?scope=${scope}`
            : `${apiUrl}/api/auth/google/disconnect`;
        const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${res.status})`);
        }
        if (scope) {
            setGoogleAuthStatus(prev => ({ ...prev, [scope]: false }));
        } else {
            setGoogleAuthStatus({ drive: false, sheets: false, slides: false });
        }
    };

    const hasGoogleAuth = googleAuthStatus.drive || googleAuthStatus.sheets || googleAuthStatus.slides;

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
