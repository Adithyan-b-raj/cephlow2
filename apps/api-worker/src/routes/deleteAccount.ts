import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware } from "../middleware/auth.js";
import { isUserApproved } from "../lib/approval.js";

const router = new Hono<ContextEnv>();

const DeleteAccountSchema = z.object({
  email: z.string().email(),
});

router.post("/me/delete-account", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user || !user.uid) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = user.uid;
  const userEmail = user.email;

  if (!userEmail) {
    return c.json({ error: "Session email not found. Please log in again." }, 400);
  }

  // 1. Validate confirm email
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = DeleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Valid email confirmation is required" }, 400);
  }

  if (parsed.data.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
    return c.json({ error: "Email confirmation does not match your account email" }, 400);
  }

  const db = c.env.DB;

  try {
    // 2. Fetch all workspaces owned by this user
    const { results: ownedWorkspaces } = await db.prepare(`
      SELECT id FROM workspaces WHERE owner_id = ?
    `).bind(userId).all<{ id: string }>();

    const workspaceIds = (ownedWorkspaces || []).map((w) => w.id);
    const hasWorkspaces = workspaceIds.length > 0;

    // 3. Determine if the user is approved (paid tier)
    const isApproved = await isUserApproved(db, userId);

    if (hasWorkspaces) {
      const placeholders = workspaceIds.map(() => "?").join(",");

      if (isApproved) {
        // Ensure system dummy records exist
        await db.prepare(`
          INSERT OR IGNORE INTO user_profiles (id, email, is_approved)
          VALUES ('orphaned-system-user', 'orphaned@cephlow.in', 1)
        `).run();

        await db.prepare(`
          INSERT OR IGNORE INTO workspaces (id, name, owner_id)
          VALUES ('orphaned-system-workspace', 'Orphaned Certificates Archive', 'orphaned-system-user')
        `).run();

        // Scenario B: Paid User - Decouple & Orphan generated/sent batches
        // Update batches with active certificates to system-owned dummy workspace
        await db.prepare(`
          UPDATE batches
          SET user_id = 'orphaned-system-user', workspace_id = 'orphaned-system-workspace'
          WHERE workspace_id IN (${placeholders}) AND status IN ('generating', 'sending', 'partial', 'completed')
        `).bind(...workspaceIds).run();
      }

      // Orphan listings and custom frames that have been purchased by other workspaces
      const { results: purchasedListings } = await db.prepare(`
        SELECT id, frame_id FROM frame_listings 
        WHERE workspace_id IN (${placeholders}) AND id IN (
          SELECT DISTINCT listing_id FROM frame_purchases WHERE workspace_id NOT IN (${placeholders})
        )
      `).bind(...workspaceIds, ...workspaceIds).all<{ id: string; frame_id: string }>();

      if (purchasedListings && purchasedListings.length > 0) {
        const listingIds = purchasedListings.map((l) => l.id).filter(Boolean);
        const frameIds = purchasedListings.map((l) => l.frame_id).filter(Boolean);

        if (listingIds.length > 0 || frameIds.length > 0) {
          // Ensure system dummy records exist
          await db.prepare(`
            INSERT OR IGNORE INTO user_profiles (id, email, is_approved)
            VALUES ('orphaned-system-user', 'orphaned@cephlow.in', 1)
          `).run();

          await db.prepare(`
            INSERT OR IGNORE INTO workspaces (id, name, owner_id)
            VALUES ('orphaned-system-workspace', 'Orphaned Certificates Archive', 'orphaned-system-user')
          `).run();
        }

        if (listingIds.length > 0) {
          const listingPlaceholders = listingIds.map(() => "?").join(",");
          await db.prepare(`
            UPDATE frame_listings
            SET workspace_id = 'orphaned-system-workspace', published_by = 'orphaned-system-user'
            WHERE id IN (${listingPlaceholders})
          `).bind(...listingIds).run();
        }

        if (frameIds.length > 0) {
          const framePlaceholders = frameIds.map(() => "?").join(",");
          await db.prepare(`
            UPDATE custom_frames
            SET workspace_id = 'orphaned-system-workspace', created_by = 'orphaned-system-user'
            WHERE id IN (${framePlaceholders})
          `).bind(...frameIds).run();
        }
      }
    }

    // 4. Clean up / purge logic
    // Running sequentially (SQLite/D1 does not support nested transaction API in cloudflare workers easily)
    if (hasWorkspaces) {
      const placeholders = workspaceIds.map(() => "?").join(",");

      // Delete unpaid certs in workspaces
      await db.prepare(`
        DELETE FROM certificates 
        WHERE is_paid = 0 AND batch_id IN (SELECT id FROM batches WHERE workspace_id IN (${placeholders}))
      `).bind(...workspaceIds).run();

      // Delete certificates for draft batches (since we delete draft batches anyway)
      await db.prepare(`
        DELETE FROM certificates 
        WHERE batch_id IN (SELECT id FROM batches WHERE workspace_id IN (${placeholders}) AND status = 'draft')
      `).bind(...workspaceIds).run();

      // Delete draft batches
      await db.prepare(`
        DELETE FROM batches 
        WHERE workspace_id IN (${placeholders}) AND status = 'draft'
      `).bind(...workspaceIds).run();

      // Delete remaining batches (if any left that weren't preserved under orphaned system)
      await db.prepare(`
        DELETE FROM batches 
        WHERE workspace_id IN (${placeholders})
      `).bind(...workspaceIds).run();

      // Delete certificates belonging to deleted batches (safety cleanup)
      await db.prepare(`
        DELETE FROM certificates 
        WHERE batch_id NOT IN (SELECT id FROM batches)
      `).run();

      // Delete student profile certs associated with deleted batches
      await db.prepare(`
        DELETE FROM student_profile_certs 
        WHERE batch_id NOT IN (SELECT id FROM batches)
      `).run();

      // Delete brand kits, invites, features, spreadsheets, and templates
      await db.prepare(`DELETE FROM workspace_brands WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM workspace_invites WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM workspace_features WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM spreadsheets WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM builtin_templates WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM custom_frames WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM frame_listings WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM frame_purchases WHERE workspace_id IN (${placeholders})`).bind(...workspaceIds).run();
      await db.prepare(`DELETE FROM workspaces WHERE id IN (${placeholders})`).bind(...workspaceIds).run();
    }

    // Wipe user references across remaining workspace membership / logs
    await db.prepare(`DELETE FROM workspace_members WHERE user_id = ?`).bind(userId).run();
    await db.prepare(`DELETE FROM user_google_tokens WHERE user_id = ?`).bind(userId).run();
    await db.prepare(`DELETE FROM frame_likes WHERE user_id = ?`).bind(userId).run();
    await db.prepare(`DELETE FROM user_profiles WHERE id = ?`).bind(userId).run();

    // 5. Supabase Auth Delete User
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[deleteAccount] Supabase auth deletion failed:", authError.message);
      return c.json({ error: "Failed to delete login credentials. Please try again." }, 500);
    }

    return c.json({ success: true, message: "Account deleted successfully" });
  } catch (err: any) {
    console.error("[deleteAccount] error:", err);
    return c.json({ error: "An unexpected error occurred during account deletion" }, 500);
  }
});

export default router;
