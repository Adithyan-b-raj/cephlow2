import { Hono } from "hono";
import { workspaceMiddleware } from "../middleware/workspace.js";

const router = new Hono<ContextEnv>();

router.use("/marketplace/*", workspaceMiddleware);

// 1. List active listings (paginated)
router.get("/marketplace/listings", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(48, parseInt(c.req.query("limit") || "24") || 24);
    const offset = (page - 1) * limit;

    // Join listings with custom_frames to retrieve the frame config
    const { results: listings } = await c.env.DB.prepare(`
      SELECT fl.*, cf.config as frame_config
      FROM frame_listings fl
      JOIN custom_frames cf ON fl.frame_id = cf.id
      WHERE fl.is_active = 1
      ORDER BY fl.like_count DESC, fl.purchase_count DESC, fl.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all<any>();

    const totalRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM frame_listings WHERE is_active = 1
    `).first<{ count: number }>();

    const listingIds = listings.map(l => l.id);
    const creatorIds = [...new Set(listings.map(l => l.published_by))];

    // Parallel fetch relationships
    const [purchasedSet, likedSet, creatorMap] = await Promise.all([
      listingIds.length > 0
        ? c.env.DB.prepare(`
            SELECT listing_id FROM frame_purchases
            WHERE workspace_id = ? AND listing_id IN (${listingIds.map(() => "?").join(",")})
          `).bind(workspace.id, ...listingIds).all<{ listing_id: string }>()
            .then(res => new Set((res.results || []).map(p => p.listing_id)))
        : Promise.resolve(new Set<string>()),

      listingIds.length > 0
        ? c.env.DB.prepare(`
            SELECT listing_id FROM frame_likes
            WHERE user_id = ? AND listing_id IN (${listingIds.map(() => "?").join(",")})
          `).bind(user.uid, ...listingIds).all<{ listing_id: string }>()
            .then(res => new Set((res.results || []).map(l => l.listing_id)))
        : Promise.resolve(new Set<string>()),

      creatorIds.length > 0
        ? c.env.DB.prepare(`
            SELECT id, email FROM user_profiles
            WHERE id IN (${creatorIds.map(() => "?").join(",")})
          `).bind(...creatorIds).all<any>()
            .then(res => {
              const m = new Map<string, { name: string; email: string }>();
              (res.results || []).forEach(p => m.set(p.id, { name: p.email?.split("@")[0] || "Unknown", email: p.email || "" }));
              return m;
            })
        : Promise.resolve(new Map<string, { name: string; email: string }>()),
    ]);

    const result = listings.map(l => {
      const creator = creatorMap.get(l.published_by);
      let parsedConfig = null;
      try { parsedConfig = JSON.parse(l.frame_config); } catch {}
      return {
        id: l.id,
        name: l.name,
        description: l.description,
        price: l.price,
        purchaseCount: l.purchase_count,
        likeCount: l.like_count ?? 0,
        publishedBy: l.published_by,
        creatorName: creator?.name || creator?.email?.split("@")[0] || "Unknown",
        isActive: Boolean(l.is_active),
        frameConfig: parsedConfig || l.frame_config,
        alreadyPurchased: purchasedSet.has(l.id),
        likedByMe: likedSet.has(l.id),
        createdAt: l.created_at,
      };
    });

    return c.json({ listings: result, total: totalRow?.count || 0, page });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Get listing detail
router.get("/marketplace/listings/:id", async (c) => {
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const listing = await c.env.DB.prepare(`
      SELECT fl.*, cf.config as frame_config
      FROM frame_listings fl
      JOIN custom_frames cf ON fl.frame_id = cf.id
      WHERE fl.id = ? AND fl.is_active = 1
    `).bind(id).first<any>();

    if (!listing) return c.json({ error: "Listing not found" }, 404);

    const purchase = await c.env.DB.prepare(`
      SELECT id FROM frame_purchases WHERE listing_id = ? AND workspace_id = ?
    `).bind(id, workspace.id).first();

    return c.json({
      id: listing.id,
      name: listing.name,
      description: listing.description,
      price: listing.price,
      purchaseCount: listing.purchase_count,
      publishedBy: listing.published_by,
      frameConfig: JSON.parse(listing.frame_config || "{}"),
      alreadyPurchased: !!purchase,
      createdAt: listing.created_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. All purchased frames for active workspace
router.get("/marketplace/my-workspace-frames", async (c) => {
  const workspace = c.get("workspace")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT fp.listing_id, fl.name, cf.config as frame_config
      FROM frame_purchases fp
      JOIN frame_listings fl ON fp.listing_id = fl.id
      JOIN custom_frames cf ON fl.frame_id = cf.id
      WHERE fp.workspace_id = ?
    `).bind(workspace.id).all<any>();

    const purchases = results.map(row => ({
      listingId: row.listing_id,
      name: row.name,
      config: JSON.parse(row.frame_config || "{}"),
    }));

    return c.json({ purchases });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Creator's own listings
router.get("/marketplace/my-listings", async (c) => {
  const user = c.get("user")!;
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT fl.*, cf.config as frame_config
      FROM frame_listings fl
      JOIN custom_frames cf ON fl.frame_id = cf.id
      WHERE fl.published_by = ?
      ORDER BY fl.created_at DESC
    `).bind(user.uid).all<any>();

    const listings = results.map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      price: l.price,
      purchaseCount: l.purchase_count,
      likeCount: l.like_count ?? 0,
      totalEarned: 0,
      isActive: Boolean(l.is_active),
      frameConfig: JSON.parse(l.frame_config || "{}"),
      createdAt: l.created_at,
    }));

    return c.json({ listings });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Publish listing
router.post("/marketplace/listings", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const { frameId, name, description = "" } = await c.req.json().catch(() => ({}));

    if (!frameId || typeof frameId !== "string") {
      return c.json({ error: "frameId is required" }, 400);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    const priceNum = 0;

    // Verify frame belongs to workspace
    const frame = await c.env.DB.prepare(`
      SELECT id FROM custom_frames WHERE id = ? AND workspace_id = ?
    `).bind(frameId, workspace.id).first();
    if (!frame) return c.json({ error: "Frame not found in this workspace" }, 404);

    // Only one active listing per frame
    const existing = await c.env.DB.prepare(`
      SELECT id FROM frame_listings WHERE frame_id = ? AND is_active = 1
    `).bind(frameId).first();
    if (existing) {
      return c.json({ error: "This frame already has an active listing" }, 409);
    }

    const listingId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO frame_listings (id, frame_id, published_by, workspace_id, name, description, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(listingId, frameId, user.uid, workspace.id, name.trim(), description.trim(), priceNum).run();

    const listing = await c.env.DB.prepare(`
      SELECT * FROM frame_listings WHERE id = ?
    `).bind(listingId).first<any>();

    return c.json({ listing }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. Update listing
router.patch("/marketplace/listings/:id", async (c) => {
  const user = c.get("user")!;
  const { id } = c.req.param();
  try {
    const { name, description, price, isActive } = await c.req.json().catch(() => ({}));

    const existing = await c.env.DB.prepare(`
      SELECT id, published_by, frame_id FROM frame_listings WHERE id = ?
    `).bind(id).first<any>();
    if (!existing) return c.json({ error: "Listing not found" }, 404);
    if (existing.published_by !== user.uid) return c.json({ error: "Access denied" }, 403);

    // Price is always 0, ignore input price

    // Check conflict re-activating
    if (isActive === true) {
      const other = await c.env.DB.prepare(`
        SELECT id FROM frame_listings WHERE frame_id = ? AND is_active = 1 AND id != ?
      `).bind(existing.frame_id, id).first();
      if (other) {
        return c.json({ error: "Another active listing already exists for this frame" }, 409);
      }
    }

    const fields: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    if (name !== undefined) {
      fields.push("name = ?");
      params.push(name.trim());
    }
    if (description !== undefined) {
      fields.push("description = ?");
      params.push(description.trim());
    }
    // Ignore price updates
    if (isActive !== undefined) {
      fields.push("is_active = ?");
      params.push(isActive ? 1 : 0);
    }

    params.push(id);

    await c.env.DB.prepare(`
      UPDATE frame_listings
      SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...params).run();

    const listing = await c.env.DB.prepare(`
      SELECT * FROM frame_listings WHERE id = ?
    `).bind(id).first<any>();

    return c.json(listing);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. Delete listing
router.delete("/marketplace/listings/:id", async (c) => {
  const user = c.get("user")!;
  const { id } = c.req.param();
  try {
    const existing = await c.env.DB.prepare(`
      SELECT id, published_by, purchase_count FROM frame_listings WHERE id = ?
    `).bind(id).first<any>();
    if (!existing) return c.json({ error: "Listing not found" }, 404);
    if (existing.published_by !== user.uid) return c.json({ error: "Access denied" }, 403);

    if (existing.purchase_count > 0) {
      return c.json({
        error: "This listing has been purchased. Unpublish it instead (set isActive to false).",
      }, 409);
    }

    await c.env.DB.prepare(`DELETE FROM frame_listings WHERE id = ?`).bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. Purchase listing (D1 Batch transaction)
router.post("/marketplace/listings/:id/purchase", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { id } = c.req.param();
  try {
    const { batchId } = await c.req.json().catch(() => ({}));

    // A. Read listing
    const listing = await c.env.DB.prepare(`
      SELECT * FROM frame_listings WHERE id = ? AND is_active = 1
    `).bind(id).first<any>();
    if (!listing) return c.json({ error: "Listing not found" }, 404);

    // B. Check if already purchased
    const already = await c.env.DB.prepare(`
      SELECT id FROM frame_purchases WHERE listing_id = ? AND workspace_id = ?
    `).bind(id, workspace.id).first();
    if (already) {
      return c.json({
        success: true, alreadyOwned: true, frameTier: `marketplace:${id}`
      });
    }

    const stmts = [];

    // G. Record purchase and increment purchase counts (free)
    stmts.push(c.env.DB.prepare(`
      INSERT INTO frame_purchases (listing_id, workspace_id, purchased_by, batch_id, amount_paid, creator_uid)
      VALUES (?, ?, ?, ?, 0, ?)
    `).bind(id, workspace.id, user.uid, batchId || null, listing.published_by));

    stmts.push(c.env.DB.prepare(`
      UPDATE frame_listings 
      SET purchase_count = purchase_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(id));

    await c.env.DB.batch(stmts);

    return c.json({
      success: true,
      alreadyOwned: false,
      frameTier: `marketplace:${id}`,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. Like/Unlike listing
router.post("/marketplace/listings/:id/like", async (c) => {
  const user = c.get("user")!;
  const { id } = c.req.param();
  try {
    const listing = await c.env.DB.prepare(`
      SELECT like_count FROM frame_listings WHERE id = ? AND is_active = 1
    `).bind(id).first<{ like_count: number }>();

    if (!listing) return c.json({ error: "Listing not found" }, 404);

    const existingLike = await c.env.DB.prepare(`
      SELECT 1 FROM frame_likes WHERE listing_id = ? AND user_id = ?
    `).bind(id, user.uid).first();

    let liked = false;
    let newLikeCount = listing.like_count ?? 0;

    if (existingLike) {
      newLikeCount = Math.max(0, newLikeCount - 1);
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM frame_likes WHERE listing_id = ? AND user_id = ?`).bind(id, user.uid),
        c.env.DB.prepare(`UPDATE frame_listings SET like_count = ?, updated_at = datetime('now') WHERE id = ?`).bind(newLikeCount, id),
      ]);
      liked = false;
    } else {
      newLikeCount += 1;
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO frame_likes (listing_id, user_id) VALUES (?, ?)`).bind(id, user.uid),
        c.env.DB.prepare(`UPDATE frame_listings SET like_count = ?, updated_at = datetime('now') WHERE id = ?`).bind(newLikeCount, id),
      ]);
      liked = true;
    }

    return c.json({ liked, likeCount: newLikeCount });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
