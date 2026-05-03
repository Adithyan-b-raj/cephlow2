import { Router, type IRouter } from "express";
import { supabaseAdmin } from "@workspace/supabase";
import QRCode from "qrcode";
import { getR2PublicUrl } from "../lib/cloudflareR2.js";
import { isUserApproved } from "../lib/approval.js";

const router: IRouter = Router();

// Returns true if the batch's owner is currently approved. Verification is a
// premium feature, so unapproved owners' certs must not resolve publicly.
async function isBatchOwnerApproved(batchId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("batches")
    .select("user_id")
    .eq("id", batchId)
    .maybeSingle();
  if (!data?.user_id) return false;
  return isUserApproved(data.user_id);
}

// Public endpoint — no auth required
router.get("/verify/:batchId/:certId", async (req, res) => {
  try {
    const { batchId, certId } = req.params;

    if (!(await isBatchOwnerApproved(batchId))) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("certificates")
      .select("*, batches(name)")
      .eq("id", certId)
      .eq("batch_id", batchId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    const { batches, ...cert } = data as any;

    let r2PdfUrl = cert.r2_pdf_url || null;
    if (!r2PdfUrl && cert.recipient_name) {
      const safeName = cert.recipient_name.replace(/[^a-zA-Z0-9]/g, "_");
      const reconstructedKey = `${safeName}/${safeName}_certificate.pdf`;
      r2PdfUrl = getR2PublicUrl(reconstructedKey);
    }

    res.json({
      id: certId,
      recipientName: cert.recipient_name,
      status: cert.status,
      batchName: batches?.name,
      issuedAt: cert.sent_at || cert.created_at,
      r2PdfUrl,
      pdfUrl: cert.pdf_url || null,
      slideUrl: cert.slide_url || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// QR code image for a certificate verification URL
router.get("/verify/:batchId/:certId/qr", async (req, res) => {
  try {
    const { batchId, certId } = req.params;

    if (!(await isBatchOwnerApproved(batchId))) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const verifyUrl = `${baseUrl}/verify/${batchId}/${certId}`;

    const qrBuffer = await QRCode.toBuffer(verifyUrl, { type: "png", width: 300, margin: 2 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(qrBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
