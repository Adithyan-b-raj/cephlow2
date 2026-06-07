import { Router, type IRouter } from "express";
import { supabaseAdmin } from "@workspace/supabase";
import { getR2PublicUrl } from "../lib/cloudflareR2.js";

const router: IRouter = Router();

// Public endpoint — no auth required.
// Lets anyone with the batch link browse a gallery of recipient names + their
// certificate PDFs without exposing email addresses.
router.get("/gallery/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("batches")
      .select("id, name, banner_url")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }

    const { data: certificates, error: certError } = await supabaseAdmin
      .from("certificates")
      .select("id, recipient_name, status, r2_pdf_url, pdf_url, slide_url")
      .eq("batch_id", batchId)
      .in("status", ["generated", "sent"])
      .order("recipient_name", { ascending: true });

    if (certError) {
      res.status(500).json({ error: certError.message });
      return;
    }

    const items = (certificates || []).map((cert: any) => {
      let r2PdfUrl = cert.r2_pdf_url || null;
      if (!r2PdfUrl && cert.recipient_name) {
        const safeName = cert.recipient_name.replace(/[^a-zA-Z0-9]/g, "_");
        const reconstructedKey = `${safeName}/${safeName}_certificate.pdf`;
        r2PdfUrl = getR2PublicUrl(reconstructedKey);
      }
      return {
        id: cert.id,
        recipientName: cert.recipient_name,
        viewUrl: r2PdfUrl || cert.pdf_url || cert.slide_url || null,
      };
    });

    res.json({
      batchName: batch.name,
      bannerUrl: batch.banner_url || null,
      certificates: items,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
