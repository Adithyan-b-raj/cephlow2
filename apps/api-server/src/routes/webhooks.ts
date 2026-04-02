import { Router } from "express";
import { db, certificatesCollection } from "@workspace/firebase";

const router = Router();

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
