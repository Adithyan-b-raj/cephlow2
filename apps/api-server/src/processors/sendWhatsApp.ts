import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import type { SendWhatsAppJobData } from "../types.js";
import { sendWhatsAppDocument } from "../lib/whatsapp.js";
import { extractPhoneNumber, emailToSlug } from "../lib/certUtils.js";
import { deductDeliveryCredits } from "../lib/creditsService.js";

export async function processSendWhatsApp(payload: SendWhatsAppJobData) {
  const { batchId, userId, var1Template, var2Template, var3Template } = payload;

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
  const toSend = allCerts.filter(
    (c: Certificate) => (c.status === "generated" || c.status === "failed") && (c as any).r2PdfUrl
  );

  let sent = 0;
  let failed = 0;

  const CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || "4", 10);
  for (let i = 0; i < toSend.length; i += CONCURRENCY) {
    const chunk = toSend.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (cert) => {
      try {
        const rowData = (cert.rowData as Record<string, string>) || {};
        const phone = extractPhoneNumber(rowData);
        if (!phone) {
          await supabaseAdmin.from("certificates").update({
            status: "failed", error_message: "No phone number found in row data",
          }).eq("id", cert.id);
          failed++;
          return;
        }

        let var1 = var1Template || cert.recipientName;
        let var2 = var2Template || batch.name;
        const emailPrefix = emailToSlug(cert.recipientEmail || cert.recipientName);
        let var3 = var3Template || emailPrefix;
        for (const [col, value] of Object.entries(rowData)) {
          var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
          var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
          var3 = var3.replace(new RegExp(`<<${col}>>`, "gi"), value);
        }
        var3 = var3.replace(/<<EmailPrefix>>/gi, emailPrefix);

        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

        // Extract the R2 object key from the stored public URL so the worker
        // can embed it in the quick-reply button payload.
        const r2Base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
        const r2PdfUrl: string = (cert as any).r2PdfUrl ?? "";
        const certKey = r2Base && r2PdfUrl.startsWith(r2Base)
          ? decodeURIComponent(r2PdfUrl.slice(r2Base.length + 1))
          : undefined;

        console.log(`[WhatsApp] certKey="${certKey}" r2Base="${r2Base}" r2PdfUrl="${r2PdfUrl}"`);
 
        // Deduct delivery credits
        const deducted = await deductDeliveryCredits(
          batch.workspaceId,
          userId,
          "whatsapp",
          `WhatsApp delivery: ${phone} (${cert.recipientName})`,
          { certId: cert.id, batchId }
        );
        if (!deducted) {
          throw new Error("Insufficient credits for WhatsApp delivery");
        }

        const wamid = await sendWhatsAppDocument(phone, r2PdfUrl, pdfFilename, var1, var2, var3, certKey);

        await supabaseAdmin.from("certificates").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
          whatsapp_message_id: wamid || null,
          whatsapp_status: "sent",
        }).eq("id", cert.id);

        if (wamid) {
          await supabaseAdmin.from("wa_messages").insert({ wamid, batch_id: batchId, cert_id: cert.id });
        }
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
  await supabaseAdmin.from("batches").update({
    status: newStatus,
    sent_count: totalSent,
    whatsapp_sent_count: (batch.whatsappSentCount || 0) + sent,
  }).eq("id", batchId);

  return { sent, failed };
}
