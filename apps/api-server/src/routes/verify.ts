import { Router, type IRouter } from "express";
import { batchesCollection, certificatesCollection } from "@workspace/firebase";
import QRCode from "qrcode";
import { getR2PublicUrl } from "../lib/cloudflareR2.js";

const router: IRouter = Router();

function serializeTimestamp(value: any): any {
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
}

// Public endpoint — no auth required
router.get("/verify/:batchId/:certId", async (req, res) => {
  try {
    const { batchId, certId } = req.params;

    const [certDoc, batchDoc] = await Promise.all([
      certificatesCollection(batchId).doc(certId).get(),
      batchesCollection.doc(batchId).get(),
    ]);

    if (!certDoc.exists || !batchDoc.exists) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    const cert = certDoc.data()!;
    const batch = batchDoc.data()!;

    // For old certs that predate r2PdfUrl storage, reconstruct from the known key pattern
    let r2PdfUrl = cert.r2PdfUrl || null;
    if (!r2PdfUrl && cert.recipientName) {
      const safeName = cert.recipientName.replace(/[^a-zA-Z0-9]/g, "_");
      const reconstructedKey = `${safeName}/${safeName}_certificate.pdf`;
      r2PdfUrl = getR2PublicUrl(reconstructedKey);
    }

    res.json({
      id: certId,
      recipientName: cert.recipientName,
      status: cert.status,
      batchName: batch.name,
      issuedAt: serializeTimestamp(cert.sentAt) || serializeTimestamp(cert.createdAt),
      r2PdfUrl,
      pdfUrl: cert.pdfUrl || null,
      slideUrl: cert.slideUrl || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// QR code image for a certificate verification URL
router.get("/verify/:batchId/:certId/qr", async (req, res) => {
  try {
    const { batchId, certId } = req.params;

    const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const verifyUrl = `${baseUrl}/verify/${batchId}/${certId}`;

    const qrBuffer = await QRCode.toBuffer(verifyUrl, {
      type: "png",
      width: 300,
      margin: 2,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(qrBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
