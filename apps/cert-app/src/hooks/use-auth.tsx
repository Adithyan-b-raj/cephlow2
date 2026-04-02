import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signInWithGoogle, signOut, type User } from "@/lib/firebase";
import { setAuthTokenProvider, setBaseUrl } from "@workspace/api-client-react";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    hasGoogleAuth: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    connectGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasGoogleAuth, setHasGoogleAuth] = useState(false);

    // Configure the API client to send the Firebase ID token on every request
    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) setBaseUrl(apiUrl);

        setAuthTokenProvider(async () => {
            const currentUser = auth.currentUser;
            return currentUser ? currentUser.getIdToken() : null;
        });
    }, []);

    // Check Google connection status after login
    const checkGoogleAuth = useCallback(async () => {
        try {
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) return;
            const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
            const res = await fetch(`${apiUrl}/api/auth/google/status`, {
                headers: { Authorization: `Bearer ${idToken}` },
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
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
            if (firebaseUser) {
                await checkGoogleAuth();
            } else {
                setHasGoogleAuth(false);
            }
        });
        return unsubscribe;
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

    const login = async () => {
        await signInWithGoogle();
    };

    const logout = async () => {
        await signOut();
        setUser(null);
        setHasGoogleAuth(false);
    };

    // Redirect user to Google OAuth consent screen to grant API access
    const connectGoogle = async () => {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
        const res = await fetch(`${apiUrl}/api/auth/google/url`, {
            headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
            const { url } = await res.json();
            window.location.href = url;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, hasGoogleAuth, login, logout, connectGoogle }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
