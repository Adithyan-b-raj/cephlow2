import { Router, type IRouter } from "express";
import { batchesCollection, certificatesCollection, certIndexCollection, type Batch, type Certificate } from "@workspace/firebase";
import { getSheetsClient } from "../lib/googleSheets.js";
import { generateCertificate, exportSlidesToPdf, createFolder, uploadPdf, makeFilePublic } from "../lib/googleDrive.js";
import { sendEmail } from "../lib/gmail.js";

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

// List all batches
router.get("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const snapshot = await batchesCollection
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    const batches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...serializeDoc(doc.data()),
    }));
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

    const accessToken = req.googleAccessToken;
    if (!accessToken) {
      return res.status(401).json({ error: "Google access token required" });
    }

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
    } = req.body;

    // Fetch the sheet data to create certificate records
    const sheets = getSheetsClient(accessToken);
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
      driveFolderId = await createFolder(accessToken, name);
      // Create a subfolder for PDFs
      if (driveFolderId) {
        pdfFolderId = await createFolder(accessToken, "pdf", driveFolderId);
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
        id: certRef.id, // Store ID explicitly for collectionGroup search
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
  const accessToken = req.googleAccessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Google access token required" });
  }

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

    await makeFilePublic(accessToken, batch.pdfFolderId);

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
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const accessToken = req.googleAccessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Google access token required" });
  }

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
          replacements[placeholder] = rowData[column] || "";
        }

        // Generate a verification URL for the QR code
        const origin = process.env.ORIGIN || "http://localhost:5173";
        const qrCodeUrl = `${origin}/verify/${cert.id}`;

        const { fileId: slideFileId, url: slideUrl } = await generateCertificate(
          accessToken,
          batch.templateId,
          cert.recipientName,
          replacements,
          batch.driveFolderId,
          qrCodeUrl
        );

        // Export to PDF and upload to Drive if we have a PDF subfolder
        let pdfFileId = null;
        let pdfUrl = null;
        if (batch.pdfFolderId) {
          try {
            const pdfBuffer = await exportSlidesToPdf(accessToken, slideFileId);
            const pdfName = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_certificate`;
            const pdfRes = await uploadPdf(accessToken, pdfName, pdfBuffer, batch.pdfFolderId);
            pdfFileId = pdfRes.fileId;
            pdfUrl = pdfRes.url;
          } catch (pdfErr) {
            console.error("Failed to export/upload PDF for certificate:", cert.id, pdfErr);
          }
        }

        await Promise.all([
          certificatesCollection(batchId).doc(cert.id).update({
            status: "generated",
            slideFileId,
            slideUrl,
            pdfFileId,
            pdfUrl,
            errorMessage: null,
          }),
          // Write to fast lookup index so verification is O(1) not O(n)
          certIndexCollection.doc(cert.id).set({ batchId }),
        ]);
        generated++;
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

    res.json({
      success: failed === 0,
      message: `Generated ${generated} certificates. ${failed} failed.`,
      processed: generated,
      failed,
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
  const accessToken = req.googleAccessToken;
  if (!accessToken) {
    return res.status(401).json({ error: "Google access token required" });
  }

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
          pdfBuffer = await exportSlidesToPdf(accessToken, cert.slideFileId);
        }
        const pdfFilename = `${cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_")}_certificate.pdf`;

        // Replace <<placeholder>> in subject and body with actual row data
        const rowData = (cert.rowData as Record<string, string>) || {};
        let personalizedSubject = subject;
        let personalizedBody = body;
        for (const [placeholder, column] of Object.entries(batch.columnMap)) {
          const value = rowData[column] || "";
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${placeholder}>>`, "gi"), value);
        }
        // Also replace any remaining <<column_name>> directly from rowData
        for (const [col, value] of Object.entries(rowData)) {
          personalizedSubject = personalizedSubject.replace(new RegExp(`<<${col}>>`, "gi"), value);
          personalizedBody = personalizedBody.replace(new RegExp(`<<${col}>>`, "gi"), value);
        }

        await sendEmail(accessToken, {
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

export default router;
