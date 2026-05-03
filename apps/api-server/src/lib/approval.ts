import { supabaseAdmin } from "@workspace/supabase";

/**
 * Returns true if the user has been manually approved as an organization.
 * Anyone without a row in user_profiles is treated as unapproved.
 *
 * Note: this project's user_profiles table is keyed by `id` (= auth.users.id),
 * not a separate `user_id` column.
 */
export async function isUserApproved(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("is_approved")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[approval] failed to read user_profiles:", error.message);
    return false;
  }
  return Boolean(data?.is_approved);
}

/**
 * Ensure a user_profiles row exists for the user. Idempotent — used on
 * every call to /api/me/approval so the row is auto-created on first
 * sign-in (default is_approved=false).
 */
export async function ensureUserProfile(
  userId: string,
  email?: string | null,
): Promise<void> {
  if (!userId) return;
  // Try to insert; ignore duplicate-PK errors (row already exists).
  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      { id: userId, email: email ?? null },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) {
    console.warn("[approval] ensureUserProfile failed:", error.message);
  }
}
