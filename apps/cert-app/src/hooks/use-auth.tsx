import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, signInWithGoogle, signOut, type User } from "@/lib/firebase";
import { setAuthTokenProvider, setGoogleTokenRefresher, setBaseUrl } from "@workspace/api-client-react";

const GOOGLE_TOKEN_KEY = "google_access_token";
const GOOGLE_TOKEN_EXPIRES_KEY = "google_access_token_expires_at";
// Google OAuth tokens expire in 3600s; refresh 5 minutes early to avoid mid-request expiry
const TOKEN_LIFETIME_MS = 55 * 60 * 1000;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    googleAccessToken: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    refreshGoogleToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function storeGoogleToken(
    tokenRef: React.MutableRefObject<string | null>,
    expiresAtRef: React.MutableRefObject<number | null>,
    token: string | null,
) {
    tokenRef.current = token;
    if (token) {
        const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
        expiresAtRef.current = expiresAt;
        sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
        sessionStorage.setItem(GOOGLE_TOKEN_EXPIRES_KEY, String(expiresAt));
    } else {
        expiresAtRef.current = null;
        sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
        sessionStorage.removeItem(GOOGLE_TOKEN_EXPIRES_KEY);
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
        () => sessionStorage.getItem(GOOGLE_TOKEN_KEY)
    );
    const googleAccessTokenRef = useRef<string | null>(
        sessionStorage.getItem(GOOGLE_TOKEN_KEY)
    );
    const googleTokenExpiresAtRef = useRef<number | null>(
        (() => {
            const stored = sessionStorage.getItem(GOOGLE_TOKEN_EXPIRES_KEY);
            return stored ? Number(stored) : null;
        })()
    );

    // Imperative helper so token + expiry always update together
    const setGoogleToken = useCallback((token: string | null) => {
        storeGoogleToken(googleAccessTokenRef, googleTokenExpiresAtRef, token);
        setGoogleAccessToken(token);
    }, []);

    // Re-authenticate to get a fresh Google access token
    const refreshGoogleToken = useCallback(async (): Promise<string | null> => {
        try {
            const result = await signInWithGoogle();
            setGoogleToken(result.accessToken);
            return result.accessToken;
        } catch {
            return null;
        }
    }, [setGoogleToken]);

    // Configure the API client's auth token provider once
    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) {
            setBaseUrl(apiUrl);
        }

        setAuthTokenProvider(async () => {
            const currentUser = auth.currentUser;
            const idToken = currentUser ? await currentUser.getIdToken() : null;
            let token = googleAccessTokenRef.current;

            // Proactively refresh if token is missing or expired (within 5-minute buffer)
            const isExpired =
                !googleTokenExpiresAtRef.current ||
                Date.now() >= googleTokenExpiresAtRef.current;

            if (currentUser && (!token || isExpired)) {
                try {
                    const result = await signInWithGoogle();
                    token = result.accessToken;
                    storeGoogleToken(googleAccessTokenRef, googleTokenExpiresAtRef, token);
                } catch {
                    // User may have blocked the popup; proceed with stale/null token
                }
            }

            return { idToken, googleAccessToken: token };
        });

        // Reactive fallback: if a 401 slips through, refresh and let custom-fetch retry
        setGoogleTokenRefresher(async () => {
            try {
                const result = await signInWithGoogle();
                const token = result.accessToken;
                storeGoogleToken(googleAccessTokenRef, googleTokenExpiresAtRef, token);
                return token;
            } catch {
                return null;
            }
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
        setGoogleToken(result.accessToken);
    };

    const logout = async () => {
        await signOut();
        setUser(null);
        setGoogleToken(null);
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
