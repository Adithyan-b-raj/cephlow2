import { Router, type IRouter } from "express";
import { supabaseAdmin } from "@workspace/supabase";
import { sendEmail } from "../lib/gmail.js";
import { hasGoogleToken } from "../lib/googleAuth.js";

const router: IRouter = Router();

/**
 * POST /api/internal/report-notify
 *
 * Called by the Cloudflare worker when a student submits an issue report via
 * WhatsApp. Authenticated via a shared secret (WORKER_TO_API_TOKEN) — NOT the
 * normal user auth — because the worker has no user context.
 *
 * Looks up the batch owner for the reported certificate and emails them.
 */
router.post("/internal/report-notify", async (req, res): Promise<void> => {
  const expected = process.env.WORKER_TO_API_TOKEN;
  const provided = req.headers["x-worker-token"];
  if (!expected || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { cert_key, message, phone } = req.body ?? {};
  if (!cert_key || !message) {
    res.status(400).json({ error: "Missing cert_key or message" });
    return;
  }

  // Respond immediately — do the heavy lifting in the background so the worker
  // isn't blocked waiting on Gmail.
  res.status(202).json({ accepted: true });

  void (async () => {
    try {
      // Locate the certificate whose R2 URL ends with this cert_key.
      // cert_key looks like "<phone>/<filename>.pdf"; r2_pdf_url is the full
      // public URL, so a suffix match (ilike "%cert_key") is accurate enough.
      const likePattern = `%${cert_key}`;
      const { data: cert, error: certErr } = await supabaseAdmin
        .from("certificates")
        .select("id, batch_id, recipient_name, recipient_email, r2_pdf_url")
        .ilike("r2_pdf_url", likePattern)
        .maybeSingle();

      if (certErr) {
        console.error("[report-notify] cert lookup failed:", certErr);
        return;
      }
      if (!cert) {
        console.warn("[report-notify] no cert found for cert_key:", cert_key);
        return;
      }

      const { data: batch, error: batchErr } = await supabaseAdmin
        .from("batches")
        .select("id, name, user_id")
        .eq("id", cert.batch_id)
        .single();

      if (batchErr || !batch) {
        console.error("[report-notify] batch lookup failed:", batchErr);
        return;
      }

      const ownerUid = batch.user_id as string;

      // Get the owner's email from Supabase auth
      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(ownerUid);
      if (userErr || !userData?.user?.email) {
        console.error("[report-notify] owner email lookup failed:", userErr);
        return;
      }
      const ownerEmail = userData.user.email;

      // Need a Google token to send via Gmail — if missing, skip silently.
      if (!(await hasGoogleToken(ownerUid))) {
        console.warn(`[report-notify] owner ${ownerUid} has no Google token; skipping email`);
        return;
      }

      const filename = cert_key.split("/").pop() || cert_key;
      const maskedPhone = phone && phone.length >= 4 ? `****${String(phone).slice(-4)}` : "unknown";
      const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
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

      await sendEmail(ownerUid, {
        to: ownerEmail,
        subject,
        body: bodyLines.filter(Boolean).join("\n"),
      });

      console.log(`[report-notify] emailed owner ${ownerEmail} about report on ${filename}`);
    } catch (err) {
      console.error("[report-notify] background error:", err);
    }
  })();
});

export default router;
