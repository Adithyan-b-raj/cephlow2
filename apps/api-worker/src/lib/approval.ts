import type { Env } from "../types.js";

/**
 * Returns true if the user has been manually approved as an organization.
 * Anyone without a row in user_profiles is treated as unapproved.
 */
export async function isUserApproved(db: D1Database, userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const row = await db.prepare(`
      SELECT is_approved FROM user_profiles WHERE id = ?
    `).bind(userId).first<{ is_approved: number }>();
    return Boolean(row?.is_approved);
  } catch (err: any) {
    console.warn("[approval] failed to read user_profiles:", err.message);
    return false;
  }
}

/**
 * Returns true if the user is approved OR if they are a member of a workspace
 * whose owner is approved. This lets workspace members inherit org-level access.
 */
export async function isApprovedInContext(
  db: D1Database,
  userId: string,
  workspaceId?: string | null
): Promise<boolean> {
  if (!userId) return false;
  if (await isUserApproved(db, userId)) return true;
  if (!workspaceId) return false;

  // Check workspace owner's approval
  try {
    const ws = await db.prepare(`
      SELECT owner_id FROM workspaces WHERE id = ?
    `).bind(workspaceId).first<{ owner_id: string }>();

    if (!ws?.owner_id || ws.owner_id === userId) return false;
    return isUserApproved(db, ws.owner_id);
  } catch (err: any) {
    console.warn("[approval] failed to check workspace owner approval:", err.message);
    return false;
  }
}

export const FEATURE_KEYS = [
  "whatsapp_delivery",
  "custom_event_banners",
  "google_slides_templates",
  "qr_codes",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Returns true if the given workspace has been explicitly granted the given
 * feature via workspace_features. Distinct from the coarser is_approved gate.
 */
export async function hasFeature(
  db: D1Database,
  workspaceId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  if (!workspaceId) return false;
  const row = await db.prepare(`
    SELECT enabled FROM workspace_features WHERE workspace_id = ? AND feature_key = ?
  `).bind(workspaceId, featureKey).first<{ enabled: number }>();
  return Boolean(row?.enabled);
}

/**
 * Returns the enabled state of every known feature for a workspace, keyed by
 * feature_key. Missing rows default to false.
 */
export async function getWorkspaceFeatures(
  db: D1Database,
  workspaceId: string
): Promise<Record<FeatureKey, boolean>> {
  const result: Record<string, boolean> = Object.fromEntries(FEATURE_KEYS.map((k) => [k, false]));
  if (!workspaceId) return result as Record<FeatureKey, boolean>;

  const { results } = await db.prepare(`
    SELECT feature_key, enabled FROM workspace_features WHERE workspace_id = ?
  `).bind(workspaceId).all<{ feature_key: string; enabled: number }>();

  for (const row of results) {
    result[row.feature_key] = Boolean(row.enabled);
  }
  return result as Record<FeatureKey, boolean>;
}

/**
 * Ensure a user_profiles row exists for the user. Idempotent — used on
 * every call to /api/me/approval so the row is auto-created on first
 * sign-in (default is_approved=false).
 */
export async function ensureUserProfile(
  db: D1Database,
  userId: string,
  email?: string | null
): Promise<void> {
  if (!userId) return;
  try {
    // SQLite upsert
    await db.prepare(`
      INSERT INTO user_profiles (id, email)
      VALUES (?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(userId, email ?? null).run();
  } catch (err: any) {
    console.warn("[approval] ensureUserProfile failed:", err.message);
  }
}
