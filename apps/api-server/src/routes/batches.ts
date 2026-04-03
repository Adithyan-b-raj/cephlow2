import { Router, type IRouter } from "express";
import { db, batchesCollection, certificatesCollection, type Certificate } from "@workspace/firebase";
import { getSheetsClient } from "../lib/googleSheets.js";
import { generateCertificate, exportSlidesToPdf, createFolder, uploadPdf, makeFilePublic } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";
import { uploadPdfToR2, isR2Configured, getR2PublicUrl, deleteR2Objects } from "../lib/cloudflareR2.js";
import { isWhatsAppConfigured, sendWhatsAppDocument } from "../lib/whatsapp.js";

// Column names commonly used for phone numbers (all lowercase, no spaces/underscores for comparison)
const PHONE_COLUMN_NAMES = ["phonenumber", "phone", "mobile", "mobilenumber", "contact", "contactnumber", "contactno", "phoneno"];

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]/g, "");
}

function extractPhoneNumber(rowData: Record<string, string>): string {
  const configuredColumn = process.env.R2_PHONE_COLUMN;
  if (configuredColumn && rowData[configuredColumn]) {
    return rowData[configuredColumn];
  }
  for (const key of Object.keys(rowData)) {
    if (PHONE_COLUMN_NAMES.includes(normalizeColumnName(key))) {
      return rowData[key];
    }
  }
  return "";
}

const router: IRouter = Router();

function serializeDoc(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Derive a URL-safe slug from an email prefix
function emailToSlug(email: string): string {
  const prefix = email.split("@")[0] ?? "user";
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
}

// Auto-create / update a student's public profile after cert generation
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

  // Sanitized email used as the index document key
  const emailKey = email.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const indexRef = db.collection("studentProfileIndex").doc(emailKey);
  const indexDoc = await indexRef.get();

  let slug: string;

  if (indexDoc.exists) {
    slug = indexDoc.data()!.slug as string;
  } else {
    // Find an available slug (handle same-prefix collisions)
    const baseSlug = emailToSlug(email);
    slug = baseSlug;
    let attempt = 2;
    while (true) {
      const existing = await db.collection("studentProfiles").doc(slug).get();
      if (!existing.exists) break;
      slug = `${baseSlug}-${attempt}`;
      attempt++;
    }
    await db.collection("studentProfiles").doc(slug).set({ slug, name, email, updatedAt: new Date() });
    await indexRef.set({ slug });
  }

  await db
    .collection("studentProfiles")
    .doc(slug)
    .collection("certs")
    .doc(certId)
    .set(
      {
        certId,
        batchId,
        batchName,
        recipientName: name,
        r2PdfUrl: r2PdfUrl ?? null,
        pdfUrl: pdfUrl ?? null,
        slideUrl: slideUrl ?? null,
        issuedAt: new Date(),
        status,
      },
      { merge: true }
    );
}

// List all batches
router.get("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const snapshot = await batchesCollection
      .where("userId", "==", userId)
      .get();
    const batches = snapshot.docs
      .map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) }))
      .sort((a: any, b: any) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    res.json({ batches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new batch
router.post("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      name,
      sheetId,
      sheetName,
      tabName,
      templateId,
      templateName,
      columnMap,
      emailColumn,
      nameColumn,
      emailSubject,
      emailBody,
      categoryColumn,
      categoryTemplateMap,
    } = req.body;

    // Fetch the sheet data to create certificate records
    const sheets = await getSheetsClient(userId);
    const range = tabName ? tabName : "A:ZZ";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const rows = response.data.values || [];
    const headers = rows[0] as string[];
    const dataRows = rows.slice(1).filter((r) => r.length > 0);

    // Create a Google Drive folder for this batch
    let driveFolderId = null;
    let pdfFolderId = null;
    try {
      driveFolderId = await createFolder(userId, name);
      // Create a subfolder for PDFs
      if (driveFolderId) {
        pdfFolderId = await createFolder(userId, "pdf", driveFolderId);
      }
    } catch (err) {
      console.error("Failed to create Google Drive folders:", err);
    }

    // Create the batch document
    const batchData = {
      userId,
      name,
      sheetId,
      sheetName,
      tabName: tabName || null,
      templateId,
      templateName,
      columnMap,
      emailColumn,
      nameColumn,
      emailSubject: emailSubject || null,
      emailBody: emailBody || null,
      categoryColumn: categoryColumn || null,
      categoryTemplateMap: categoryTemplateMap || null,
      status: "draft",
      driveFolderId,
      pdfFolderId,
      totalCount: dataRows.length,
      generatedCount: 0,
      sentCount: 0,
      createdAt: new Date(),
    };

    const batchRef = await batchesCollection.add(batchData);
    const batch = { id: batchRef.id, ...batchData };

    // Create individual certificate records (pending)
    const certsCol = certificatesCollection(batchRef.id);
    const writeBatch = batchesCollection.firestore.batch();

    for (const row of dataRows) {
      const rowData: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowData[h] = (row[i] as string) || "";
      });
      const certRef = certsCol.doc();
      writeBatch.set(certRef, {
        batchId: batchRef.id,
        recipientName: rowData[nameColumn] || "Unknown",
        recipientEmail: rowData[emailColumn] || "",
        status: "pending",
        rowData,
        slideFileId: null,
        slideUrl: null,
        sentAt: null,
        errorMessage: null,
        createdAt: new Date(),
      });
    }
    await writeBatch.commit();

    res.status(201).json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get batch detail with certificates
router.get("/batches/:batchId", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { batchId } = req.params;
    const batchDoc = await batchesCollection.doc(batchId).get();

    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = batchDoc.data() as any;

    if (batch.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const certsSnapshot = await certificatesCollection(batchId).get();
    const certificates = certsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeDoc(doc.data()),
    }));

    res.json({ id: batchDoc.id, ...serializeDoc(batchDoc.data() || {}), certificates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Share the PDF folder (make it public)
router.post("/batches/:batchId/share-folder", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  try {
    const batchDoc = await batchesCollection.doc(batchId).get();
    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = batchDoc.data() as any;

    if (batch.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!batch.pdfFolderId) {
      return res.status(400).json({ error: "PDF folder does not exist for this batch" });
    }

    await makeFilePublic(userId, batch.pdfFolderId);

    res.json({
      success: true,
      shareLink: `https://drive.google.com/drive/folders/${batch.pdfFolderId}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate certificates for a batch
router.post("/batches/:batchId/generate", async (req, res) => {
  console.log("[GENERATE] endpoint hit");
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  try {
    const batchRef = batchesCollection.doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = { id: batchDoc.id, ...batchDoc.data() } as any;

    if (batch.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Mark batch as generating
    await batchRef.update({ status: "generating" });

    // Respond immediately so the frontend can start polling for per-cert updates
    res.json({ success: true, message: "Generation started" });

    // Process certificates in the background
    (async () => {
      // Get certificates
      const certsSnapshot = await certificatesCollection(batchId).get();
      const certs = certsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Certificate[];

      let generated = 0;
      let failed = 0;

      for (const cert of certs) {
        if (cert.status === "generated" || cert.status === "sent") {
          generated++;
          continue;
        }
        try {
          const rowData = (cert.rowData as Record<string, string>) || {};
          const replacements: Record<string, string> = {};
          for (const [placeholder, column] of Object.entries(batch.columnMap)) {
            replacements[placeholder] = rowData[String(column)] || "";
          }

          const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
          const qrCodeUrl = `${baseUrl}/verify/${batchId}/${cert.id}`;

          // Pick template: use category-based routing if configured, else default
          let certTemplateId = batch.templateId;
          if (batch.categoryColumn && batch.categoryTemplateMap) {
            const categoryValue = rowData[batch.categoryColumn];
            if (categoryValue && batch.categoryTemplateMap[categoryValue]) {
              certTemplateId = batch.categoryTemplateMap[categoryValue].templateId;
            }
          }

          const { fileId: slideFileId, url: slideUrl } = await generateCertificate(
            userId,
            certTemplateId,
            cert.recipientName,
            replacements,
            batch.driveFolderId,
            qrCodeUrl
          );

          // Export PDF buffer (needed for Drive upload and/or R2 upload)
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

          // Upload to Google Drive
          if (pdfBuffer && batch.pdfFolderId) {
            try {
              const pdfRes = await uploadPdf(userId, pdfName, pdfBuffer, batch.pdfFolderId);
              pdfFileId = pdfRes.fileId;
              pdfUrl = pdfRes.url;
            } catch (pdfErr) {
              console.error("Failed to upload PDF to Google Drive for certificate:", cert.id, pdfErr);
            }
          }

          // Upload to Cloudflare R2 (folder = phone number)
          let r2PdfUrl: string | null = null;
          const r2Ready = isR2Configured();
          console.log(`[R2] isR2Configured=${r2Ready} pdfBuffer=${!!pdfBuffer}`);
          if (pdfBuffer && r2Ready) {
            try {
              const phoneNumber = extractPhoneNumber(rowData);
              console.log(`[R2] phone detected: "${phoneNumber}", rowData keys: ${Object.keys(rowData).join(", ")}`);
              const r2Folder = phoneNumber || cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_");
              const r2Key = await uploadPdfToR2(r2Folder, pdfName, pdfBuffer);
              r2PdfUrl = getR2PublicUrl(r2Key);
            } catch (r2Err) {
              console.error("[R2] Upload failed for certificate:", cert.id, r2Err);
            }
          }

          await certificatesCollection(batchId).doc(cert.id).update({
            status: "generated",
            slideFileId,
            slideUrl,
            pdfFileId,
            pdfUrl,
            r2PdfUrl,
            errorMessage: null,
          });

          // Auto-create/update student's public profile
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

          generated++;

          // Update generatedCount incrementally so the UI progress stays current
          await batchRef.update({ generatedCount: generated });
        } catch (err: any) {
          await certificatesCollection(batchId).doc(cert.id).update({
            status: "failed",
            errorMessage: err.message,
          });
          failed++;
        }
      }

      const newStatus =
        failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
      await batchRef.update({ status: newStatus, generatedCount: generated });
    })().catch(async (err: any) => {
      console.error("[GENERATE] Background processing failed:", err);
      await batchesCollection.doc(batchId).update({ status: "draft" });
    });
  } catch (err: any) {
    await batchesCollection.doc(batchId).update({ status: "draft" });
    res.status(500).json({ error: err.message });
  }
});

// Send certificates via Gmail
router.post("/batches/:batchId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const batchRef = batchesCollection.doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = { id: batchDoc.id, ...batchDoc.data() } as any;

    if (batch.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { emailSubject: reqSubject, emailBody: reqBody } = req.body;
    const subject = reqSubject || batch.emailSubject || "Your Certificate";
    const body = reqBody || batch.emailBody || "Please find your certificate attached.";

    await batchRef.update({ status: "sending", emailSubject: subject, emailBody: body });

    const certsSnapshot = await certificatesCollection(batchId).get();
    const allCerts = certsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Certificate[];

    const toSend = allCerts.filter(
      (c) => c.status === "generated" && c.recipientEmail
    );

    let sent = 0;
    let failed = 0;

    for (const cert of toSend) {
      try {
        let pdfBuffer: Buffer | undefined;
        if (cert.slideFileId) {
          pdfBuffer = await exportSlidesToPdf(userId, cert.slideFileId);
        }
        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

        // Replace <<placeholder>> in subject and body with actual row data
        const rowData = (cert.rowData as Record<string, string>) || {};
        let personalizedSubject = subject;
        let personalizedBody = body;
        for (const [placeholder, column] of Object.entries(batch.columnMap)) {
          const value = rowData[String(column)] || "";
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
        }
        // Also replace any remaining <<column_name>> directly from rowData
        for (const [col, value] of Object.entries(rowData)) {
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${col}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${col}>>`, "gi"), value);
        }

        await sendEmail(userId, {
          to: cert.recipientEmail,
          subject: personalizedSubject,
          body: personalizedBody,
          pdfBuffer,
          pdfFilename,
        });
        await certificatesCollection(batchId).doc(cert.id).update({
          status: "sent",
          sentAt: new Date(),
          errorMessage: null,
        });
        sent++;
      } catch (err: any) {
        await certificatesCollection(batchId).doc(cert.id).update({
          status: "failed",
          errorMessage: err.message,
        });
        failed++;
      }
    }

    const alreadySent = allCerts.filter((c) => c.status === "sent").length;
    const totalSent = sent + alreadySent;

    const newStatus =
      failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
    await batchRef.update({ status: newStatus, sentCount: totalSent });

    res.json({
      success: failed === 0,
      message: `Sent ${sent} emails. ${failed} failed.`,
      processed: sent,
      failed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send certificates via WhatsApp template (document_sender)
router.post("/batches/:batchId/send-whatsapp", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({
      error: "WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
    });
  }

  const { batchId } = req.params;

  try {
    const batchRef = batchesCollection.doc(batchId);
    const batchDoc = await batchRef.get();

    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = { id: batchDoc.id, ...batchDoc.data() } as any;

    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { var1Template, var2Template } = req.body;

    await batchRef.update({ status: "sending" });

    const certsSnapshot = await certificatesCollection(batchId).get();
    const allCerts = certsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Certificate[];

    const toSend = allCerts.filter(
      (c) => (c.status === "generated" || c.status === "failed") && (c as any).r2PdfUrl,
    );

    let sent = 0;
    let failed = 0;

    for (const cert of toSend) {
      try {
        const rowData = (cert.rowData as Record<string, string>) || {};
        const rawPhone = extractPhoneNumber(rowData);
        // Normalize: keep digits only, strip leading +
        const phone = rawPhone.replace(/\D/g, "").replace(/^0+/, "");

        if (!phone) {
          await certificatesCollection(batchId).doc(cert.id).update({
            status: "failed",
            errorMessage: "No phone number found in row data",
          });
          failed++;
          continue;
        }

        // Resolve <<column>> placeholders from rowData
        let var1 = var1Template || cert.recipientName;
        let var2 = var2Template || batch.name;
        for (const [col, value] of Object.entries(rowData)) {
          var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
          var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
        }

        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
        const wamid = await sendWhatsAppDocument(
          phone,
          (cert as any).r2PdfUrl,
          pdfFilename,
          var1,
          var2,
        );

        await certificatesCollection(batchId).doc(cert.id).update({
          status: "sent",
          sentAt: new Date(),
          errorMessage: null,
          whatsappMessageId: wamid || null,
          whatsappStatus: "sent",
        });
        if (wamid) {
          await db.collection("waMessages").doc(wamid).set({ batchId, certId: cert.id });
        }
        sent++;
      } catch (err: any) {
        await certificatesCollection(batchId).doc(cert.id).update({
          status: "failed",
          errorMessage: err.message,
        });
        failed++;
      }
    }

    const alreadySent = allCerts.filter((c) => c.status === "sent").length;
    const totalSent = sent + alreadySent;
    const newStatus =
      failed === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";
    await batchRef.update({
      status: newStatus,
      sentCount: totalSent,
      whatsappSentCount: (batch.whatsappSentCount || 0) + sent,
    });

    res.json({
      success: failed === 0,
      message: `Sent ${sent} WhatsApp messages. ${failed} failed.`,
      processed: sent,
      failed,
    });
  } catch (err: any) {
    await batchesCollection.doc(batchId).update({ status: "generated" });
    res.status(500).json({ error: err.message });
  }
});

// Send a single certificate via email
router.post("/batches/:batchId/certificates/:certId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId, certId } = req.params;

  try {
    const batchDoc = await batchesCollection.doc(batchId).get();
    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = { id: batchDoc.id, ...batchDoc.data() } as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const certDoc = await certificatesCollection(batchId).doc(certId).get();
    if (!certDoc.exists) return res.status(404).json({ error: "Certificate not found" });
    const cert = { id: certDoc.id, ...certDoc.data() } as any;

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
    await certificatesCollection(batchId).doc(certId).update({ status: "sent", sentAt: new Date(), errorMessage: null });

    // Update batch sentCount
    const certsSnapshot = await certificatesCollection(batchId).get();
    const sentCount = certsSnapshot.docs.filter((d) => d.data().status === "sent").length;
    await batchesCollection.doc(batchId).update({ sentCount });

    res.json({ success: true, message: `Certificate sent to ${cert.recipientEmail}` });
  } catch (err: any) {
    await certificatesCollection(batchId).doc(certId).update({ status: "failed", errorMessage: err.message });
    res.status(500).json({ error: err.message });
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
    const batchDoc = await batchesCollection.doc(batchId).get();
    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = { id: batchDoc.id, ...batchDoc.data() } as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const certDoc = await certificatesCollection(batchId).doc(certId).get();
    if (!certDoc.exists) return res.status(404).json({ error: "Certificate not found" });
    const cert = { id: certDoc.id, ...certDoc.data() } as any;

    if (!cert.r2PdfUrl) return res.status(400).json({ error: "No R2 PDF URL for this certificate" });

    const rowData = (cert.rowData as Record<string, string>) || {};
    const { var1Template, var2Template } = req.body;
    const rawPhone = extractPhoneNumber(rowData);
    const phone = rawPhone.replace(/\D/g, "").replace(/^0+/, "");

    if (!phone) return res.status(400).json({ error: "No phone number found for this certificate" });

    let var1 = var1Template || cert.recipientName;
    let var2 = var2Template || batch.name;
    for (const [col, value] of Object.entries(rowData)) {
      var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
      var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
    }

    const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
    const wamid = await sendWhatsAppDocument(phone, cert.r2PdfUrl, pdfFilename, var1, var2);
    await certificatesCollection(batchId).doc(certId).update({
      status: "sent",
      sentAt: new Date(),
      errorMessage: null,
      whatsappMessageId: wamid || null,
      whatsappStatus: "sent",
    });
    if (wamid) {
      await db.collection("waMessages").doc(wamid).set({ batchId, certId });
    }

    // Update batch sentCount and whatsappSentCount
    const certsSnapshot = await certificatesCollection(batchId).get();
    const sentCount = certsSnapshot.docs.filter((d) => d.data().status === "sent").length;
    const batchData = (await batchesCollection.doc(batchId).get()).data() as any;
    await batchesCollection.doc(batchId).update({
      sentCount,
      whatsappSentCount: (batchData?.whatsappSentCount || 0) + 1,
    });

    res.json({ success: true, message: `WhatsApp sent to ${phone}` });
  } catch (err: any) {
    await certificatesCollection(batchId).doc(certId).update({ status: "failed", errorMessage: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Delete a batch and all its certificates
router.delete("/batches/:batchId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const batchDoc = await batchesCollection.doc(batchId).get();
    if (!batchDoc.exists) return res.status(404).json({ error: "Batch not found" });
    const batch = batchDoc.data() as any;

    if (batch.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Delete all certificates in the batch
    const certsSnapshot = await certificatesCollection(batchId).get();

    // Collect R2 keys to delete
    if (isR2Configured()) {
      const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      const r2Keys: string[] = [];
      for (const doc of certsSnapshot.docs) {
        const r2PdfUrl = (doc.data() as any).r2PdfUrl;
        if (r2PdfUrl && r2PublicBase && r2PdfUrl.startsWith(r2PublicBase + "/")) {
          r2Keys.push(r2PdfUrl.slice(r2PublicBase.length + 1));
        }
      }
      if (r2Keys.length > 0) {
        try {
          await deleteR2Objects(r2Keys);
        } catch (r2Err) {
          console.error("[R2] Failed to delete objects during batch delete:", r2Err);
        }
      }
    }

    // Remove certs from student profiles, and clean up empty profiles
    for (const doc of certsSnapshot.docs) {
      const { recipientEmail, id: certId } = { id: doc.id, ...doc.data() } as any;
      if (!recipientEmail) continue;
      try {
        const emailKey = (recipientEmail as string).toLowerCase().replace(/[^a-z0-9]/g, "_");
        const indexDoc = await db.collection("studentProfileIndex").doc(emailKey).get();
        if (!indexDoc.exists) continue;
        const slug = indexDoc.data()!.slug as string;

        await db.collection("studentProfiles").doc(slug).collection("certs").doc(certId).delete();

        // If the profile has no certs left, delete the profile and its index entry
        const remaining = await db.collection("studentProfiles").doc(slug).collection("certs").limit(1).get();
        if (remaining.empty) {
          await db.collection("studentProfiles").doc(slug).delete();
          await db.collection("studentProfileIndex").doc(emailKey).delete();
        }
      } catch (profileErr) {
        console.error("[PROFILE] cleanup failed for cert", doc.id, profileErr);
      }
    }

    const writeBatch = batchesCollection.firestore.batch();
    for (const doc of certsSnapshot.docs) {
      writeBatch.delete(doc.ref);
    }
    writeBatch.delete(batchesCollection.doc(batchId));
    await writeBatch.commit();

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
