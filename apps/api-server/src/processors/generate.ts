import { type Job } from "bullmq";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import type { GenerateJobData } from "../queue/types.js";
import {
  generateCertificate,
  generateCertificateBatch,
  exportSlidesToPdf,
  uploadPdf,
  deleteFile,
  type BatchCertInput,
} from "../lib/googleDrive.js";
import {
  uploadPdfToR2,
  isR2Configured,
  getR2PublicUrl,
  deleteR2Object,
} from "../lib/cloudflareR2.js";
import { extractPhoneNumber, upsertStudentProfile } from "../lib/certUtils.js";

const MAX_BATCH_SIZE = parseInt(process.env.BATCH_SLIDE_LIMIT || "50", 10);

// Resolve which templateId and slideIndex each cert uses
function resolveCertTemplate(cert: Certificate, batch: any): { templateId: string; slideIndex: number | null } {
  const rowData = (cert.rowData as Record<string, string>) || {};
  let templateId = batch.templateId;
  let slideIndex: number | null = null;

  if (batch.categoryColumn && batch.categorySlideMap) {
    const val = rowData[batch.categoryColumn] || "";
    if (val && val in batch.categorySlideMap) slideIndex = batch.categorySlideMap[val];
    else if ("_default" in batch.categorySlideMap) slideIndex = batch.categorySlideMap["_default"];
    else slideIndex = 0;
  } else if (batch.categoryColumn && batch.categoryTemplateMap) {
    const val = rowData[batch.categoryColumn];
    if (val && batch.categoryTemplateMap[val]) templateId = batch.categoryTemplateMap[val].templateId;
  }

  return { templateId, slideIndex };
}

export async function processGenerate(job: Job<GenerateJobData>) {
  const { batchId, userId, certIds, baseUrl } = job.data;

  const { data: batchRow, error: batchErr } = await supabaseAdmin
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .single();
  if (batchErr || !batchRow) throw new Error("Batch not found");
  const batch = toCamel(batchRow) as any;

  const { data: certsData } = await supabaseAdmin
    .from("certificates")
    .select("*")
    .in("id", certIds);
  const targetCerts = (certsData || []).map(toCamel) as Certificate[];

  let generated = 0;
  let failed = 0;
  const now = () => new Date().toISOString();

  // Separate certs that need a new visual render from metadata-only updates
  const toGenerate: Certificate[] = [];
  const metadataOnly: Certificate[] = [];

  for (const cert of targetCerts) {
    const needsRender = (cert as any).requiresVisualRegen !== false || !cert.slideFileId;
    if (needsRender) toGenerate.push(cert);
    else metadataOnly.push(cert);
  }

  // ── Handle metadata-only certs: no re-render needed ─────────────────────
  await Promise.all(metadataOnly.map(async (cert) => {
    try {
      await supabaseAdmin.from("certificates").update({
        status: "generated",
        error_message: null,
        updated_at: now(),
        requires_visual_regen: false,
      }).eq("id", cert.id);

      if (cert.status !== "generated" && cert.status !== "sent") {
        await supabaseAdmin.rpc("increment_batch_column", {
          p_batch_id: batchId, p_column: "generated_count", p_amount: 1,
        });
      }
      generated++;
    } catch (err: any) {
      await supabaseAdmin.from("certificates").update({
        status: "failed", error_message: err.message,
      }).eq("id", cert.id);
      await supabaseAdmin.rpc("increment_batch_column", {
        p_batch_id: batchId, p_column: "failed_count", p_amount: 1,
      });
      failed++;
    }
  }));

  // ── Group visual-regen certs by (templateId, slideIndex) ─────────────────
  const groups = new Map<string, { templateId: string; slideIndex: number | null; certs: Certificate[] }>();

  for (const cert of toGenerate) {
    const { templateId, slideIndex } = resolveCertTemplate(cert, batch);
    const key = `${templateId}__${slideIndex ?? "null"}`;
    if (!groups.has(key)) groups.set(key, { templateId, slideIndex, certs: [] });
    groups.get(key)!.certs.push(cert);
  }

  // Mark all visual-regen certs as "generating" in one bulk update
  if (toGenerate.length > 0) {
    await supabaseAdmin.from("certificates")
      .update({ status: "generating", updated_at: now() })
      .in("id", toGenerate.map(c => c.id));
  }

  // ── Process each group in sub-batches of MAX_BATCH_SIZE ──────────────────
  for (const { templateId, slideIndex, certs: groupCerts } of groups.values()) {
    for (let offset = 0; offset < groupCerts.length; offset += MAX_BATCH_SIZE) {
      const chunk = groupCerts.slice(offset, offset + MAX_BATCH_SIZE);

      // Build inputs for batch generator
      const batchInputs: BatchCertInput[] = chunk.map((cert) => {
        const rowData = (cert.rowData as Record<string, string>) || {};
        const replacements: Record<string, string> = {};
        for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
          replacements[placeholder] = rowData[String(column)] || "";
        }
        return {
          certId: cert.id,
          recipientName: cert.recipientName,
          replacements,
          qrCodeUrl: `${baseUrl}/verify/${batchId}/${cert.id}`,
        };
      });

      let batchResults: Awaited<ReturnType<typeof generateCertificateBatch>>;
      // Keep per-cert editable slide info when only 1 cert is generated
      const singleSlideInfoByCertId = new Map<string, { slideFileId: string; slideUrl: string }>();
      try {
        if (chunk.length === 1) {
          // Single-cert path: keep the Google Slides file for editing
          const single = batchInputs[0];
          const cert = chunk[0];
          const slideRes = await generateCertificate(
            userId,
            templateId,
            single.recipientName,
            single.replacements,
            batch.driveFolderId ?? null,
            single.qrCodeUrl,
            slideIndex,
          );
          singleSlideInfoByCertId.set(cert.id, { slideFileId: slideRes.fileId, slideUrl: slideRes.url });
          const pdfBuffer = await exportSlidesToPdf(userId, slideRes.fileId);
          batchResults = [{ certId: cert.id, pdfBuffer }];
        } else {
          batchResults = await generateCertificateBatch(
            userId, templateId, batchInputs, slideIndex, batch.driveFolderId ?? null, baseUrl
          );
        }
      } catch (batchErr: any) {
        // If the whole batch call fails, mark all certs in chunk as failed
        console.error("[BATCH] generateCertificateBatch failed:", batchErr.message);
        await Promise.all(chunk.map(async (cert) => {
          await supabaseAdmin.from("certificates").update({
            status: "failed", error_message: batchErr.message,
          }).eq("id", cert.id);
          await supabaseAdmin.rpc("increment_batch_column", {
            p_batch_id: batchId, p_column: "failed_count", p_amount: 1,
          });
          failed++;
        }));
        continue;
      }

      // Build a map for quick lookup: certId → pdfBuffer
      const resultMap = new Map(batchResults.map(r => [r.certId, r.pdfBuffer]));

      // Upload PDFs and update DB in parallel across the chunk
      await Promise.all(chunk.map(async (cert) => {
        try {
          const pdfBuffer = resultMap.get(cert.id) ?? null;
          const rowData = (cert.rowData as Record<string, string>) || {};
          const pdfName = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}`;

          // Clean up old R2 object if regenerating
          const oldR2Url = (cert as any).r2PdfUrl;
          if (oldR2Url) {
            const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
            if (r2PublicBase && oldR2Url.startsWith(r2PublicBase + "/")) {
              deleteR2Object(oldR2Url.slice(r2PublicBase.length + 1))
                .catch((e: any) => console.error("Cleanup error (R2):", e));
            }
          }

          let pdfFileId: string | null = null;
          let pdfUrl: string | null = null;
          let r2PdfUrl: string | null = null;

          if (pdfBuffer && batch.pdfFolderId) {
            try {
              const pdfRes = await uploadPdf(userId, pdfName, pdfBuffer, batch.pdfFolderId);
              pdfFileId = pdfRes.fileId;
              pdfUrl = pdfRes.url;
              if ((cert as any).pdfFileId) {
                deleteFile(userId, (cert as any).pdfFileId)
                  .catch((e: any) => console.error("Cleanup error (PDF):", e));
              }
            } catch (e: any) {
              console.error("[BATCH] Drive PDF upload failed:", cert.id, e.message);
            }
          }

          if (pdfBuffer && isR2Configured()) {
            try {
              const phoneNumber = extractPhoneNumber(rowData);
              const r2Folder = phoneNumber || cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_");
              const r2Key = await uploadPdfToR2(r2Folder, pdfName, pdfBuffer);
              r2PdfUrl = getR2PublicUrl(r2Key);
            } catch (e: any) {
              console.error("[BATCH] R2 upload failed:", cert.id, e.message);
            }
          }

          const slideInfo = singleSlideInfoByCertId.get(cert.id);
          // Clean up old slide file if regenerating and we're about to replace it
          if (slideInfo && (cert as any).slideFileId && (cert as any).slideFileId !== slideInfo.slideFileId) {
            deleteFile(userId, (cert as any).slideFileId)
              .catch((e: any) => console.error("Cleanup error (Slide):", e));
          }

          await supabaseAdmin.from("certificates").update({
            status: "generated",
            // Single-cert path keeps the editable slide file; batch path deletes it
            slide_file_id: slideInfo?.slideFileId ?? null,
            slide_url: slideInfo?.slideUrl ?? null,
            pdf_file_id: pdfFileId,
            pdf_url: pdfUrl,
            r2_pdf_url: r2PdfUrl,
            error_message: null,
            updated_at: now(),
            requires_visual_regen: false,
          }).eq("id", cert.id);

          if (cert.recipientEmail) {
            upsertStudentProfile({
              email: cert.recipientEmail,
              name: cert.recipientName,
              certId: cert.id,
              batchId,
              batchName: batch.name,
              r2PdfUrl,
              pdfUrl,
              slideUrl: slideInfo?.slideUrl ?? null,
              status: "generated",
            }).catch((e: any) => console.error("[PROFILE] upsert failed:", cert.recipientEmail, e));
          }

          if (cert.status !== "generated" && cert.status !== "sent") {
            await supabaseAdmin.rpc("increment_batch_column", {
              p_batch_id: batchId, p_column: "generated_count", p_amount: 1,
            });
          }
          generated++;
        } catch (err: any) {
          await supabaseAdmin.from("certificates").update({
            status: "failed", error_message: err.message,
          }).eq("id", cert.id);
          await supabaseAdmin.rpc("increment_batch_column", {
            p_batch_id: batchId, p_column: "failed_count", p_amount: 1,
          });
          failed++;
        }
      }));
    }
  }

  const newStatus = failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
  await supabaseAdmin.from("batches").update({ status: newStatus }).eq("id", batchId);

  return { generated, failed };
}
