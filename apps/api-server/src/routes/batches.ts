import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import { getSheetsClient } from "../lib/googleSheets.js";
import { generateCertificate, exportSlidesToPdf, createFolder, uploadPdf, makeFilePublic, deleteFile } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";
import { uploadPdfToR2, isR2Configured, getR2PublicUrl, deleteR2Objects, deleteR2Object } from "../lib/cloudflareR2.js";
import { isWhatsAppConfigured, sendWhatsAppDocument } from "../lib/whatsapp.js";

const PHONE_COLUMN_NAMES = ["phonenumber", "phone", "mobile", "mobilenumber", "contact", "contactnumber", "contactno", "phoneno"];

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]/g, "");
}

function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

function extractPhoneNumber(rowData: Record<string, string>): string {
  const configuredColumn = process.env.R2_PHONE_COLUMN;
  let raw = "";
  if (configuredColumn && rowData[configuredColumn]) {
    raw = rowData[configuredColumn];
  } else {
    for (const key of Object.keys(rowData)) {
      if (PHONE_COLUMN_NAMES.includes(normalizeColumnName(key))) {
        raw = rowData[key];
        break;
      }
    }
  }
  return normalizePhoneNumber(raw);
}

const router: IRouter = Router();

function emailToSlug(email: string): string {
  const prefix = email.split("@")[0] ?? "user";
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
}

async function upsertStudentProfile(params: {
  email: string;
  name: string;
  certId: string;
  batchId: string;
  batchName: string;
  r2PdfUrl: string | null;
  pdfUrl: string | null;
  slideUrl: string | null;
  status: string;
}) {
  const { email, name, certId, batchId, batchName, r2PdfUrl, pdfUrl, slideUrl, status } = params;
  const emailKey = email.toLowerCase().replace(/[^a-z0-9]/g, "_");

  const { data: indexRow } = await supabaseAdmin
    .from("student_profile_index")
    .select("slug")
    .eq("email_key", emailKey)
    .maybeSingle();

  let slug: string;

  if (indexRow) {
    slug = indexRow.slug;
  } else {
    const baseSlug = emailToSlug(email);
    slug = baseSlug;
    let attempt = 2;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("student_profiles")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${attempt}`;
      attempt++;
    }
    await supabaseAdmin
      .from("student_profiles")
      .upsert({ slug, name, email, updated_at: new Date().toISOString() });
    await supabaseAdmin
      .from("student_profile_index")
      .upsert({ email_key: emailKey, slug });
  }

  await supabaseAdmin.from("student_profile_certs").upsert(
    {
      profile_slug: slug,
      cert_id: certId,
      batch_id: batchId,
      batch_name: batchName,
      recipient_name: name,
      r2_pdf_url: r2PdfUrl ?? null,
      pdf_url: pdfUrl ?? null,
      slide_url: slideUrl ?? null,
      issued_at: new Date().toISOString(),
      status,
    },
    { onConflict: "profile_slug,cert_id" }
  );
}

// List all batches
router.get("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { data, error } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    const batches = (data || []).map(toCamel);
    return res.json({ batches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Create a new batch
router.post("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      name, sheetId, sheetName, tabName, templateId, templateName,
      columnMap, emailColumn, nameColumn, emailSubject, emailBody,
      categoryColumn, categoryTemplateMap, categorySlideMap, categorySlideIndexes,
    } = req.body;

    const sheets = await getSheetsClient(userId);
    const range = tabName ? tabName : "A:ZZ";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });

    const rows = response.data.values || [];
    const headers = rows[0] as string[];
    const dataRows = rows.slice(1).filter((r) => r.length > 0);

    let driveFolderId = null;
    let pdfFolderId = null;
    try {
      driveFolderId = await createFolder(userId, name);
      if (driveFolderId) {
        pdfFolderId = await createFolder(userId, "pdf", driveFolderId);
      }
    } catch (err) {
      console.error("Failed to create Google Drive folders:", err);
    }

    const { data: batchRow, error: batchErr } = await supabaseAdmin
      .from("batches")
      .insert({
        user_id: userId,
        name,
        sheet_id: sheetId,
        sheet_name: sheetName,
        tab_name: tabName || null,
        template_id: templateId,
        template_name: templateName,
        column_map: columnMap,
        email_column: emailColumn,
        name_column: nameColumn,
        email_subject: emailSubject || null,
        email_body: emailBody || null,
        category_column: categoryColumn || null,
        category_template_map: categoryTemplateMap || null,
        category_slide_map: categorySlideMap || null,
        category_slide_indexes: categorySlideIndexes || null,
        status: "draft",
        drive_folder_id: driveFolderId,
        pdf_folder_id: pdfFolderId,
        total_count: dataRows.length,
        generated_count: 0,
        sent_count: 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchErr) throw batchErr;
    const batchId = batchRow.id;

    const certRows = dataRows.map((row) => {
      const rowData: Record<string, string> = {};
      headers.forEach((h, i) => { rowData[h] = (row[i] as string) || ""; });
      return {
        batch_id: batchId,
        recipient_name: rowData[nameColumn] || "Unknown",
        recipient_email: rowData[emailColumn] || "",
        status: "pending",
        row_data: rowData,
        slide_file_id: null,
        slide_url: null,
        sent_at: null,
        error_message: null,
        is_paid: false,
        created_at: new Date().toISOString(),
      };
    });

    if (certRows.length > 0) {
      const { error: certErr } = await supabaseAdmin.from("certificates").insert(certRows);
      if (certErr) throw certErr;
    }

    return res.status(201).json(toCamel(batchRow));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get batch detail with certificates
router.get("/batches/:batchId", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { batchId } = req.params;
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("*, certificates(*)")
      .eq("id", batchId)
      .single();

    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

    const result = toCamel(batch);
    result.certificates = (batch.certificates || []).map(toCamel);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Share the PDF folder (make it public)
router.post("/batches/:batchId/share-folder", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  try {
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("user_id, pdf_folder_id")
      .eq("id", batchId)
      .single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });
    if (!batch.pdf_folder_id) return res.status(400).json({ error: "PDF folder does not exist for this batch" });

    await makeFilePublic(userId, batch.pdf_folder_id);
    return res.json({ success: true, shareLink: `https://drive.google.com/drive/folders/${batch.pdf_folder_id}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Sync data from the Google Sheet into the existing batch
router.post("/batches/:batchId/sync", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

    const sheets = await getSheetsClient(userId);
    const range = batch.tab_name ? batch.tab_name : "A:ZZ";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: batch.sheet_id, range });

    const rows = response.data.values || [];
    if (rows.length === 0) return res.status(400).json({ error: "Spreadsheet is empty." });

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1).filter((r) => r.length > 0);
    const { name_column: nameColumn, email_column: emailColumn } = batch;

    const { data: certsData } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("batch_id", batchId);
    const existingCerts = (certsData || []).map(toCamel) as Certificate[];

    let newCount = 0;
    let availableCerts = [...existingCerts];

    for (const row of dataRows) {
      const rowData: Record<string, string> = {};
      headers.forEach((h, i) => { rowData[h] = (row[i] as string) || ""; });

      const email = rowData[emailColumn] || "";
      const name = rowData[nameColumn] || "Unknown";

      let matchIndex = availableCerts.findIndex(
        (c) => c.recipientEmail === email && c.recipientName === name
      );
      if (matchIndex === -1 && email) {
        matchIndex = availableCerts.findIndex((c) => c.recipientEmail === email);
      }
      if (matchIndex === -1 && name && name !== "Unknown") {
        matchIndex = availableCerts.findIndex((c) => c.recipientName === name);
      }

      if (matchIndex > -1) {
        const matchingCert = availableCerts[matchIndex];
        availableCerts.splice(matchIndex, 1);

        const visualFields = Object.values(batch.column_map || {}) as string[];
        const hasVisualChanged = matchingCert.recipientName !== name ||
          visualFields.some(col => matchingCert.rowData?.[col] !== rowData[col]);
        const hasMetadataChanged = !hasVisualChanged && JSON.stringify(matchingCert.rowData) !== JSON.stringify(rowData);

        const updateData: any = {
          recipient_name: name,
          recipient_email: email,
          row_data: rowData,
          updated_at: new Date().toISOString(),
        };

        if (hasVisualChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = true;
        } else if (hasMetadataChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = false;
        }

        await supabaseAdmin.from("certificates").update(updateData).eq("id", matchingCert.id);
      } else {
        await supabaseAdmin.from("certificates").insert({
          batch_id: batchId,
          recipient_name: name,
          recipient_email: email,
          status: "pending",
          row_data: rowData,
          slide_file_id: null,
          slide_url: null,
          sent_at: null,
          error_message: null,
          is_paid: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        newCount++;
      }
    }

    if (newCount > 0) {
      await supabaseAdmin
        .from("batches")
        .update({ total_count: existingCerts.length + newCount })
        .eq("id", batchId);
    }

    return res.json({ success: true, message: `Synced successfully. Added ${newCount} new certificates.`, newCount });
  } catch (err: any) {
    console.error("[SYNC] failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Generate certificates for a batch
router.post("/batches/:batchId/generate", async (req, res) => {
  console.log("[GENERATE] endpoint hit");
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const { selectedCertIds } = req.body || {};

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { data: certsData } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("batch_id", batchId);
    const allCerts = (certsData || []).map(toCamel) as Certificate[];

    const targetCerts = selectedCertIds && Array.isArray(selectedCertIds) && selectedCertIds.length > 0
      ? allCerts.filter(c => selectedCertIds.includes(c.id))
      : allCerts;

    if (targetCerts.length === 0) {
      return res.status(400).json({ error: "No certificates found to generate." });
    }

    const unpaidCerts = targetCerts.filter(c => !c.isPaid);
    const visualRegenCerts = targetCerts.filter(c => c.isPaid && c.status === "outdated" && c.requiresVisualRegen);

    const unpaidCount = unpaidCerts.length;
    const visualRegenCount = visualRegenCerts.length;

    const RATE = Number(process.env.VITE_CERT_GENERATION_RATE || 1);
    const REGEN_RATE = Number(process.env.VITE_CERT_REGENERATION_RATE || 0.2);
    const cost = (unpaidCount * RATE) + (visualRegenCount * REGEN_RATE);

    const ledgerId = `gen_${batchId}_${Date.now()}`;
    const unpaidCertIds = unpaidCerts.map(c => c.id);

    const { error: rpcErr } = await supabaseAdmin.rpc("start_batch_generation", {
      p_user_id: userId,
      p_batch_id: batchId,
      p_cost: cost,
      p_unpaid_cert_ids: unpaidCertIds,
      p_ledger_id: ledgerId,
      p_batch_name: batch.name,
      p_unpaid_count: unpaidCount,
      p_regen_count: visualRegenCount,
      p_rate: RATE,
      p_regen_rate: REGEN_RATE,
    });

    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("already_generating")) return res.status(409).json({ error: "Batch is already generating" });
      if (msg.includes("currently_sending")) return res.status(409).json({ error: "Batch is currently being sent" });
      if (msg.includes("insufficient_funds")) {
        const parts = msg.split(":");
        const detail = parts[1] || msg;
        const err: any = new Error(`Insufficient funds: ${detail}`);
        err.statusCode = 402;
        throw err;
      }
      throw rpcErr;
    }

    res.json({ success: true, message: "Generation started" });

    // Background processing
    (async () => {
      let generated = 0;
      let failed = 0;

      const CONCURRENCY = parseInt(process.env.CONCURRENCY_LIMIT || "4", 10);
      for (let i = 0; i < targetCerts.length; i += CONCURRENCY) {
        const chunk = targetCerts.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (cert) => {
          try {
            await supabaseAdmin.from("certificates").update({ status: "generating" }).eq("id", cert.id);

            const rowData = (cert.rowData as Record<string, string>) || {};
            const replacements: Record<string, string> = {};
            for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
              replacements[placeholder] = rowData[String(column)] || "";
            }

            const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
            const qrCodeUrl = `${baseUrl}/verify/${batchId}/${cert.id}`;

            let certTemplateId = batch.templateId;
            let certSlideIndex: number | null = null;

            if (batch.categoryColumn && batch.categorySlideMap) {
              const categoryValue = rowData[batch.categoryColumn] || "";
              if (categoryValue && categoryValue in batch.categorySlideMap) {
                certSlideIndex = batch.categorySlideMap[categoryValue];
              } else if ("_default" in batch.categorySlideMap) {
                certSlideIndex = batch.categorySlideMap["_default"];
              } else {
                certSlideIndex = 0;
              }
            } else if (batch.categoryColumn && batch.categoryTemplateMap) {
              const categoryValue = rowData[batch.categoryColumn];
              if (categoryValue && batch.categoryTemplateMap[categoryValue]) {
                certTemplateId = batch.categoryTemplateMap[categoryValue].templateId;
              }
            }

            const oldSlideFileId = cert.slideFileId;
            const oldPdfFileId = cert.pdfFileId;
            const oldR2Url = cert.r2PdfUrl;

            let slideFileId = cert.slideFileId;
            let slideUrl = cert.slideUrl;

            if (cert.requiresVisualRegen !== false || !slideFileId) {
              console.log(`[GENERATE] Visual change for ${cert.recipientName}. Generating Slides.`);
              const genResult = await generateCertificate(
                userId, certTemplateId, cert.recipientName, replacements,
                batch.driveFolderId, qrCodeUrl, certSlideIndex
              );
              slideFileId = genResult.fileId;
              slideUrl = genResult.url;
              if (oldSlideFileId && oldSlideFileId !== slideFileId) {
                deleteFile(userId, oldSlideFileId).catch(e => console.error("Cleanup error (Slide):", e));
              }
            } else {
              console.log(`[GENERATE] Metadata-only for ${cert.recipientName}. Reusing Slides: ${slideFileId}`);
            }

            let pdfFileId = null;
            let pdfUrl = null;
            const pdfName = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
            const needsPdf = !!batch.pdfFolderId || isR2Configured();
            let pdfBuffer: Buffer | null = null;

            if (needsPdf) {
              try {
                pdfBuffer = await exportSlidesToPdf(userId, slideFileId);
              } catch (pdfErr) {
                console.error("Failed to export PDF for certificate:", cert.id, pdfErr);
              }
            }

            if (pdfBuffer && batch.pdfFolderId) {
              try {
                const pdfRes = await uploadPdf(userId, pdfName, pdfBuffer, batch.pdfFolderId);
                pdfFileId = pdfRes.fileId;
                pdfUrl = pdfRes.url;
                if (oldPdfFileId) {
                  deleteFile(userId, oldPdfFileId).catch(e => console.error("Cleanup error (PDF):", e));
                }
              } catch (pdfErr) {
                console.error("Failed to upload PDF to Google Drive:", cert.id, pdfErr);
              }
            }

            let r2PdfUrl: string | null = null;
            if (pdfBuffer && isR2Configured()) {
              try {
                const phoneNumber = extractPhoneNumber(rowData);
                const r2Folder = phoneNumber || cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_");
                const r2Key = await uploadPdfToR2(r2Folder, pdfName, pdfBuffer);
                r2PdfUrl = getR2PublicUrl(r2Key);
                if (oldR2Url) {
                  const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
                  if (r2PublicBase && oldR2Url.startsWith(r2PublicBase + "/") && oldR2Url !== r2PdfUrl) {
                    const oldKey = oldR2Url.slice(r2PublicBase.length + 1);
                    deleteR2Object(oldKey).catch(e => console.error("Cleanup error (R2):", e));
                  }
                }
              } catch (r2Err) {
                console.error("[R2] Upload failed for certificate:", cert.id, r2Err);
              }
            }

            await supabaseAdmin.from("certificates").update({
              status: "generated",
              slide_file_id: slideFileId,
              slide_url: slideUrl,
              pdf_file_id: pdfFileId,
              pdf_url: pdfUrl,
              r2_pdf_url: r2PdfUrl,
              error_message: null,
              updated_at: new Date().toISOString(),
              requires_visual_regen: false,
            }).eq("id", cert.id);

            if (cert.recipientEmail) {
              upsertStudentProfile({
                email: cert.recipientEmail,
                name: cert.recipientName,
                certId: cert.id,
                batchId,
                batchName: batch.name,
                r2PdfUrl: r2PdfUrl ?? null,
                pdfUrl: pdfUrl ?? null,
                slideUrl: slideUrl ?? null,
                status: "generated",
              }).catch((err) => console.error("[PROFILE] upsert failed for", cert.recipientEmail, err));
            }

            if (cert.status !== "generated" && cert.status !== "sent") {
              await supabaseAdmin.rpc("increment_batch_column", {
                p_batch_id: batchId, p_column: "generated_count", p_amount: 1
              });
            }
            generated++;
          } catch (err: any) {
            await supabaseAdmin.from("certificates").update({
              status: "failed",
              error_message: err.message,
            }).eq("id", cert.id);
            await supabaseAdmin.rpc("increment_batch_column", {
              p_batch_id: batchId, p_column: "failed_count", p_amount: 1
            });
            failed++;
          }
        }));
      }

      const newStatus = failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
      await supabaseAdmin.from("batches").update({ status: newStatus }).eq("id", batchId);
    })().catch(async (err: any) => {
      console.error("[GENERATE] Background processing failed:", err);
      await supabaseAdmin.from("batches").update({ status: "draft" }).eq("id", batchId);
    });
    return;
  } catch (err: any) {
    console.error("[GENERATE] Initial request failed:", err);
    try {
      await supabaseAdmin.from("batches").update({ status: "draft" }).eq("id", batchId);
    } catch {}
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// Send certificates via Gmail
router.post("/batches/:batchId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batchRow, error } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (error || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { emailSubject: reqSubject, emailBody: reqBody } = req.body;
    const subject = reqSubject || batch.emailSubject || "Your Certificate";
    const body = reqBody || batch.emailBody || "Please find your certificate attached.";

    await supabaseAdmin
      .from("batches")
      .update({ status: "sending", email_subject: subject, email_body: body })
      .eq("id", batchId);

    const { data: certsData } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("batch_id", batchId);
    const allCerts = (certsData || []).map(toCamel) as Certificate[];
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

    const alreadySent = allCerts.filter(c => c.status === "sent").length;
    const totalSent = sent + alreadySent;
    const newStatus = failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
    await supabaseAdmin.from("batches").update({ status: newStatus, sent_count: totalSent }).eq("id", batchId);

    return res.json({ success: failed === 0, message: `Sent ${sent} emails. ${failed} failed.`, processed: sent, failed });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Send certificates via WhatsApp
router.post("/batches/:batchId/send-whatsapp", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({ error: "WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN." });
  }

  const { batchId } = req.params;

  try {
    const { data: batchRow, error } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (error || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { var1Template, var2Template, var3Template } = req.body;
    await supabaseAdmin.from("batches").update({ status: "sending" }).eq("id", batchId);

    const { data: certsData } = await supabaseAdmin.from("certificates").select("*").eq("batch_id", batchId);
    const allCerts = (certsData || []).map(toCamel) as Certificate[];
    const toSend = allCerts.filter((c: Certificate) => (c.status === "generated" || c.status === "failed") && (c as any).r2PdfUrl);

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
            await supabaseAdmin.from("certificates").update({ status: "failed", error_message: "No phone number found in row data" }).eq("id", cert.id);
            failed++;
            return;
          }
          let var1 = var1Template || cert.recipientName;
          let var2 = var2Template || batch.name;
          const emailPrefix = cert.recipientEmail?.split("@")[0] || cert.recipientName;
          let var3 = var3Template || emailPrefix;
          for (const [col, value] of Object.entries(rowData)) {
            var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
            var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
            var3 = var3.replace(new RegExp(`<<${col}>>`, "gi"), value);
          }
          var3 = var3.replace(/<<EmailPrefix>>/gi, emailPrefix);

          const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
          const wamid = await sendWhatsAppDocument(phone, (cert as any).r2PdfUrl, pdfFilename, var1, var2, var3);

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
          await supabaseAdmin.from("certificates").update({ status: "failed", error_message: err.message }).eq("id", cert.id);
          failed++;
        }
      }));
    }

    const alreadySent = allCerts.filter(c => c.status === "sent").length;
    const totalSent = sent + alreadySent;
    const newStatus = failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
    await supabaseAdmin.from("batches").update({
      status: newStatus,
      sent_count: totalSent,
      whatsapp_sent_count: (batch.whatsappSentCount || 0) + sent,
    }).eq("id", batchId);

    return res.json({ success: failed === 0, message: `Sent ${sent} WhatsApp messages. ${failed} failed.`, processed: sent, failed });
  } catch (err: any) {
    await supabaseAdmin.from("batches").update({ status: "generated" }).eq("id", batchId);
    return res.status(500).json({ error: err.message });
  }
});

// Send a single certificate via email
router.post("/batches/:batchId/certificates/:certId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId, certId } = req.params;

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin.from("batches").select("*").eq("id", batchId).single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { data: certRow, error: certErr } = await supabaseAdmin.from("certificates").select("*").eq("id", certId).single();
    if (certErr || !certRow) return res.status(404).json({ error: "Certificate not found" });
    const cert = toCamel(certRow) as any;

    if (!cert.recipientEmail) return res.status(400).json({ error: "Certificate has no email address" });
    if (!cert.slideFileId) return res.status(400).json({ error: "Certificate has not been generated yet" });

    const { emailSubject: reqSubject, emailBody: reqBody } = req.body;
    const subject = reqSubject || batch.emailSubject || "Your Certificate";
    const body = reqBody || batch.emailBody || "Please find your certificate attached.";

    const pdfBuffer = await exportSlidesToPdf(userId, cert.slideFileId);
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
    await supabaseAdmin.from("certificates").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null }).eq("id", certId);

    const { data: allCerts } = await supabaseAdmin.from("certificates").select("status").eq("batch_id", batchId);
    const sentCount = (allCerts || []).filter((c: { status: string }) => c.status === "sent").length;
    await supabaseAdmin.from("batches").update({ sent_count: sentCount }).eq("id", batchId);

    return res.json({ success: true, message: `Certificate sent to ${cert.recipientEmail}` });
  } catch (err: any) {
    await supabaseAdmin.from("certificates").update({ status: "failed", error_message: err.message }).eq("id", certId);
    return res.status(500).json({ error: err.message });
  }
});

// Send a single certificate via WhatsApp
router.post("/batches/:batchId/certificates/:certId/send-whatsapp", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({ error: "WhatsApp is not configured." });
  }

  const { batchId, certId } = req.params;

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin.from("batches").select("*").eq("id", batchId).single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { data: certRow, error: certErr } = await supabaseAdmin.from("certificates").select("*").eq("id", certId).single();
    if (certErr || !certRow) return res.status(404).json({ error: "Certificate not found" });
    const cert = toCamel(certRow) as any;

    if (!cert.r2PdfUrl) return res.status(400).json({ error: "No R2 PDF URL for this certificate" });

    const rowData = (cert.rowData as Record<string, string>) || {};
    const { var1Template, var2Template, var3Template } = req.body;
    const phone = extractPhoneNumber(rowData);
    if (!phone) return res.status(400).json({ error: "No phone number found for this certificate" });

    let var1 = var1Template || cert.recipientName;
    let var2 = var2Template || batch.name;
    const emailPrefix = cert.recipientEmail?.split("@")[0] || cert.recipientName;
    let var3 = var3Template || emailPrefix;
    for (const [col, value] of Object.entries(rowData)) {
      var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
      var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
      var3 = var3.replace(new RegExp(`<<${col}>>`, "gi"), value);
    }
    var3 = var3.replace(/<<EmailPrefix>>/gi, emailPrefix);

    const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    const wamid = await sendWhatsAppDocument(phone, cert.r2PdfUrl, pdfFilename, var1, var2, var3);
    await supabaseAdmin.from("certificates").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      whatsapp_message_id: wamid || null,
      whatsapp_status: "sent",
    }).eq("id", certId);

    if (wamid) {
      await supabaseAdmin.from("wa_messages").insert({ wamid, batch_id: batchId, cert_id: certId });
    }

    const { data: allCerts } = await supabaseAdmin.from("certificates").select("status").eq("batch_id", batchId);
    const sentCount = (allCerts || []).filter((c: { status: string }) => c.status === "sent").length;
    const { data: batchData } = await supabaseAdmin.from("batches").select("whatsapp_sent_count").eq("id", batchId).single();
    await supabaseAdmin.from("batches").update({
      sent_count: sentCount,
      whatsapp_sent_count: ((batchData as any)?.whatsapp_sent_count || 0) + 1,
    }).eq("id", batchId);

    return res.json({ success: true, message: `WhatsApp sent to ${phone}` });
  } catch (err: any) {
    await supabaseAdmin.from("certificates").update({ status: "failed", error_message: err.message }).eq("id", certId);
    return res.status(500).json({ error: err.message });
  }
});

// Update a batch configuration
router.patch("/batches/:batchId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const updateData = req.body;

  try {
    const { data: batch, error } = await supabaseAdmin.from("batches").select("user_id").eq("id", batchId).single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

    const fieldMap: Record<string, string> = {
      name: "name", sheetId: "sheet_id", sheetName: "sheet_name", tabName: "tab_name",
      templateId: "template_id", templateName: "template_name", columnMap: "column_map",
      emailColumn: "email_column", nameColumn: "name_column", emailSubject: "email_subject",
      emailBody: "email_body", categoryColumn: "category_column",
      categorySlideMap: "category_slide_map", categorySlideIndexes: "category_slide_indexes",
    };

    const finalUpdate: Record<string, any> = {};
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (updateData[camel] !== undefined) {
        finalUpdate[snake] = updateData[camel];
      }
    }

    if (Object.keys(finalUpdate).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await supabaseAdmin.from("batches").update(finalUpdate).eq("id", batchId);
    return res.json({ success: true, updatedFields: Object.keys(finalUpdate) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete a batch and all its certificates
router.delete("/batches/:batchId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batch, error } = await supabaseAdmin.from("batches").select("user_id").eq("id", batchId).single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

    const { data: certsData } = await supabaseAdmin.from("certificates").select("id, r2_pdf_url, recipient_email").eq("batch_id", batchId);
    const certs = certsData || [];

    // Clean up R2 objects
    if (isR2Configured()) {
      const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      const r2Keys: string[] = [];
      for (const cert of certs) {
        if (cert.r2_pdf_url && r2PublicBase && cert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
          r2Keys.push(cert.r2_pdf_url.slice(r2PublicBase.length + 1));
        }
      }
      if (r2Keys.length > 0) {
        try { await deleteR2Objects(r2Keys); }
        catch (r2Err) { console.error("[R2] Failed to delete objects:", r2Err); }
      }
    }

    // Clean up student profile certs and orphaned profiles
    const certIds = certs.map(c => c.id);
    if (certIds.length > 0) {
      // Delete all student_profile_certs for these certs
      await supabaseAdmin.from("student_profile_certs").delete().in("cert_id", certIds);
    }

    // Find and delete orphaned student profiles (profiles with no remaining certs)
    const emailsWithCerts = [...new Set(certs.map(c => c.recipient_email).filter(Boolean))];
    for (const email of emailsWithCerts) {
      try {
        const emailKey = (email as string).toLowerCase().replace(/[^a-z0-9]/g, "_");
        const { data: indexRow } = await supabaseAdmin
          .from("student_profile_index")
          .select("slug")
          .eq("email_key", emailKey)
          .maybeSingle();
        if (!indexRow) continue;
        const { count } = await supabaseAdmin
          .from("student_profile_certs")
          .select("*", { count: "exact", head: true })
          .eq("profile_slug", indexRow.slug);
        if (!count || count === 0) {
          await supabaseAdmin.from("student_profiles").delete().eq("slug", indexRow.slug);
          await supabaseAdmin.from("student_profile_index").delete().eq("email_key", emailKey);
        }
      } catch (profileErr) {
        console.error("[PROFILE] cleanup failed for email", email, profileErr);
      }
    }

    // Delete the batch — cascades to certificates, cert_index, wa_messages via FK
    await supabaseAdmin.from("batches").delete().eq("id", batchId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
