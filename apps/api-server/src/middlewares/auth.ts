import type { Request, Response, NextFunction } from "express";
import { verifySupabaseJwt } from "@workspace/supabase";

declare global {
    namespace Express {
        interface Request {
            user?: {
                uid: string;
                email?: string;
            };
        }
    }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    let idToken = "";
    if (authHeader?.startsWith("Bearer ")) {
        idToken = authHeader.split("Bearer ")[1];
    } else if (req.query.token) {
        idToken = req.query.token as string;
    }

    if (!idToken) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }

    try {
        const decoded = await verifySupabaseJwt(idToken);
        req.user = { uid: decoded.uid, email: decoded.email };
        next();
        return;
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
