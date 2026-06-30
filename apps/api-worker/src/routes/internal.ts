import { Hono } from "hono";
import { sendEmail } from "../lib/email.js";
import { hasGoogleToken } from "../lib/google-auth.js";

const router = new Hono<ContextEnv>();

router.post("/internal/report-notify", async (c) => {
  const expected = c.env.WORKER_TO_API_TOKEN;
  const provided = c.req.header("x-worker-token");
  
  if (!expected || provided !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { cert_key, message, phone } = await c.req.json().catch(() => ({}));
    if (!cert_key || !message) {
      return c.json({ error: "Missing cert_key or message" }, 400);
    }

    // Do lookup in background so caller is not blocked
    c.executionCtx.waitUntil((async () => {
      try {
        // Suffix match for R2 URL
        const cert = await c.env.DB.prepare(`
          SELECT id, batch_id, recipient_name, recipient_email, r2_pdf_url
          FROM certificates
          WHERE r2_pdf_url LIKE ?
        `).bind(`%${cert_key}`).first<any>();

        if (!cert) {
          console.warn("[report-notify] no cert found for cert_key:", cert_key);
          return;
        }

        const batch = await c.env.DB.prepare(`
          SELECT id, name, user_id FROM batches WHERE id = ?
        `).bind(cert.batch_id).first<any>();

        if (!batch) {
          console.error("[report-notify] batch lookup failed:", cert.batch_id);
          return;
        }

        const ownerUid = batch.user_id;

        // Retrieve user email from user_profiles
        const profile = await c.env.DB.prepare(`
          SELECT email FROM user_profiles WHERE id = ?
        `).bind(ownerUid).first<{ email: string }>();

        if (!profile?.email) {
          console.error("[report-notify] owner email not found for uid:", ownerUid);
          return;
        }

        const ownerEmail = profile.email;

        // Validate google oauth token status
        const hasToken = await hasGoogleToken(c.env.DB, ownerUid);
        if (!hasToken) {
          console.warn(`[report-notify] owner ${ownerUid} has no Google token; skipping email`);
          return;
        }

        const filename = cert_key.split("/").pop() || cert_key;
        const maskedPhone = phone && phone.length >= 4 ? `****${String(phone).slice(-4)}` : "unknown";
        const baseUrl = (c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");
        const batchLink = baseUrl ? `${baseUrl}/batches/${batch.id}` : "";

        const subject = `New issue reported: ${cert.recipient_name || filename}`;
        const bodyLines = [
          `A recipient reported an issue with a certificate via WhatsApp.`,
          ``,
          `Batch:      ${batch.name}`,
          `Certificate: ${filename}`,
          `Recipient:  ${cert.recipient_name || "(unknown)"}${cert.recipient_email ? ` <${cert.recipient_email}>` : ""}`,
          `Reporter:   ${maskedPhone}`,
          ``,
          `Message:`,
          `"${message}"`,
          ``,
          batchLink ? `Open the batch: ${batchLink}` : ``,
          ``,
          `— Cephlow`,
        ];

        await sendEmail(c.env, {
          to: ownerEmail,
          subject,
          body: bodyLines.filter(Boolean).join("\n"),
        });

        console.log(`[report-notify] emailed owner ${ownerEmail} about report on ${filename}`);
      } catch (err: any) {
        console.error("[report-notify] background handler error:", err.message);
      }
    })());

    return c.json({ accepted: true }, 202);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
