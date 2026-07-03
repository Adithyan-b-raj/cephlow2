import { Router, type IRouter } from "express";
import { supabaseAdmin } from "@workspace/supabase";

const router: IRouter = Router();

// ─── GET /api/marketplace/listings ───────────────────────────────────────────
// Paginated active listings with frameConfig, alreadyPurchased, creator name, likes.
router.get("/marketplace/listings", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const workspaceId = req.workspace!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(48, parseInt(req.query.limit as string) || 24);
    const offset = (page - 1) * limit;

    const { data: listings, error, count } = await supabaseAdmin
      .from("frame_listings")
      .select("*, custom_frames!inner(config)", { count: "exact" })
      .eq("is_active", true)
      .order("like_count", { ascending: false })
      .order("purchase_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const listingIds = (listings || []).map((l: any) => l.id);
    const creatorIds = [...new Set((listings || []).map((l: any) => l.published_by as string))];

    const [purchasedSet, likedSet, creatorMap] = await Promise.all([
      listingIds.length > 0
        ? supabaseAdmin
            .from("frame_purchases")
            .select("listing_id")
            .eq("workspace_id", workspaceId)
            .in("listing_id", listingIds)
            .then(({ data }) => new Set((data || []).map((p: any) => p.listing_id)))
        : Promise.resolve(new Set<string>()),

      listingIds.length > 0
        ? supabaseAdmin
            .from("frame_likes")
            .select("listing_id")
            .eq("user_id", userId)
            .in("listing_id", listingIds)
            .then(({ data }) => new Set((data || []).map((l: any) => l.listing_id)))
        : Promise.resolve(new Set<string>()),

      creatorIds.length > 0
        ? supabaseAdmin
            .from("user_profiles")
            .select("id, creator_name, email")
            .in("id", creatorIds)
            .then(({ data }) => {
              const m = new Map<string, { name: string; email: string }>();
              (data || []).forEach((p: any) => m.set(p.id, { name: p.creator_name || "", email: p.email || "" }));
              return m;
            })
        : Promise.resolve(new Map<string, { name: string; email: string }>()),
    ]);

    const result = (listings || []).map((l: any) => {
      const creator = creatorMap.get(l.published_by);
      return {
        id: l.id,
        name: l.name,
        description: l.description,
        price: l.price,
        purchaseCount: l.purchase_count,
        likeCount: l.like_count ?? 0,
        publishedBy: l.published_by,
        creatorName: creator?.name || creator?.email?.split("@")[0] || "Unknown",
        isActive: l.is_active,
        frameConfig: l.custom_frames?.config ?? null,
        alreadyPurchased: purchasedSet.has(l.id),
        likedByMe: likedSet.has(l.id),
        createdAt: l.created_at,
      };
    });

    return res.json({ listings: result, total: count ?? 0, page });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/marketplace/listings/:id ───────────────────────────────────────
router.get("/marketplace/listings/:id", async (req, res) => {
  try {
    const workspaceId = req.workspace!.id;
    const { id } = req.params;

    const { data: listing, error } = await supabaseAdmin
      .from("frame_listings")
      .select("*, custom_frames!inner(config)")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const { data: purchase } = await supabaseAdmin
      .from("frame_purchases")
      .select("id")
      .eq("listing_id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const l = listing as any;
    return res.json({
      id: l.id,
      name: l.name,
      description: l.description,
      price: l.price,
      purchaseCount: l.purchase_count,
      publishedBy: l.published_by,
      frameConfig: l.custom_frames?.config ?? null,
      alreadyPurchased: !!purchase,
      createdAt: l.created_at,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/marketplace/my-workspace-frames ────────────────────────────────
// All marketplace frames this workspace has purchased (for gallery display in
// BatchBannerEditor and the Owned tab in FrameInventory).
router.get("/marketplace/my-workspace-frames", async (req, res) => {
  try {
    const workspaceId = req.workspace!.id;

    const { data, error } = await supabaseAdmin
      .from("frame_purchases")
      .select("listing_id, frame_listings!inner(id, name, custom_frames!inner(config))")
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    const purchases = (data || []).map((row: any) => ({
      listingId: row.listing_id,
      name: row.frame_listings?.name ?? "",
      config: row.frame_listings?.custom_frames?.config ?? null,
    }));

    return res.json({ purchases });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/marketplace/my-listings ────────────────────────────────────────
// Creator's own listings across all workspaces.
router.get("/marketplace/my-listings", async (req, res) => {
  try {
    const userId = req.user!.uid;

    const { data, error } = await supabaseAdmin
      .from("frame_listings")
      .select("*, custom_frames!inner(config)")
      .eq("published_by", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const listings = (data || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      price: l.price,
      purchaseCount: l.purchase_count,
      likeCount: l.like_count ?? 0,
      totalEarned: l.price * l.purchase_count,
      isActive: l.is_active,
      frameConfig: l.custom_frames?.config ?? null,
      createdAt: l.created_at,
    }));

    return res.json({ listings });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/marketplace/listings ──────────────────────────────────────────
// Publish a workspace frame to the marketplace.
router.post("/marketplace/listings", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const workspaceId = req.workspace!.id;
    const { frameId, name, description = "", price = 0 } = req.body;

    if (!frameId || typeof frameId !== "string") {
      return res.status(400).json({ error: "frameId is required" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const priceNum = Number(price);
    if (isNaN(priceNum) || (priceNum !== 0 && (priceNum < 20 || priceNum > 100))) {
      return res.status(400).json({ error: "price must be 0 or between 20 and 100" });
    }

    // Verify frame belongs to this workspace
    const { data: frame, error: frameErr } = await supabaseAdmin
      .from("custom_frames")
      .select("id")
      .eq("id", frameId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (frameErr || !frame) {
      return res.status(404).json({ error: "Frame not found in this workspace" });
    }

    // Only one active listing per frame
    const { data: existing } = await supabaseAdmin
      .from("frame_listings")
      .select("id")
      .eq("frame_id", frameId)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: "This frame already has an active listing" });
    }

    const { data: listing, error } = await supabaseAdmin
      .from("frame_listings")
      .insert({
        frame_id: frameId,
        published_by: userId,
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        price: priceNum,
      })
      .select()
      .single();
    if (error) throw error;

    return res.status(201).json({ listing });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/marketplace/listings/:id ─────────────────────────────────────
router.patch("/marketplace/listings/:id", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { id } = req.params;
    const { name, description, price, isActive } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("frame_listings")
      .select("id, published_by, frame_id")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !existing) return res.status(404).json({ error: "Listing not found" });
    if (existing.published_by !== userId) return res.status(403).json({ error: "Access denied" });

    if (price !== undefined) {
      const priceNum = Number(price);
      if (isNaN(priceNum) || (priceNum !== 0 && (priceNum < 20 || priceNum > 100))) {
        return res.status(400).json({ error: "price must be 0 or between 20 and 100" });
      }
    }

    // If re-activating, check no other active listing for same frame
    if (isActive === true) {
      const { data: other } = await supabaseAdmin
        .from("frame_listings")
        .select("id")
        .eq("frame_id", existing.frame_id)
        .eq("is_active", true)
        .neq("id", id)
        .maybeSingle();
      if (other) {
        return res.status(409).json({ error: "Another active listing already exists for this frame" });
      }
    }

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description.trim();
    if (price !== undefined) update.price = Number(price);
    if (isActive !== undefined) update.is_active = isActive;

    const { data, error } = await supabaseAdmin
      .from("frame_listings")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/marketplace/listings/:id ────────────────────────────────────
// Hard-delete only if no purchases exist. Otherwise use PATCH isActive=false.
router.delete("/marketplace/listings/:id", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { id } = req.params;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("frame_listings")
      .select("id, published_by, purchase_count")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr || !existing) return res.status(404).json({ error: "Listing not found" });
    if (existing.published_by !== userId) return res.status(403).json({ error: "Access denied" });

    if (existing.purchase_count > 0) {
      return res.status(409).json({
        error: "This listing has been purchased. Unpublish it instead (set isActive to false).",
      });
    }

    await supabaseAdmin.from("frame_listings").delete().eq("id", id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/marketplace/purchases/:listingId ─────────────────────────────
// Remove a marketplace frame from this workspace's owned collection.
router.delete("/marketplace/purchases/:listingId", async (req, res) => {
  try {
    const workspaceId = req.workspace!.id;
    const { listingId } = req.params;

    const { data: purchase, error: fetchErr } = await supabaseAdmin
      .from("frame_purchases")
      .select("id")
      .eq("listing_id", listingId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (fetchErr || !purchase) {
      return res.status(404).json({ error: "Purchase not found for this workspace" });
    }

    await supabaseAdmin.from("frame_purchases").delete().eq("id", purchase.id);

    // Decrement purchase_count on the listing
    const { data: listing } = await supabaseAdmin
      .from("frame_listings")
      .select("purchase_count")
      .eq("id", listingId)
      .maybeSingle();

    if (listing) {
      await supabaseAdmin
        .from("frame_listings")
        .update({ purchase_count: Math.max(0, (listing.purchase_count ?? 1) - 1) })
        .eq("id", listingId);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/marketplace/listings/:id/purchase ─────────────────────────────
// Atomic via purchase_marketplace_frame RPC — no partial-failure risk.
router.post("/marketplace/listings/:id/purchase", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const workspaceId = req.workspace!.id;
    const { id } = req.params;
    const { batchId } = req.body ?? {};

    const { data: result, error } = await supabaseAdmin.rpc("purchase_marketplace_frame", {
      p_listing_id:   id,
      p_workspace_id: workspaceId,
      p_user_id:      userId,
      p_batch_id:     batchId ?? null,
    });

    if (error) throw error;

    if (!result.success) {
      const status = result.error === "Insufficient workspace balance" ? 402 : 400;
      return res.status(status).json({
        error: result.error,
        required: result.required ?? undefined,
        available: result.available ?? undefined,
      });
    }

    return res.json({ success: true, alreadyOwned: result.alreadyOwned, frameTier: result.frameTier });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/marketplace/listings/:id/like ──────────────────────────────────
// Toggles the calling user's like on a listing. Returns { liked, likeCount }.
router.post("/marketplace/listings/:id/like", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from("frame_likes")
      .select("id")
      .eq("listing_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: listing } = await supabaseAdmin
      .from("frame_listings")
      .select("like_count")
      .eq("id", id)
      .maybeSingle();

    if (!listing) return res.status(404).json({ error: "Listing not found" });

    let liked: boolean;
    if (existing) {
      await supabaseAdmin.from("frame_likes").delete().eq("id", existing.id);
      await supabaseAdmin
        .from("frame_listings")
        .update({ like_count: Math.max(0, (listing.like_count ?? 1) - 1), updated_at: new Date().toISOString() })
        .eq("id", id);
      liked = false;
    } else {
      await supabaseAdmin.from("frame_likes").insert({ listing_id: id, user_id: userId });
      await supabaseAdmin
        .from("frame_listings")
        .update({ like_count: (listing.like_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", id);
      liked = true;
    }

    const { data: updated } = await supabaseAdmin
      .from("frame_listings")
      .select("like_count")
      .eq("id", id)
      .maybeSingle();

    return res.json({ liked, likeCount: updated?.like_count ?? 0 });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
