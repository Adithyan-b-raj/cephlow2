import { createClient } from "@supabase/supabase-js";
import { jwtVerify, createRemoteJWKSet } from "jose";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

// Admin client using service role key — bypasses RLS, backend-only
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

// Verify a Supabase JWT — tries JWKS (new RS256 keys) then falls back to legacy HMAC secret
export async function verifySupabaseJwt(token: string): Promise<{ uid: string; email?: string }> {
  // Try new asymmetric signing keys (JWKS) first
  try {
    const { payload } = await jwtVerify(token, jwks);
    const uid = payload.sub as string | undefined;
    if (uid) return { uid, email: payload["email"] as string | undefined };
  } catch {
    // fall through to legacy secret
  }

  // Fall back to legacy HMAC secret
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const uid = payload.sub as string | undefined;
      if (uid) return { uid, email: payload["email"] as string | undefined };
    } catch {
      // fall through
    }
  }

  throw new Error("Invalid or expired token");
}

// Convert snake_case DB row to camelCase for API responses
export function toCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

// Convert camelCase object to snake_case for DB inserts
export function toSnake(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

export interface Batch {
  id: string;
  userId: string;
  name: string;
  sheetId: string;
  sheetName: string;
  tabName?: string | null;
  templateId: string;
  templateName: string;
  columnMap: Record<string, string>;
  emailColumn: string;
  nameColumn: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  categoryColumn?: string | null;
  categoryTemplateMap?: Record<string, { templateId: string; templateName: string }> | null;
  categorySlideMap?: Record<string, number> | null;
  categorySlideIndexes?: any | null;
  status: string;
  driveFolderId?: string | null;
  pdfFolderId?: string | null;
  totalCount: number;
  generatedCount: number;
  sentCount: number;
  whatsappSentCount?: number;
  failedCount?: number;
  createdAt: string;
}

export interface Certificate {
  id: string;
  batchId: string;
  recipientName: string;
  recipientEmail: string;
  status: string;
  slideFileId?: string | null;
  slideUrl?: string | null;
  pdfFileId?: string | null;
  pdfUrl?: string | null;
  r2PdfUrl?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
  rowData?: Record<string, string> | null;
  isPaid?: boolean;
  requiresVisualRegen?: boolean;
  whatsappStatus?: string | null;
  whatsappMessageId?: string | null;
  createdAt: string;
  updatedAt?: string;
}
