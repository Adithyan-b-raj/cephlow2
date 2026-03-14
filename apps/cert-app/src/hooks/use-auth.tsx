import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signInWithGoogle, signOut, type User } from "@/lib/firebase";
import { setAuthTokenProvider } from "@workspace/api-client-react";

const GOOGLE_TOKEN_KEY = "google_access_token";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    googleAccessToken: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    refreshGoogleToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
        () => sessionStorage.getItem(GOOGLE_TOKEN_KEY)
    );
    const googleAccessTokenRef = useRef<string | null>(
        sessionStorage.getItem(GOOGLE_TOKEN_KEY)
    );

    // Keep ref and sessionStorage in sync
    useEffect(() => {
        googleAccessTokenRef.current = googleAccessToken;
        if (googleAccessToken) {
            sessionStorage.setItem(GOOGLE_TOKEN_KEY, googleAccessToken);
        } else {
            sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
        }
    }, [googleAccessToken]);

    // Re-authenticate to get a fresh Google access token
    const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
        try {
            const result = await signInWithGoogle();
            setGoogleAccessToken(result.accessToken);
            return result.accessToken;
        } catch {
            return null;
        }
    }, []);

    // Configure the API client's auth token provider once
    useEffect(() => {
        setAuthTokenProvider(async () => {
            const currentUser = auth.currentUser;
            const idToken = currentUser ? await currentUser.getIdToken() : null;
            let token = googleAccessTokenRef.current;

            // If no Google access token and user is logged in, re-authenticate
            if (!token && currentUser) {
                try {
                    const result = await signInWithGoogle();
                    token = result.accessToken;
                    googleAccessTokenRef.current = token;
                    if (token) sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
                } catch {
                    // User may have blocked the popup
                }
            }

            return { idToken, googleAccessToken: token };
        });
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const login = async () => {
        const result = await signInWithGoogle();
        setGoogleAccessToken(result.accessToken);
    };

    const logout = async () => {
        await signOut();
        setUser(null);
        setGoogleAccessToken(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, googleAccessToken, login, logout, refreshGoogleToken }}>
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
