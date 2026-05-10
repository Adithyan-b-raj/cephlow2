import { Router } from "express";
import { supabaseAdmin } from "@workspace/supabase";
import { Cashfree, CFEnvironment } from "cashfree-pg";

const router = Router();

const env = process.env.VITE_CASHFREE_ENV === "PRODUCTION" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
const cashfree = new Cashfree(
  env,
  process.env.CASHFREE_APP_ID || "",
  process.env.CASHFREE_SECRET_KEY || "",
);

console.log(`[Webhooks Route] Initialized Cashfree SDK in ${process.env.VITE_CASHFREE_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX"} mode with App ID: ${process.env.CASHFREE_APP_ID?.substring(0, 10)}...`);

// GET /api/webhooks/whatsapp — Meta webhook verification challenge
router.get("/webhooks/whatsapp", (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WhatsApp Webhook] Verification successful");
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: "Verification failed" });
});

// POST /api/webhooks/whatsapp — Meta delivers status updates here
router.post("/webhooks/whatsapp", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body?.object !== "whatsapp_business_account") return;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;

        for (const status of change?.value?.statuses ?? []) {
          const wamid: string = status?.id;
          const rawStatus: string = status?.status;

          if (!wamid || !rawStatus) continue;

          const waStatus = rawStatus === "read" ? "read"
            : rawStatus === "delivered" ? "delivered"
            : rawStatus === "failed" ? "wa_failed"
            : null;

          if (!waStatus) continue;

          const { data: msgRow } = await supabaseAdmin
            .from("wa_messages")
            .select("batch_id, cert_id")
            .eq("wamid", wamid)
            .maybeSingle();

          if (!msgRow) continue;

          await supabaseAdmin
            .from("certificates")
            .update({ whatsapp_status: waStatus })
            .eq("id", msgRow.cert_id);

          console.log(`[WhatsApp Webhook] wamid=${wamid} status=${waStatus} cert=${msgRow.cert_id}`);
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing payload:", err);
  }
});

// POST /api/webhooks/cashfree — Cashfree payment status webhook
router.post("/webhooks/cashfree", async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"] as string;
    const timestamp = req.headers["x-webhook-timestamp"] as string;
    const rawBody = (req as any).rawBody as string;

    if (!signature || !timestamp || !rawBody) {
      return res.status(400).json({ error: "Missing webhook headers/body" });
    }

    try {
      (cashfree as any).PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (err: any) {
      console.error("[Cashfree Webhook] Invalid signature:", err.message);
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = req.body;

    if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const { order, payment, customer_details } = payload.data || {};

      if (!order?.order_id || !payment?.payment_status || !customer_details?.customer_id) {
        console.warn("[Cashfree Webhook] Missing fields in payload");
        return res.status(200).send("OK");
      }

      const orderId = order.order_id;
      const amount = payment.payment_amount;
      const customerId = customer_details.customer_id;

      const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("process_payment", {
        p_user_id: customerId,
        p_order_id: orderId,
        p_amount: amount,
        p_payment_id: payment.cf_payment_id || null,
        p_payment_method: payment.payment_group || null,
      });

      if (rpcErr) {
        console.error("[Cashfree Webhook] RPC error:", rpcErr);
        return res.status(500).json({ error: "Failed to process payment" });
      }

      if ((rpcResult as any)?.status === "already_processed") {
        console.log(`[Cashfree Webhook] Order ${orderId} already processed.`);
      } else {
        console.log(`[Cashfree Webhook] Credited ₹${amount} to ${customerId} (Order: ${orderId})`);
      }
    }

    return res.status(200).send("OK");
  } catch (err: any) {
    console.error("[Cashfree Webhook] Error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
