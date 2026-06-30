import { Hono } from "hono";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";

const router = new Hono<ContextEnv>();

// 1. List certificates with optional filters
router.get("/certificates", workspaceMiddleware, async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const batchId = c.req.query("batchId");
    const status = c.req.query("status");

    if (batchId) {
      const batch = await c.env.DB.prepare(`
        SELECT user_id, workspace_id FROM batches WHERE id = ?
      `).bind(batchId).first<any>();

      if (!batch) return c.json({ error: "Batch not found" }, 404);
      if (batch.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);
      if (!isAdminOrOwner(workspace.role) && batch.user_id !== user.uid) {
        return c.json({ error: "Access denied" }, 403);
      }

      let query = "SELECT * FROM certificates WHERE batch_id = ?";
      const params: any[] = [batchId];

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }

      query += " ORDER BY created_at DESC";

      const { results } = await c.env.DB.prepare(query).bind(...params).all<any>();

      const certificates = results.map(row => ({
        id: row.id,
        batchId: row.batch_id,
        recipientName: row.recipient_name,
        recipientEmail: row.recipient_email,
        status: row.status,
        rowData: JSON.parse(row.row_data || "{}"),
        isPaid: Boolean(row.is_paid),
        requiresVisualRegen: Boolean(row.requires_visual_regen),
        pdfFileId: row.pdf_file_id,
        pdfUrl: row.pdf_url,
        r2PdfUrl: row.r2_pdf_url,
        slideFileId: row.slide_file_id,
        slideUrl: row.slide_url,
        whatsappStatus: row.whatsapp_status,
        whatsappMessageId: row.whatsapp_message_id,
        errorMessage: row.error_message,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return c.json({ certificates, total: certificates.length });
    }

    // No batchId — get all certs in the workspace (role-scoped)
    let query = `
      SELECT c.* FROM certificates c
      JOIN batches b ON c.batch_id = b.id
      WHERE b.workspace_id = ?
    `;
    const params: any[] = [workspace.id];

    if (!isAdminOrOwner(workspace.role)) {
      query += " AND b.user_id = ?";
      params.push(user.uid);
    }

    if (status) {
      query += " AND c.status = ?";
      params.push(status);
    }

    query += " ORDER BY c.created_at DESC";

    const { results } = await c.env.DB.prepare(query).bind(...params).all<any>();

    const certificates = results.map(row => ({
      id: row.id,
      batchId: row.batch_id,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      status: row.status,
      rowData: JSON.parse(row.row_data || "{}"),
      isPaid: Boolean(row.is_paid),
      requiresVisualRegen: Boolean(row.requires_visual_regen),
      pdfFileId: row.pdf_file_id,
      pdfUrl: row.pdf_url,
      r2PdfUrl: row.r2_pdf_url,
      slideFileId: row.slide_file_id,
      slideUrl: row.slide_url,
      whatsappStatus: row.whatsapp_status,
      whatsappMessageId: row.whatsapp_message_id,
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({ certificates, total: certificates.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Remove a single recipient (certificate)
router.delete("/certificates/:certId", workspaceMiddleware, async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { certId } = c.req.param();
  try {
    const cert = await c.env.DB.prepare(`
      SELECT id, batch_id, recipient_email, r2_pdf_url FROM certificates WHERE id = ?
    `).bind(certId).first<any>();

    if (!cert) return c.json({ error: "Certificate not found" }, 404);

    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM batches WHERE id = ?
    `).bind(cert.batch_id).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (batch.workspace_id !== workspace.id) return c.json({ error: "Access denied" }, 403);
    if (!isAdminOrOwner(workspace.role) && batch.user_id !== user.uid) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Clean up R2 object
    const r2PublicBase = c.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (cert.r2_pdf_url && r2PublicBase && cert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
      const key = decodeURIComponent(cert.r2_pdf_url.slice(r2PublicBase.length + 1));
      c.executionCtx.waitUntil(c.env.CERTIFICATES.delete(key).catch(() => null));
    }

    // Clean up student profile cert and check if orphaned
    await c.env.DB.prepare(`
      DELETE FROM student_profile_certs WHERE cert_id = ?
    `).bind(certId).run();

    if (cert.recipient_email) {
      const emailKey = cert.recipient_email.toLowerCase().replace(/[^a-z0-9]/g, "_");
      
      const indexRow = await c.env.DB.prepare(`
        SELECT slug FROM student_profile_index WHERE email_key = ?
      `).bind(emailKey).first<{ slug: string }>();

      if (indexRow) {
        const remaining = await c.env.DB.prepare(`
          SELECT 1 FROM student_profile_certs WHERE profile_slug = ? LIMIT 1
        `).bind(indexRow.slug).first();

        if (!remaining) {
          await c.env.DB.batch([
            c.env.DB.prepare(`DELETE FROM student_profiles WHERE slug = ?`).bind(indexRow.slug),
            c.env.DB.prepare(`DELETE FROM student_profile_index WHERE email_key = ?`).bind(emailKey),
          ]);
        }
      }
    }

    await c.env.DB.prepare(`DELETE FROM certificates WHERE id = ?`).bind(certId).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Public route to verify certificate (no auth required)
router.get("/certificates/:certId/verify", async (c) => {
  const { certId } = c.req.param();
  console.log(`Verifying certificate ID: ${certId}`);
  try {
    const cert = await c.env.DB.prepare(`
      SELECT c.*, b.name as batch_name
      FROM certificates c
      JOIN batches b ON c.batch_id = b.id
      WHERE c.id = ?
    `).bind(certId).first<any>();

    if (!cert) {
      return c.json({ error: "Certificate not found" }, 404);
    }

    return c.json({
      valid: true,
      recipientName: cert.recipient_name,
      batchName: cert.batch_name,
      issuedAt: cert.created_at,
      status: cert.status,
    });
  } catch (err: any) {
    console.error("Verification error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

export default router;
