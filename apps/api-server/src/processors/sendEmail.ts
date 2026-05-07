import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import type { SendEmailJobData } from "../types.js";
import { downloadDriveFile, exportSlidesToPdf } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";
import { bulkUpsertStudentProfiles } from "../lib/certUtils.js";
import { isUserApproved } from "../lib/approval.js";

/**
 * Downloads a PDF for sending. Resolution order:
 *   1. R2 public URL (approved tier)
 *   2. Drive file ID  (free tier — PDF was uploaded straight to Drive)
 *   3. Slides export  (legacy slides flow)
 */
async function getPdfBuffer(
  userId: string,
  cert: Certificate & { r2PdfUrl?: string; pdfFileId?: string; slideFileId?: string }
): Promise<Buffer | undefined> {
  if ((cert as any).r2PdfUrl) {
    try {
      const res = await fetch((cert as any).r2PdfUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (e: any) {
      console.error("[SEND-EMAIL] R2 fetch failed, trying Drive:", e.message);
    }
  }

  // Free-tier path: PDF is in the user's Google Drive
  if ((cert as any).pdfFileId) {
    try {
      return await downloadDriveFile(userId, (cert as any).pdfFileId);
    } catch (e: any) {
      console.error("[SEND-EMAIL] Drive download failed, trying Slides:", e.message);
    }
  }

  // Fallback to Slides export
  if (cert.slideFileId) {
    try {
      return await exportSlidesToPdf(userId, cert.slideFileId);
    } catch (e: any) {
      console.error("[SEND-EMAIL] Slides export failed:", e.message);
    }
  }
  return undefined;
}

function applyPersonalization(
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

export async function processSendEmail(payload: SendEmailJobData) {
  const { batchId, userId, subject, body, certId } = payload;

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
  const sentProfiles: Array<{ email: string; name: string; certId: string; batchName: string; r2PdfUrl: string | null; pdfUrl: string | null; slideUrl: string | null }> = [];

  const CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || "4", 10);
  for (let i = 0; i < toSend.length; i += CONCURRENCY) {
    const chunk = toSend.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (cert) => {
      try {
        const pdfBuffer = await getPdfBuffer(userId, cert as any);
        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        const rowData = (cert.rowData as Record<string, string>) || {};
        const personalizedSubject = applyPersonalization(subject, batch, rowData);
        const personalizedBody = applyPersonalization(body, batch, rowData);

        await sendEmail(userId, { to: cert.recipientEmail, subject: personalizedSubject, body: personalizedBody, pdfBuffer, pdfFilename });
        await supabaseAdmin.from("certificates").update({
          status: "sent", sent_at: new Date().toISOString(), error_message: null,
        }).eq("id", cert.id);
        sentProfiles.push({
          email: cert.recipientEmail!,
          name: cert.recipientName,
          certId: cert.id,
          batchName: batch.name,
          r2PdfUrl: (cert as any).r2PdfUrl ?? null,
          pdfUrl: (cert as any).pdfUrl ?? null,
          slideUrl: cert.slideFileId ? null : null,
        });
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

  // Upsert student profiles for approved orgs after successful sends
  if (sentProfiles.length > 0 && await isUserApproved(userId)) {
    bulkUpsertStudentProfiles(batchId, sentProfiles).catch((e: any) =>
      console.error("[SEND-EMAIL] Bulk profile upsert failed:", e.message)
    );
  }

  return { sent, failed };
}
