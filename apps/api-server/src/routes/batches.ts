import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import { getSheetsClient } from "../lib/googleSheets.js";
import { createFolder, makeFilePublic, exportSlidesToPdf, generateCertificate } from "../lib/googleDrive.js";
import { deleteR2Objects, isR2Configured } from "../lib/cloudflareR2.js";
import { isWhatsAppConfigured, sendWhatsAppDocument } from "../lib/whatsapp.js";
import { sendEmail } from "../lib/gmail.js";
import { extractPhoneNumber } from "../lib/certUtils.js";
import { generateQueue, sendEmailQueue, sendWhatsAppQueue } from "../queue/queues.js";

const router: IRouter = Router();

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

    // Build lookup maps for O(1) matching instead of O(n) findIndex per row
    const byEmailAndName = new Map<string, Certificate>();
    const byEmail = new Map<string, Certificate>();
    const byName = new Map<string, Certificate>();
    for (const c of existingCerts) {
      if (c.recipientEmail && c.recipientName) byEmailAndName.set(`${c.recipientEmail}__${c.recipientName}`, c);
      if (c.recipientEmail) byEmail.set(c.recipientEmail, c);
      if (c.recipientName) byName.set(c.recipientName, c);
    }
    const matched = new Set<string>(); // track used cert IDs to avoid double-matching

    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; data: any }> = [];
    const visualFields = Object.values(batch.column_map || {}) as string[];
    const now = new Date().toISOString();

    for (const row of dataRows) {
      const rowData: Record<string, string> = {};
      headers.forEach((h, i) => { rowData[h] = (row[i] as string) || ""; });

      const email = rowData[emailColumn] || "";
      const name = rowData[nameColumn] || "Unknown";

      let matchingCert: Certificate | undefined;
      const exactKey = `${email}__${name}`;
      if (email && name && byEmailAndName.has(exactKey) && !matched.has(byEmailAndName.get(exactKey)!.id)) {
        matchingCert = byEmailAndName.get(exactKey);
      } else if (email && byEmail.has(email) && !matched.has(byEmail.get(email)!.id)) {
        matchingCert = byEmail.get(email);
      } else if (name !== "Unknown" && byName.has(name) && !matched.has(byName.get(name)!.id)) {
        matchingCert = byName.get(name);
      }

      if (matchingCert) {
        matched.add(matchingCert.id);
        const hasVisualChanged = matchingCert.recipientName !== name ||
          visualFields.some(col => matchingCert!.rowData?.[col] !== rowData[col]);
        const hasMetadataChanged = !hasVisualChanged && JSON.stringify(matchingCert.rowData) !== JSON.stringify(rowData);

        const updateData: any = { recipient_name: name, recipient_email: email, row_data: rowData, updated_at: now };
        if (hasVisualChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = true;
        } else if (hasMetadataChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = false;
        }
        toUpdate.push({ id: matchingCert.id, data: updateData });
      } else {
        toInsert.push({
          batch_id: batchId, recipient_name: name, recipient_email: email,
          status: "pending", row_data: rowData, slide_file_id: null, slide_url: null,
          sent_at: null, error_message: null, is_paid: false, created_at: now, updated_at: now,
        });
      }
    }

    // Batch insert new certs in one query
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from("certificates").insert(toInsert);
      if (insertErr) throw insertErr;
    }

    // Batch updates: group by identical update shape to minimise round-trips
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await Promise.all(
        toUpdate.slice(i, i + CHUNK).map(({ id, data }) =>
          supabaseAdmin.from("certificates").update(data).eq("id", id)
        )
      );
    }

    const newCount = toInsert.length;
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

    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const job = await generateQueue.add("generate", {
      batchId,
      userId,
      certIds: targetCerts.map((c) => c.id),
      baseUrl,
    });

    return res.json({ success: true, message: "Generation queued", jobId: job.id });
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

    const job = await sendEmailQueue.add("send-email", { batchId, userId, subject, body });
    return res.json({ success: true, message: "Send queued", jobId: job.id });
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

    const job = await sendWhatsAppQueue.add("send-whatsapp", { batchId, userId, var1Template, var2Template, var3Template });
    return res.json({ success: true, message: "WhatsApp send queued", jobId: job.id });
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

// Lazily create an editable Google Slides file for a single cert (on-demand "Open in Slides")
router.post("/batches/:batchId/certificates/:certId/open-slide", async (req, res) => {
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

    if (cert.slideUrl && cert.slideFileId) {
      return res.json({ slideFileId: cert.slideFileId, slideUrl: cert.slideUrl });
    }

    // Resolve template + slideIndex the same way the processor does
    const rowData = (cert.rowData as Record<string, string>) || {};
    let templateId: string = batch.templateId;
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

    const replacements: Record<string, string> = {};
    for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
      replacements[placeholder] = rowData[String(column)] || "";
    }

    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = process.env.PUBLIC_BASE_URL || `${protocol}://${host}`;
    const qrCodeUrl = `${baseUrl}/verify/${batchId}/${certId}`;

    const slideRes = await generateCertificate(
      userId,
      templateId,
      cert.recipientName,
      replacements,
      batch.driveFolderId ?? null,
      qrCodeUrl,
      slideIndex,
    );

    await supabaseAdmin.from("certificates").update({
      slide_file_id: slideRes.fileId,
      slide_url: slideRes.url,
      updated_at: new Date().toISOString(),
    }).eq("id", certId);

    return res.json({ slideFileId: slideRes.fileId, slideUrl: slideRes.url });
  } catch (err: any) {
    console.error("[OPEN-SLIDE] failed:", err.message);
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
    const certIds = certs.map((c: any) => c.id);
    if (certIds.length > 0) {
      await supabaseAdmin.from("student_profile_certs").delete().in("cert_id", certIds);
    }

    // Find and delete orphaned student profiles in bulk
    const uniqueEmails = [...new Set(certs.map((c: any) => c.recipient_email).filter(Boolean))] as string[];
    if (uniqueEmails.length > 0) {
      const emailKeys = uniqueEmails.map((e) => e.toLowerCase().replace(/[^a-z0-9]/g, "_"));

      // Fetch all index rows in one query
      const { data: indexRows } = await supabaseAdmin
        .from("student_profile_index")
        .select("slug, email_key")
        .in("email_key", emailKeys);

      if (indexRows && indexRows.length > 0) {
        const slugs = indexRows.map((r: any) => r.slug);

        // Find which slugs still have certs remaining (after our delete above)
        const { data: remainingCerts } = await supabaseAdmin
          .from("student_profile_certs")
          .select("profile_slug")
          .in("profile_slug", slugs);

        const slugsWithRemainingCerts = new Set((remainingCerts || []).map((r: any) => r.profile_slug));
        const orphanedSlugs = slugs.filter((s: string) => !slugsWithRemainingCerts.has(s));
        const orphanedEmailKeys = indexRows
          .filter((r: any) => orphanedSlugs.includes(r.slug))
          .map((r: any) => r.email_key);

        // Bulk delete orphaned profiles and index entries
        if (orphanedSlugs.length > 0) {
          await Promise.all([
            supabaseAdmin.from("student_profiles").delete().in("slug", orphanedSlugs),
            supabaseAdmin.from("student_profile_index").delete().in("email_key", orphanedEmailKeys),
          ]);
        }
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
