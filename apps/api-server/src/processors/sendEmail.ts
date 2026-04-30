import { type Job } from "bullmq";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import type { SendEmailJobData } from "../queue/types.js";
import { exportSlidesToPdf } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";

/**
 * Downloads a PDF from an R2 public URL and returns it as a Buffer.
 * Falls back to exporting from Google Slides if R2 URL is not available.
 */
async function getPdfBuffer(
  userId: string,
  cert: Certificate & { r2PdfUrl?: string; slideFileId?: string }
): Promise<Buffer | undefined> {
  // Prefer R2 (no Google API call needed)
  if ((cert as any).r2PdfUrl) {
    try {
      const res = await fetch((cert as any).r2PdfUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (e: any) {
      console.error("[SEND-EMAIL] R2 fetch failed, falling back to Slides:", e.message);
    }
  }
  // Fallback: export from Google Slides (for legacy certs with slideFileId)
  if (cert.slideFileId) {
    return exportSlidesToPdf(userId, cert.slideFileId);
  }
  return undefined;
}

function personalizeTemplate(
  template: string,
  batch: any,
  rowData: Record<string, string>
): string {
  let result = template;
  for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
    const value = rowData[String(column)] || "";
    result = result.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
  }
  for (const [col, value] of Object.entries(rowData)) {
    result = result.replace(new RegExp(`<<${col}>>`, "gi"), value);
  }
  return result;
}

export async function processSendEmail(job: Job<SendEmailJobData>) {
  const { batchId, userId, subject, body, certId } = job.data;

  const { data: batchRow, error } = await supabaseAdmin
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();
  if (error || !batchRow) throw new Error("Batch not found");
  const batch = toCamel(batchRow) as any;

  const { data: certsData } = await supabaseAdmin
    .from("certificates")
    .select("*")
    .eq("batch_id", batchId);
  const allCerts = ((certsData || []).map(toCamel) as Certificate[]);

  // Single-cert mode: send only the specified cert
  // Batch mode: send all generated certs with an email address
  const toSend = certId
    ? allCerts.filter((c) => c.id === certId && c.recipientEmail)
    : allCerts.filter((c: Certificate) => c.status === "generated" && c.recipientEmail);

  let sent = 0;
  let failed = 0;

  const CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || "4", 10);
  for (let i = 0; i < toSend.length; i += CONCURRENCY) {
    const chunk = toSend.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (cert) => {
      try {
        const pdfBuffer = await getPdfBuffer(userId, cert as any);
        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        const rowData = (cert.rowData as Record<string, string>) || {};
        const personalizedSubject = personalizeTemplate(subject, batch, rowData);
        const personalizedBody = personalizeTemplate(body, batch, rowData);

        await sendEmail(userId, { to: cert.recipientEmail, subject: personalizedSubject, body: personalizedBody, pdfBuffer, pdfFilename });
        await supabaseAdmin.from("certificates").update({
          status: "sent", sent_at: new Date().toISOString(), error_message: null,
        }).eq("id", cert.id);
        sent++;
      } catch (err: any) {
        await supabaseAdmin.from("certificates").update({
          status: "failed", error_message: err.message,
        }).eq("id", cert.id);
        failed++;
      }
    }));
  }

  // Update batch sent_count
  const alreadySent = allCerts.filter((c) => c.status === "sent").length;
  const totalSent = sent + alreadySent;

  if (certId) {
    // Single-cert mode: just update sent_count, don't change batch status
    await supabaseAdmin.from("batches").update({ sent_count: totalSent }).eq("id", batchId);
  } else {
    // Batch mode: update status too
    const newStatus = failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
    await supabaseAdmin.from("batches").update({ status: newStatus, sent_count: totalSent }).eq("id", batchId);
  }

  return { sent, failed };
}
