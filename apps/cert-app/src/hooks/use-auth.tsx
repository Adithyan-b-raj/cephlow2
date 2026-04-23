import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase, signInWithPassword, signUpWithPassword, signOut, type User } from "@/lib/supabase";
import { setAuthTokenProvider, setBaseUrl } from "@workspace/api-client-react";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    hasGoogleAuth: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    connectGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasGoogleAuth, setHasGoogleAuth] = useState(false);

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
                setHasGoogleAuth(data.connected);
            }
        } catch {
            setHasGoogleAuth(false);
        }
    }, []);

    useEffect(() => {
        // Load initial session (handles OAuth redirect token exchange automatically)
        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null);
            setLoading(false);
            if (data.session?.user) checkGoogleAuth();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            setLoading(false);
            if (session?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
                checkGoogleAuth();
            } else if (!session?.user) {
                setHasGoogleAuth(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [checkGoogleAuth]);

    // Handle ?google_auth=success/error redirect from the OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get("google_auth");
        if (result === "success") {
            setHasGoogleAuth(true);
            params.delete("google_auth");
            const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
            window.history.replaceState({}, "", newUrl);
        } else if (result === "error") {
            params.delete("google_auth");
            params.delete("reason");
            const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
            window.history.replaceState({}, "", newUrl);
        }
    }, []);

    const login = async (email: string, password: string) => {
        await signInWithPassword(email, password);
    };

    const signup = async (email: string, password: string) => {
        await signUpWithPassword(email, password);
    };

    const logout = async () => {
        await signOut();
        setUser(null);
        setHasGoogleAuth(false);
    };

    const connectGoogle = async () => {
        const token = await getAccessToken();
        if (!token) return;
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
        const res = await fetch(`${apiUrl}/api/auth/google/url`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const { url } = await res.json();
            window.location.href = url;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, hasGoogleAuth, login, signup, logout, connectGoogle }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
