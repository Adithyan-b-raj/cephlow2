import { Hono } from "hono";
import { getR2PublicUrl } from "../lib/r2.js";

const router = new Hono<ContextEnv>();

// Public endpoint — gallery view
router.get("/gallery/:batchId", async (c) => {
  try {
    const { batchId } = c.req.param();

    const batch = await c.env.DB.prepare(`
      SELECT id, name, banner_url FROM batches WHERE id = ?
    `).bind(batchId).first<{ id: string; name: string; banner_url: string | null }>();

    if (!batch) {
      return c.json({ error: "Batch not found" }, 404);
    }

    const { results: certificates } = await c.env.DB.prepare(`
      SELECT id, recipient_name, status, r2_pdf_url, pdf_url, slide_url
      FROM certificates
      WHERE batch_id = ? AND status IN ('generated', 'sent')
      ORDER BY recipient_name ASC
    `).bind(batchId).all<any>();

    const items = (certificates || []).map((cert) => {
      let r2PdfUrl = cert.r2_pdf_url || null;
      if (!r2PdfUrl && cert.recipient_name) {
        const safeName = cert.recipient_name.replace(/[^a-zA-Z0-9]/g, "_");
        const reconstructedKey = `${safeName}/${safeName}_certificate.pdf`;
        r2PdfUrl = getR2PublicUrl(c.env, reconstructedKey);
      }
      return {
        id: cert.id,
        recipientName: cert.recipient_name,
        viewUrl: r2PdfUrl || cert.pdf_url || cert.slide_url || null,
      };
    });

    return c.json({
      batchName: batch.name,
      bannerUrl: batch.banner_url || null,
      certificates: items,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
