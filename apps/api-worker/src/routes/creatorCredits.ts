import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { sendEmail } from "../lib/email.js";

const router = new Hono<ContextEnv>();

const ADMIN_EMAIL = "cephlow@gmail.com";
const YEARLY_CREDIT_LIMIT = 20000;

function isAdmin(email: string | undefined): boolean {
  return email === ADMIN_EMAIL;
}

// 1. GET /api/creator/credits
router.get("/creator/credits", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const profile = await c.env.DB.prepare(`
      SELECT creator_credits, creator_name FROM user_profiles WHERE id = ?
    `).bind(user.uid).first<{ creator_credits: number; creator_name: string }>();

    return c.json({
      creatorCredits: profile?.creator_credits ?? 0,
      creatorName: profile?.creator_name ?? "",
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. PATCH /api/creator/name
router.patch("/creator/name", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const { name } = await c.req.json().catch(() => ({}));
    if (typeof name !== "string" || !name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    if (name.trim().length > 40) {
      return c.json({ error: "name must be 40 characters or fewer" }, 400);
    }

    await c.env.DB.prepare(`
      UPDATE user_profiles
      SET creator_name = ?
      WHERE id = ?
    `).bind(name.trim(), user.uid).run();

    return c.json({ creatorName: name.trim() });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. POST /api/creator/credits/transfer
router.post("/creator/credits/transfer", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const { amount, targetWorkspaceId } = await c.req.json().catch(() => ({}));

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return c.json({ error: "amount must be a positive number" }, 400);
    }
    if (amount !== Math.floor(amount)) {
      return c.json({ error: "amount must be a whole number" }, 400);
    }
    if (!targetWorkspaceId || typeof targetWorkspaceId !== "string") {
      return c.json({ error: "targetWorkspaceId is required" }, 400);
    }

    // A. Read user profile & creator credits
    const profile = await c.env.DB.prepare(`
      SELECT creator_credits FROM user_profiles WHERE id = ?
    `).bind(user.uid).first<{ creator_credits: number }>();
    if (!profile) return c.json({ error: "User profile not found" }, 404);
    if (profile.creator_credits < amount) {
      return c.json({ error: "Insufficient credits", available: profile.creator_credits }, 400);
    }

    // B. Verify membership of target workspace
    const member = await c.env.DB.prepare(`
      SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?
    `).bind(targetWorkspaceId, user.uid).first();
    if (!member) return c.json({ error: "Not a member of this workspace" }, 403);

    // C. Read target workspace balance
    const ws = await c.env.DB.prepare(`
      SELECT current_balance FROM workspaces WHERE id = ?
    `).bind(targetWorkspaceId).first<{ current_balance: number }>();
    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    const newCreatorCredits = profile.creator_credits - amount;
    const newWorkspaceBalance = ws.current_balance + amount;

    // D. Run atomic transfer in a batch
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user_profiles SET creator_credits = ? WHERE id = ?`).bind(newCreatorCredits, user.uid),
      c.env.DB.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newWorkspaceBalance, targetWorkspaceId),
      c.env.DB.prepare(`
        INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
        VALUES (?, ?, ?, 'topup', ?, ?, 'Creator credits transferred to workspace', ?)
      `).bind(
        crypto.randomUUID(), targetWorkspaceId, user.uid, amount, newWorkspaceBalance, JSON.stringify({ source: "creator_credit_transfer" })
      )
    ]);

    return c.json({
      success: true,
      newCreatorCredits,
      newWorkspaceBalance,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. POST /api/creator/credits/redeem
router.post("/creator/credits/redeem", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const { amount, brand } = await c.req.json().catch(() => ({}));

    if (!amount || typeof amount !== "number" || amount < 100) {
      return c.json({ error: "amount must be at least ₹100" }, 400);
    }
    if (!Number.isInteger(amount)) {
      return c.json({ error: "amount must be a whole number" }, 400);
    }
    if (!["amazon", "flipkart"].includes(brand)) {
      return c.json({ error: "brand must be 'amazon' or 'flipkart'" }, 400);
    }

    // A. Check if user already has a pending request
    const existingPending = await c.env.DB.prepare(`
      SELECT id FROM redemption_requests WHERE user_id = ? AND status = 'pending'
    `).bind(user.uid).first();
    
    if (existingPending) {
      return c.json({
        error: "You already have a pending redemption request. Wait for it to be processed before submitting another.",
      }, 429);
    }

    // B. Check annual cap (₹20,000 per calendar year)
    const yearStartIso = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
    const yearly = await c.env.DB.prepare(`
      SELECT SUM(amount) as total FROM redemption_requests
      WHERE user_id = ? AND status IN ('pending', 'fulfilled') AND created_at >= ?
    `).bind(user.uid, yearStartIso).first<{ total: number }>();
    const yearlyUsed = yearly?.total || 0;

    if (yearlyUsed + amount > YEARLY_CREDIT_LIMIT) {
      return c.json({
        error: "Annual redemption cap reached",
        yearlyUsed,
        yearlyLimit: YEARLY_CREDIT_LIMIT,
      }, 400);
    }

    // C. Read user profile and deduct credits
    const profile = await c.env.DB.prepare(`
      SELECT creator_credits, creator_name FROM user_profiles WHERE id = ?
    `).bind(user.uid).first<{ creator_credits: number; creator_name: string }>();
    if (!profile) return c.json({ error: "User profile not found" }, 404);
    if (profile.creator_credits < amount) {
      return c.json({ error: "Insufficient credits", available: profile.creator_credits }, 400);
    }

    const newCreatorCredits = profile.creator_credits - amount;
    const requestId = crypto.randomUUID();
    const userEmail = user.email || "";

    // D. Run atomic deduction and insert request
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE user_profiles SET creator_credits = ? WHERE id = ?`).bind(newCreatorCredits, user.uid),
      c.env.DB.prepare(`
        INSERT INTO redemption_requests (id, user_id, amount, brand, status, payment_info, notes)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).bind(
        requestId, user.uid, amount, brand,
        JSON.stringify({ email: userEmail, creator_name: profile.creator_name }),
        `Creator: ${profile.creator_name || userEmail}`
      )
    ]);

    // Send email notification to admin (non-blocking)
    const brandLabel = brand === "amazon" ? "Amazon India" : "Flipkart";
    sendEmail(c.env, {
      to: ADMIN_EMAIL,
      subject: `[Action needed] New ₹${amount} ${brandLabel} voucher request`,
      body: [
        `A creator has submitted a gift voucher redemption request.`,
        ``,
        `Creator: ${profile.creator_name || userEmail}`,
        `Email:   ${userEmail}`,
        `Brand:   ${brandLabel}`,
        `Amount:  ₹${amount}`,
        `Request ID: ${requestId}`,
        ``,
        `Review and fulfill at: https://cephlow.in/admin/redemptions`,
      ].join("\n"),
    }).catch(() => null);

    return c.json({
      success: true,
      requestId,
      newCreatorCredits,
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. GET /api/creator/credits/redemptions
router.get("/creator/credits/redemptions", authMiddleware, async (c) => {
  const user = c.get("user")!;
  try {
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(50, parseInt(c.req.query("limit") || "20") || 20);
    const offset = (page - 1) * limit;

    const { results } = await c.env.DB.prepare(`
      SELECT id, amount, brand, status, payment_info as voucher_info, notes as admin_note, created_at, updated_at
      FROM redemption_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.uid, limit, offset).all<any>();

    const totalRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM redemption_requests WHERE user_id = ?
    `).bind(user.uid).first<{ count: number }>();

    // Annual totals
    const yearStartIso = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
    const yearly = await c.env.DB.prepare(`
      SELECT SUM(amount) as total FROM redemption_requests
      WHERE user_id = ? AND status IN ('pending', 'fulfilled') AND created_at >= ?
    `).bind(user.uid, yearStartIso).first<{ total: number }>();
    const yearlyUsed = yearly?.total || 0;

    const requests = results.map(r => {
      let voucherCode = null;
      let adminNote = r.admin_note || null;
      if (r.status === "fulfilled") {
        try {
          const info = JSON.parse(r.voucher_info);
          voucherCode = info.voucher_code || null;
          adminNote = info.admin_note || adminNote;
        } catch {}
      }
      return {
        id: r.id,
        amount: r.amount,
        brand: r.brand,
        status: r.status,
        voucherCode,
        adminNote,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return c.json({
      requests,
      total: totalRow?.count || 0,
      yearlyUsed,
      yearlyLimit: YEARLY_CREDIT_LIMIT,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── ADMIN ENDPOINTS ───

// 6. GET /api/admin/redemptions
router.get("/admin/redemptions", authMiddleware, async (c) => {
  const user = c.get("user")!;
  if (!isAdmin(user.email)) return c.json({ error: "Forbidden" }, 403);

  try {
    const status = c.req.query("status") || "pending";
    const page = Math.max(1, parseInt(c.req.query("page") || "1") || 1);
    const limit = Math.min(100, parseInt(c.req.query("limit") || "50") || 50);
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM redemption_requests";
    const params: any[] = [];

    if (status !== "all") {
      query += " WHERE status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at ASC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await c.env.DB.prepare(query).bind(...params).all<any>();

    let countQuery = "SELECT COUNT(*) as count FROM redemption_requests";
    if (status !== "all") {
      countQuery += " WHERE status = ?";
    }
    const countRow = await c.env.DB.prepare(countQuery).bind(...(status !== "all" ? [status] : [])).first<{ count: number }>();

    return c.json({ requests: results || [], total: countRow?.count || 0 });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. PATCH /api/admin/redemptions/:id/fulfill
router.patch("/admin/redemptions/:id/fulfill", authMiddleware, async (c) => {
  const user = c.get("user")!;
  if (!isAdmin(user.email)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  try {
    const { voucherCode, adminNote } = await c.req.json().catch(() => ({}));

    if (!voucherCode || typeof voucherCode !== "string" || !voucherCode.trim()) {
      return c.json({ error: "voucherCode is required" }, 400);
    }

    const request = await c.env.DB.prepare(`
      SELECT * FROM redemption_requests WHERE id = ?
    `).bind(id).first<any>();

    if (!request) return c.json({ error: "Request not found" }, 404);
    if (request.status !== "pending") return c.json({ error: "Request already processed" }, 409);

    let paymentInfo: Record<string, any> = {};
    try { paymentInfo = JSON.parse(request.payment_info || "{}"); } catch {}
    
    // Enrich paymentInfo with voucher details
    paymentInfo.voucher_code = voucherCode.trim();
    paymentInfo.admin_note = adminNote || null;

    await c.env.DB.prepare(`
      UPDATE redemption_requests 
      SET status = 'fulfilled', payment_info = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(paymentInfo), adminNote ?? null, id).run();

    const brandName = request.brand === "amazon" ? "Amazon India" : "Flipkart";
    const redeemUrl = request.brand === "amazon"
      ? "https://www.amazon.in/gc/redeem"
      : "https://www.flipkart.com/offers-store/giftcard/redeem";

    const creatorName = paymentInfo.creator_name || "there";
    const creatorEmail = paymentInfo.email || "";

    if (creatorEmail) {
      sendEmail(c.env, {
        to: creatorEmail,
        subject: `Your Cephlow ₹${request.amount} ${brandName} voucher is ready`,
        body: [
          `Hi ${creatorName},`,
          ``,
          `Your creator credit redemption has been processed!`,
          ``,
          `Brand:  ${brandName}`,
          `Amount: ₹${request.amount}`,
          `Code:   ${voucherCode.trim()}`,
          ``,
          `Redeem at: ${redeemUrl}`,
          ``,
          `This voucher was issued as a goodwill reward from your Cephlow creator credits.`,
          `Recipients are responsible for any applicable taxes on received benefits.`,
          ``,
          `If you have any issues, reply to this email.`,
          ``,
          `— Cephlow Team`,
        ].join("\n"),
      }).catch(() => null);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. PATCH /api/admin/redemptions/:id/reject
router.patch("/admin/redemptions/:id/reject", authMiddleware, async (c) => {
  const user = c.get("user")!;
  if (!isAdmin(user.email)) return c.json({ error: "Forbidden" }, 403);

  const { id } = c.req.param();
  try {
    const { adminNote } = await c.req.json().catch(() => ({}));

    const request = await c.env.DB.prepare(`
      SELECT * FROM redemption_requests WHERE id = ?
    `).bind(id).first<any>();

    if (!request) return c.json({ error: "Request not found" }, 404);
    if (request.status !== "pending") return c.json({ error: "Request already processed" }, 409);

    // D1 Batch to reject request and refund credits
    const profile = await c.env.DB.prepare(`
      SELECT creator_credits FROM user_profiles WHERE id = ?
    `).bind(request.user_id).first<{ creator_credits: number }>();
    const refundedCredits = (profile?.creator_credits || 0) + request.amount;

    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE redemption_requests 
        SET status = 'rejected', notes = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(adminNote ?? null, id),
      c.env.DB.prepare(`
        UPDATE user_profiles SET creator_credits = ? WHERE id = ?
      `).bind(refundedCredits, request.user_id)
    ]);

    let paymentInfo: Record<string, any> = {};
    try { paymentInfo = JSON.parse(request.payment_info || "{}"); } catch {}
    
    const creatorEmail = paymentInfo.email || "";
    const creatorName = paymentInfo.creator_name || "there";
    const brandName = request.brand === "amazon" ? "Amazon India" : "Flipkart";

    if (creatorEmail) {
      sendEmail(c.env, {
        to: creatorEmail,
        subject: `Your Cephlow voucher request — update`,
        body: [
          `Hi ${creatorName},`,
          ``,
          `We weren't able to process your ₹${request.amount} ${brandName} voucher request at this time.`,
          adminNote ? `Reason: ${adminNote}` : ``,
          ``,
          `Your ₹${request.amount} in creator credits has been refunded to your account.`,
          `You can submit a new request anytime from the Frame Inventory → Credits tab.`,
          ``,
          `— Cephlow Team`,
        ].filter(Boolean).join("\n"),
      }).catch(() => null);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
