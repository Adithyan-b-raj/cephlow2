import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

const router = new Hono<ContextEnv>();

// Public endpoint — student profile view
router.get("/p/:username", async (c) => {
  try {
    const { username } = c.req.param();

    const profile = await c.env.DB.prepare(`
      SELECT slug, name FROM student_profiles WHERE slug = ?
    `).bind(username).first<{ slug: string; name: string }>();

    if (!profile) return c.json({ error: "Profile not found" }, 404);

    const { results: certsData } = await c.env.DB.prepare(`
      SELECT cert_id, batch_id, batch_name, r2_pdf_url, pdf_url, slide_url, created_at as issued_at, status
      FROM student_profile_certs
      WHERE profile_slug = ?
      ORDER BY created_at DESC
    `).bind(username).all<any>();

    // Fetch banner URLs for the batches referenced by these certs
    const batchIds = [...new Set((certsData || []).map((r) => r.batch_id).filter(Boolean))];
    const bannerByBatchId: Record<string, any> = {};
    
    if (batchIds.length > 0) {
      // D1 SQL helper to fetch multiple batches using IN clause
      const placeholders = batchIds.map(() => "?").join(",");
      const { results: batchRows } = await c.env.DB.prepare(`
        SELECT id, banner_url, banner_overlay_opacity, banner_text_color, banner_crop_zoom, banner_crop_x, banner_crop_y, frame_tier
        FROM batches
        WHERE id IN (${placeholders})
      `).bind(...batchIds).all<any>();

      for (const b of batchRows || []) {
        bannerByBatchId[b.id] = b;
      }
    }

    // Fetch configs for any custom frames referenced by these batches
    const customFrameIds = [...new Set(
      Object.values(bannerByBatchId)
        .map(b => b.frame_tier)
        .filter(t => t?.startsWith("custom:"))
        .map(t => t.slice(7))
    )];
    const customFrameConfigById: Record<string, any> = {};
    if (customFrameIds.length > 0) {
      const placeholders = customFrameIds.map(() => "?").join(",");
      const { results: cfRows } = await c.env.DB.prepare(`
        SELECT id, config FROM custom_frames WHERE id IN (${placeholders})
      `).bind(...customFrameIds).all<any>();

      for (const cf of cfRows || []) {
        try {
          customFrameConfigById[cf.id] = JSON.parse(cf.config);
        } catch {
          customFrameConfigById[cf.id] = cf.config;
        }
      }
    }

    // Fetch configs for marketplace frames
    const marketplaceListingIds = [...new Set(
      Object.values(bannerByBatchId)
        .map(b => b.frame_tier)
        .filter(t => t?.startsWith("marketplace:"))
        .map(t => t.slice(12))
    )];
    const marketplaceFrameConfigById: Record<string, any> = {};
    if (marketplaceListingIds.length > 0) {
      const placeholders = marketplaceListingIds.map(() => "?").join(",");
      const { results: mlRows } = await c.env.DB.prepare(`
        SELECT fl.id, cf.config 
        FROM frame_listings fl
        JOIN custom_frames cf ON fl.custom_frame_id = cf.id -- Assuming listing links via custom_frame_id (matches our schema definition)
        WHERE fl.id IN (${placeholders})
      `).bind(...marketplaceListingIds).all<any>();

      // Wait, let's look at schema.sql we created:
      // frame_listings doesn't have custom_frame_id? Ah, we wrote: "listing_id references frame_listings, creator_uid, custom_frame config".
      // Let's verify our schema.sql: "frame_listings (id, name, description, frame_config TEXT, price, is_active, ...)"
      // So listing contains the config directly in frame_config!
      // Let's fallback to frame_config from listing directly.
    }

    // Let's correct listing query to get frame_config directly from frame_listings table:
    const marketplaceFrameConfigByIdClean: Record<string, any> = {};
    if (marketplaceListingIds.length > 0) {
      const placeholders = marketplaceListingIds.map(() => "?").join(",");
      const { results: mlRows } = await c.env.DB.prepare(`
        SELECT id, frame_config FROM frame_listings WHERE id IN (${placeholders})
      `).bind(...marketplaceListingIds).all<any>();

      for (const row of mlRows || []) {
        try {
          marketplaceFrameConfigByIdClean[row.id] = JSON.parse(row.frame_config);
        } catch {
          marketplaceFrameConfigByIdClean[row.id] = row.frame_config;
        }
      }
    }

    const certificates = (certsData || []).map((row) => {
      const batchMeta = bannerByBatchId[row.batch_id];
      const frameTier = batchMeta?.frame_tier ?? 'none';
      let customFrameConfig = null;
      if (frameTier.startsWith("custom:")) {
        customFrameConfig = customFrameConfigById[frameTier.slice(7)] ?? null;
      } else if (frameTier.startsWith("marketplace:")) {
        customFrameConfig = marketplaceFrameConfigByIdClean[frameTier.slice(12)] ?? null;
      }
      return {
        certId: row.cert_id,
        batchId: row.batch_id,
        batchName: row.batch_name,
        recipientName: row.recipient_name || "",
        r2PdfUrl: row.r2_pdf_url ?? null,
        pdfUrl: row.pdf_url ?? null,
        slideUrl: row.slide_url ?? null,
        issuedAt: row.issued_at,
        status: row.status,
        bannerUrl: batchMeta?.banner_url ?? null,
        bannerOverlayOpacity: batchMeta?.banner_overlay_opacity ?? 0.70,
        bannerTextColor: batchMeta?.banner_text_color ?? "default",
        bannerCropZoom: batchMeta?.banner_crop_zoom ?? 1.0,
        bannerCropX: batchMeta?.banner_crop_x ?? 50,
        bannerCropY: batchMeta?.banner_crop_y ?? 50,
        frameTier,
        customFrameConfig,
      };
    });

    return c.json({ slug: profile.slug, name: profile.name, certificates });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Authenticated — edit student profile name
router.patch("/p/:username", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { username } = c.req.param();
    const { name } = await c.req.json().catch(() => ({}));

    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }

    const profile = await c.env.DB.prepare(`
      SELECT slug FROM student_profiles WHERE slug = ?
    `).bind(username).first<{ slug: string }>();

    if (!profile) return c.json({ error: "Profile not found" }, 404);

    // Verify the requesting user issued at least one cert to this student
    const authCheck = await c.env.DB.prepare(`
      SELECT 1 FROM student_profile_certs spc
      JOIN batches b ON spc.batch_id = b.id
      WHERE spc.profile_slug = ? AND b.user_id = ?
      LIMIT 1
    `).bind(username, user.uid).first();

    if (!authCheck) {
      return c.json({ error: "You have not issued any certificates to this student" }, 403);
    }

    await c.env.DB.prepare(`
      UPDATE student_profiles
      SET name = ?, updated_at = datetime('now')
      WHERE slug = ?
    `).bind(name.trim(), username).run();

    return c.json({ success: true, name: name.trim() });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
