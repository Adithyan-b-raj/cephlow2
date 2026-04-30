import { type Job } from "bullmq";
import { supabaseAdmin } from "@workspace/supabase";
import type { R2UploadJobData } from "../queue/types.js";
import {
  uploadPdfToR2,
  getR2PublicUrl,
  deleteR2Object,
} from "../lib/cloudflareR2.js";
import { extractPhoneNumber, upsertStudentProfile } from "../lib/certUtils.js";

export async function processR2Upload(job: Job<R2UploadJobData>) {
  const {
    certId,
    batchId,
    recipientName,
    recipientEmail,
    batchName,
    pdfBase64,
    rowData,
    drivePdfFileId,
    drivePdfUrl,
    driveSlideFileId,
    driveSlideUrl,
  } = job.data;

  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const pdfName = `${(recipientName || "cert").replace(/[^a-zA-Z0-9]/g, "_")}_${(batchName || "batch").replace(/[^a-zA-Z0-9]/g, "_")}`;
  const phoneNumber = extractPhoneNumber(rowData || {});
  const r2Folder = phoneNumber || (recipientName || "unknown").replace(/[^a-zA-Z0-9]/g, "_");

  // Clean up old R2 object if regenerating
  const { data: existingCert } = await supabaseAdmin
    .from("certificates")
    .select("r2_pdf_url")
    .eq("id", certId)
    .single();

  if (existingCert?.r2_pdf_url) {
    const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (r2PublicBase && existingCert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
      await deleteR2Object(existingCert.r2_pdf_url.slice(r2PublicBase.length + 1)).catch(
        (e: any) => console.error("[R2-UPLOAD] Cleanup error:", e.message)
      );
    }
  }

  // Upload to R2
  const r2Key = await uploadPdfToR2(r2Folder, pdfName, pdfBuffer);
  const r2PdfUrl = getR2PublicUrl(r2Key);

  // Update certificate with R2 URL + any Drive file info
  const updateData: Record<string, any> = { r2_pdf_url: r2PdfUrl };
  if (drivePdfFileId) updateData.pdf_file_id = drivePdfFileId;
  if (drivePdfUrl) updateData.pdf_url = drivePdfUrl;
  if (driveSlideFileId) updateData.slide_file_id = driveSlideFileId;
  if (driveSlideUrl) updateData.slide_url = driveSlideUrl;

  await supabaseAdmin.from("certificates").update(updateData).eq("id", certId);

  // Upsert student profile
  if (recipientEmail) {
    await upsertStudentProfile({
      email: recipientEmail,
      name: recipientName || "Unknown",
      certId,
      batchId,
      batchName: batchName || "",
      r2PdfUrl,
      pdfUrl: drivePdfUrl || null,
      slideUrl: driveSlideUrl || null,
      status: "generated",
    }).catch((e: any) =>
      console.error("[R2-UPLOAD] Profile upsert failed:", recipientEmail, e.message)
    );
  }

  return { certId, r2PdfUrl };
}
