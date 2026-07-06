import { Hono } from "hono";
import { verifyWebhookSignature } from "../lib/cashfree.js";

const router = new Hono<ContextEnv>();

// 1. GET /api/webhooks/whatsapp — Meta webhook verification challenge
router.get("/webhooks/whatsapp", (c) => {
  const verifyToken = c.env.SUPABASE_JWT_SECRET; // Or dedicated var, default to verification token
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const mode = c.req.query("hub.mode");

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp Webhook] Verification successful");
    c.status(200);
    return c.text(challenge || "");
  }
  return c.json({ error: "Verification failed" }, 403);
});

// 2. POST /api/webhooks/whatsapp — Meta status updates
router.post("/webhooks/whatsapp", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (body?.object !== "whatsapp_business_account") {
      return c.text("OK", 200);
    }

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;

        for (const status of change?.value?.statuses ?? []) {
          const wamid: string = status?.id;
          const rawStatus: string = status?.status;

          if (!wamid || !rawStatus) continue;

          const waStatus =
            rawStatus === "read"
              ? "read"
              : rawStatus === "delivered"
              ? "delivered"
              : rawStatus === "failed"
              ? "wa_failed"
              : null;

          if (!waStatus) continue;

          // Resolve message mapping from D1
          const msgRow = await c.env.DB.prepare(`
            SELECT cert_id FROM wa_messages WHERE wamid = ?
          `).bind(wamid).first<{ cert_id: string }>();

          if (!msgRow) continue;

          await c.env.DB.prepare(`
            UPDATE certificates SET whatsapp_status = ? WHERE id = ?
          `).bind(waStatus, msgRow.cert_id).run();

          console.log(`[WhatsApp Webhook] wamid=${wamid} status=${waStatus} cert=${msgRow.cert_id}`);
        }
      }
    }
  } catch (err: any) {
    console.error("[WhatsApp Webhook] Error processing payload:", err.message);
  }
  return c.text("OK", 200);
});

// 3. POST /api/webhooks/cashfree — Cashfree payment webhook
router.post("/webhooks/cashfree", async (c) => {
  try {
    const signature = c.req.header("x-webhook-signature") || "";
    const timestamp = c.req.header("x-webhook-timestamp") || "";
    const rawBody = await c.req.text();

    if (!signature || !timestamp || !rawBody) {
      return c.json({ error: "Missing webhook headers/body" }, 400);
    }

    const verified = await verifyWebhookSignature(
      signature,
      rawBody,
      timestamp,
      c.env.CASHFREE_SECRET_KEY
    );

    if (!verified) {
      console.error("[Cashfree Webhook] Invalid signature verification.");
      return c.json({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody);

    if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const { order, payment, customer_details } = payload.data || {};

      if (!order?.order_id || !payment?.payment_status || !customer_details?.customer_id) {
        console.warn("[Cashfree Webhook] Missing fields in payload");
        return c.text("OK", 200);
      }

      const orderId = order.order_id;
      const amount = payment.payment_amount;
      const customerId = customer_details.customer_id;
      const creditsPerRupee = Number(c.env.CREDITS_PER_RUPEE || 1);
      const credits = amount * creditsPerRupee;

      // Check if already processed
      const orderRow = await c.env.DB.prepare(`
        SELECT processed, workspace_id FROM payment_orders WHERE order_id = ?
      `).bind(orderId).first<{ processed: number; workspace_id: string }>();

      if (!orderRow) {
        console.warn(`[Cashfree Webhook] Order mapping not found for order: ${orderId}`);
        return c.text("OK", 200);
      }

      if (orderRow.processed) {
        console.log(`[Cashfree Webhook] Order ${orderId} already processed.`);
        return c.text("OK", 200);
      }

      // Fetch workspace balance
      const ws = await c.env.DB.prepare(`
        SELECT current_balance FROM workspaces WHERE id = ?
      `).bind(orderRow.workspace_id).first<{ current_balance: number }>();
      if (!ws) {
        return c.json({ error: "Workspace not found" }, 404);
      }

      const newBalance = ws.current_balance + credits;

      // Update workspace and map orders to processed
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newBalance, orderRow.workspace_id),
        c.env.DB.prepare(`
          INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
          VALUES (?, ?, ?, 'topup', ?, ?, 'Top-up via Cashfree', ?)
        `).bind(
          crypto.randomUUID(), orderRow.workspace_id, customerId, credits, newBalance,
          JSON.stringify({
            order_id: orderId,
            amount_rupees: amount,
            credits_per_rupee: creditsPerRupee,
            payment_id: payment.cf_payment_id || null,
            payment_method: payment.payment_group || null
          })
        ),
        c.env.DB.prepare(`UPDATE payment_orders SET processed = 1 WHERE order_id = ?`).bind(orderId),
      ]);

      console.log(`[Cashfree Webhook] Credited ${credits} credits (₹${amount}) to workspace ${orderRow.workspace_id} (Order: ${orderId})`);
    }

    return c.text("OK", 200);
  } catch (err: any) {
    console.error("[Cashfree Webhook] Error:", err.message);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});

export default router;
