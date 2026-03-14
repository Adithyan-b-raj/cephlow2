import type { Request, Response, NextFunction } from "express";
import { auth } from "@workspace/firebase";

// Extend Express Request to include user info
declare global {
    namespace Express {
        interface Request {
            user?: {
                uid: string;
                email?: string;
            };
            googleAccessToken?: string;
        }
    }
}

/**
 * Middleware that verifies Firebase ID tokens from the Authorization header.
 * Also extracts the Google access token from x-google-access-token header.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const idToken = authHeader.split("Bearer ")[1];

    try {
        const decoded = await auth.verifyIdToken(idToken);
        req.user = {
            uid: decoded.uid,
            email: decoded.email,
        };

        // Google access token passed from the frontend
        const googleToken = req.headers["x-google-access-token"] as string | undefined;
        if (googleToken) {
            req.googleAccessToken = googleToken;
        }

        next();
    } catch (err: any) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
