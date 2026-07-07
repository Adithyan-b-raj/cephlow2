import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { workspaceMiddleware } from "../middleware/workspace.js";
import { createCashfreeOrder, fetchCashfreeOrder } from "../lib/cashfree.js";

const router = new Hono<ContextEnv>();

// 1. Create a payment order mapping
router.post("/payments/create-order", authMiddleware, workspaceMiddleware, async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const { amount } = await c.req.json().catch(() => ({}));
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return c.json({ error: "Invalid amount" }, 400);
    }
    const minRecharge = Number(c.env.MIN_RECHARGE_AMOUNT || 100);
    if (amount < minRecharge) {
      return c.json({ error: `Minimum recharge amount is Rs. ${minRecharge}` }, 400);
    }

    const phone = "9999999999"; // default standard value
    const email = user.email || "sandbox@example.com";
    const orderId = `order_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const frontendUrl = (c.env.FRONTEND_URL || c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");
    const returnUrl = `${frontendUrl}/?order_id=${orderId}`;

    const response = await createCashfreeOrder(c.env, {
      orderId,
      amount,
      customerId: user.uid,
      customerPhone: phone,
      customerEmail: email,
      returnUrl,
    });

    if (response.payment_session_id) {
      // Record order mapping in D1
      await c.env.DB.prepare(`
        INSERT INTO payment_orders (order_id, workspace_id, user_id, amount)
        VALUES (?, ?, ?, ?)
      `).bind(orderId, workspace.id, user.uid, amount).run();

      return c.json({
        payment_session_id: response.payment_session_id,
        order_id: response.order_id,
      });
    } else {
      console.error("Cashfree order failed to return payment_session_id");
      return c.json({ error: "Invalid response from payment gateway" }, 500);
    }
  } catch (err: any) {
    console.error("Cashfree create-order error:", err.message);
    return c.json({ error: "Payment gateway error: " + err.message }, 500);
  }
});

// 2. Client-initiated verification fallback
router.post("/payments/verify", authMiddleware, async (c) => {
  try {
    const { order_id } = await c.req.json().catch(() => ({}));
    if (!order_id || typeof order_id !== "string") {
      return c.json({ error: "order_id is required" }, 400);
    }

    console.log(`[Payment Verify] Checking D1 order: ${order_id}`);

    // A. Read the stored order
    const orderRow = await c.env.DB.prepare(`
      SELECT workspace_id, user_id, amount, processed FROM payment_orders WHERE order_id = ?
    `).bind(order_id).first<any>();

    if (!orderRow) {
      console.warn(`[Payment Verify] Order not found in D1: ${order_id}`);
      return c.json({ error: "Order not found" }, 404);
    }

    // B. Check if already processed
    if (orderRow.processed) {
      console.log(`[Payment Verify] Order ${order_id} already processed`);
      return c.json({ status: "already_processed", credited: false });
    }

    // C. Check status with Cashfree APIs
    let cfOrder: any;
    try {
      cfOrder = await fetchCashfreeOrder(c.env, order_id);
    } catch (err: any) {
      console.error(`[Payment Verify] Cashfree fetch error:`, err.message);
      return c.json({ error: "Could not verify with payment gateway" }, 502);
    }

    console.log(`[Payment Verify] Cashfree status: ${cfOrder?.order_status}`);

    if (cfOrder?.order_status !== "PAID") {
      return c.json({ status: cfOrder?.order_status || "UNKNOWN", credited: false });
    }

    // D. Confirmed — execute atomic top-up in D1 batch
    const amount = cfOrder.order_amount || orderRow.amount;
    const userId = orderRow.user_id;
    const workspaceId = orderRow.workspace_id;
    const creditsPerRupee = Number(c.env.CREDITS_PER_RUPEE || 1);
    const credits = amount * creditsPerRupee;

    // Fetch workspace balance
    const ws = await c.env.DB.prepare(`
      SELECT current_balance FROM workspaces WHERE id = ?
    `).bind(workspaceId).first<{ current_balance: number }>();
    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    const newBalance = ws.current_balance + credits;

    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newBalance, workspaceId),
      c.env.DB.prepare(`
        INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
        VALUES (?, ?, ?, 'topup', ?, ?, 'Top-up via Cashfree', ?)
      `).bind(
        crypto.randomUUID(), workspaceId, userId, credits, newBalance,
        JSON.stringify({ order_id, amount_rupees: amount, credits_per_rupee: creditsPerRupee, payment_source: "verify_fallback" })
      ),
      c.env.DB.prepare(`UPDATE payment_orders SET processed = 1 WHERE order_id = ?`).bind(order_id),
    ]);

    console.log(`[Payment Verify] ✅ Credited ${credits} credits (₹${amount}) to workspace ${workspaceId} (Order: ${order_id})`);
    return c.json({ status: "PAID", credited: true, amount, credits });
  } catch (err: any) {
    console.error("[Payment Verify] Error:", err.message);
    return c.json({ error: "Payment verification failed" }, 500);
  }
});

export default router;
