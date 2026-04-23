import { type Job } from "bullmq";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import type { SendEmailJobData } from "../queue/types.js";
import { exportSlidesToPdf } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";

export async function processSendEmail(job: Job<SendEmailJobData>) {
  const { batchId, userId, subject, body } = job.data;

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
  const toSend = allCerts.filter((c: Certificate) => c.status === "generated" && c.recipientEmail);

  let sent = 0;
  let failed = 0;

  const CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || "4", 10);
  for (let i = 0; i < toSend.length; i += CONCURRENCY) {
    const chunk = toSend.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (cert) => {
      try {
        let pdfBuffer: Buffer | undefined;
        if (cert.slideFileId) {
          pdfBuffer = await exportSlidesToPdf(userId, cert.slideFileId);
        }
        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        const rowData = (cert.rowData as Record<string, string>) || {};
        let personalizedSubject = subject;
        let personalizedBody = body;
        for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
          const value = rowData[String(column)] || "";
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
        }
        for (const [col, value] of Object.entries(rowData)) {
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${col}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${col}>>`, "gi"), value);
        }
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

  const alreadySent = allCerts.filter((c) => c.status === "sent").length;
  const totalSent = sent + alreadySent;
  const newStatus = failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
  await supabaseAdmin.from("batches").update({ status: newStatus, sent_count: totalSent }).eq("id", batchId);

  return { sent, failed };
}
