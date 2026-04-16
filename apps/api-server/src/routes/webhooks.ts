import { Router } from "express";
import { db, certificatesCollection } from "@workspace/firebase";

const router = Router();

import { Cashfree, CFEnvironment } from "cashfree-pg";

(Cashfree as any).XClientId = process.env.CASHFREE_APP_ID || "";
(Cashfree as any).XClientSecret = process.env.CASHFREE_SECRET_KEY || "";
(Cashfree as any).XEnvironment = CFEnvironment.SANDBOX;

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
  // Always respond 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body?.object !== "whatsapp_business_account") return;

    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== "messages") continue;

        for (const status of change?.value?.statuses ?? []) {
          const wamid: string = status?.id;
          const rawStatus: string = status?.status; // sent | delivered | read | failed

          if (!wamid || !rawStatus) continue;

          // Map Meta status to our status value
          const waStatus = rawStatus === "read"
            ? "read"
            : rawStatus === "delivered"
            ? "delivered"
            : rawStatus === "failed"
            ? "wa_failed"
            : null;

          if (!waStatus) continue;

          // Look up the cert via the waMessages index
          const msgDoc = await db.collection("waMessages").doc(wamid).get();
          if (!msgDoc.exists) continue;

          const { batchId, certId } = msgDoc.data() as { batchId: string; certId: string };

          await certificatesCollection(batchId).doc(certId).update({
            whatsappStatus: waStatus,
          });

          console.log(`[WhatsApp Webhook] wamid=${wamid} status=${waStatus} cert=${certId}`);
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing payload:", err);
  }
});

export default router;

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
      (Cashfree as any).PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (err: any) {
      console.error("[Cashfree Webhook] Invalid signature:", err.message);
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = req.body;
    
    // Process PAYMENT_SUCCESS_WEBHOOK
    if (payload.type === "PAYMENT_SUCCESS_WEBHOOK") {
      const order = payload.data?.order;
      const payment = payload.data?.payment;
      const customer = payload.data?.customer_details;

      if (!order?.order_id || !payment?.payment_amount || !customer?.customer_id) {
         console.warn("[Cashfree Webhook] Missing order details in payload", payload);
         return res.status(200).send("OK");
      }

      const customerId = customer.customer_id;
      const amount = payment.payment_amount;
      const orderId = order.order_id;
      
      const ledgerRef = db.collection("userProfiles").doc(customerId).collection("ledgers").doc(orderId);
      const profileRef = db.collection("userProfiles").doc(customerId);

      await db.runTransaction(async (t) => {
        const ledgerSnap = await t.get(ledgerRef);
        if (ledgerSnap.exists) {
           console.log(`[Cashfree Webhook] Order ${orderId} already processed.`);
           return;
        }

        const profileSnap = await t.get(profileRef);
        let currentBalance = 0;
        if (profileSnap.exists) {
           const profileData = profileSnap.data();
           currentBalance = typeof profileData?.currentBalance === 'number' ? profileData.currentBalance : 0;
        }

        const newBalance = currentBalance + amount;

        t.set(profileRef, { 
           currentBalance: newBalance 
        }, { merge: true });

        t.set(ledgerRef, {
           id: orderId,
           type: "topup",
           amount: amount,
           balanceAfter: newBalance,
           description: `Wallet top-up (Order: ${orderId})`,
           metadata: {
             payment_id: payment.cf_payment_id || null,
             payment_method: payment.payment_group || null
           },
           createdAt: new Date().toISOString()
        });
      });

      console.log(`[Cashfree Webhook] Successfully credited ₹${amount} to ${customerId} (Order: ${orderId})`);
    }

    res.status(200).send("OK");
  } catch (err: any) {
    console.error("[Cashfree Webhook] Error processing:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
