import { Hono } from "hono";
import { generateQrPng } from "../lib/qr.js";
import { getR2PublicUrl } from "../lib/r2.js";
import { isUserApproved } from "../lib/approval.js";

const router = new Hono<ContextEnv>();

async function isBatchOwnerApproved(db: D1Database, batchId: string): Promise<boolean> {
  const ws = await db.prepare(`
    SELECT user_id FROM batches WHERE id = ?
  `).bind(batchId).first<{ user_id: string }>();
  if (!ws?.user_id) return false;
  return isUserApproved(db, ws.user_id);
}

// Public endpoint — certificate verification
router.get("/verify/:batchId/:certId", async (c) => {
  try {
    const { batchId, certId } = c.req.param();

    if (!(await isBatchOwnerApproved(c.env.DB, batchId))) {
      return c.json({ error: "Certificate not found" }, 404);
    }

    const cert = await c.env.DB.prepare(`
      SELECT c.*, b.name as batch_name
      FROM certificates c
      JOIN batches b ON c.batch_id = b.id
      WHERE c.id = ? AND c.batch_id = ?
    `).bind(certId, batchId).first<any>();

    if (!cert) {
      return c.json({ error: "Certificate not found" }, 404);
    }

    let r2PdfUrl = cert.r2_pdf_url || null;
    if (!r2PdfUrl && cert.recipient_name) {
      const safeName = cert.recipient_name.replace(/[^a-zA-Z0-9]/g, "_");
      const reconstructedKey = `${safeName}/${safeName}_certificate.pdf`;
      r2PdfUrl = getR2PublicUrl(c.env, reconstructedKey);
    }

    return c.json({
      id: certId,
      recipientName: cert.recipient_name,
      status: cert.status,
      batchName: cert.batch_name,
      issuedAt: cert.sent_at || cert.created_at,
      r2PdfUrl,
      pdfUrl: cert.pdf_url || null,
      slideUrl: cert.slide_url || null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// QR code image generator (public)
router.get("/verify/:batchId/:certId/qr", async (c) => {
  try {
    const { batchId, certId } = c.req.param();

    if (!(await isBatchOwnerApproved(c.env.DB, batchId))) {
      return c.json({ error: "Certificate not found" }, 404);
    }

    const baseUrl = (c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");
    const verifyUrl = `${baseUrl}/verify/${batchId}/${certId}`;

    const qrBytes = await generateQrPng(verifyUrl);

    return new Response(qrBytes as any, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
