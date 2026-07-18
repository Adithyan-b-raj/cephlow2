import { Hono } from "hono";
import { z } from "zod";
import { getAccessToken } from "../lib/google-auth.js";
import { downloadDriveFile, exportSlidesToPdf } from "../lib/google-drive.js";
import { sendEmail } from "../lib/email.js";
import { sendWhatsAppDocument } from "../lib/whatsapp.js";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";
import { requireApproval as approvalMiddleware } from "../middleware/approval.js";
import { upsertStudentProfile, emailToSlug } from "../lib/cert-utils.js";
import { isApprovedInContext } from "../lib/approval.js";
import { normalizePhoneNumber, hasXssPayload } from "../lib/security.js";

const CreateBatchSchema = z.object({
  name: z.string().min(1, "Batch name is required").max(100, "Batch name is too long").refine(
    (val) => !hasXssPayload(val),
    { message: "Batch name contains invalid or malicious characters" }
  ),
  dataSourceKind: z.enum(["inbuilt"]).default("inbuilt"),
  spreadsheetId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  templateName: z.string().nullable().optional(),
  templateKind: z.string().nullable().optional(),
  columnMap: z.record(z.string()).optional(),
  emailColumn: z.string().nullable().optional(),
  nameColumn: z.string().nullable().optional(),
  emailSubject: z.string().max(200).optional(),
  emailBody: z.string().max(2000).optional(),
  categoryColumn: z.string().nullable().optional(),
  categoryTemplateMap: z.record(z.string()).optional(),
  categorySlideMap: z.record(z.string()).optional(),
  categorySlideIndexes: z.record(z.any()).optional(),
});

const router = new Hono<ContextEnv>();

router.use("/batches", workspaceMiddleware);
router.use("/batches/*", workspaceMiddleware);

// Helper to check if batch belongs to workspace and is accessible
function canAccessBatch(batch: any, workspace: any, user: any): boolean {
  return batch.workspace_id === workspace.id &&
    (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
}

// 1. GET /batches — List all batches for the workspace
router.get("/batches", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    let query = `
      SELECT b.*, COUNT(c.id) as cert_count
      FROM batches b
      LEFT JOIN certificates c ON b.id = c.batch_id
      WHERE b.workspace_id = ?
    `;
    const params: any[] = [workspace.id];

    if (!isAdminOrOwner(workspace.role)) {
      query += " AND b.user_id = ?";
      params.push(user.uid);
    }

    query += " GROUP BY b.id ORDER BY b.created_at DESC";

    const { results } = await c.env.DB.prepare(query).bind(...params).all<any>();

    const batches = results.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      name: row.name,
      status: row.status,
      sheetId: row.sheet_id,
      sheetName: row.sheet_name,
      tabName: row.tab_name,
      spreadsheetId: row.spreadsheet_id,
      dataSourceKind: row.data_source_kind,
      templateId: row.template_id,
      templateName: row.template_name,
      columnMap: JSON.parse(row.column_map || "{}"),
      emailColumn: row.email_column,
      nameColumn: row.name_column,
      emailSubject: row.email_subject,
      emailBody: row.email_body,
      categoryColumn: row.category_column,
      categorySlideMap: JSON.parse(row.category_slide_map || "{}"),
      categorySlideIndexes: JSON.parse(row.category_slide_indexes || "{}"),
      bannerUrl: row.banner_url,
      bannerOverlayOpacity: row.banner_overlay_opacity,
      bannerTextColor: row.banner_text_color,
      bannerCropZoom: row.banner_crop_zoom,
      bannerCropX: row.banner_crop_x,
      bannerCropY: row.banner_crop_y,
      generatedCount: row.generated_count,
      failedCount: row.failed_count,
      sentCount: row.sent_count,
      whatsappSentCount: row.whatsapp_sent_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      certCount: row.cert_count || 0,
      totalCount: row.cert_count || 0,
    }));

    return c.json({ spreadsheets: batches, batches });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. GET /batches/:batchId — Get batch details
router.get("/batches/:batchId", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const batch = await c.env.DB.prepare(`
      SELECT * FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const certCountResult = await c.env.DB.prepare(`
      SELECT COUNT(id) as count FROM certificates WHERE batch_id = ?
    `).bind(batchId).first<{ count: number }>();
    const totalCount = certCountResult?.count || 0;

    const certsResult = await c.env.DB.prepare(`
      SELECT * FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<any>();
    const certificates = (certsResult.results || []).map(cert => ({
      id: cert.id,
      batchId: cert.batch_id,
      recipientName: cert.recipient_name,
      recipientEmail: cert.recipient_email || "",
      status: cert.status,
      slideFileId: cert.slide_file_id || undefined,
      slideUrl: cert.slide_url || undefined,
      sentAt: cert.sent_at || undefined,
      errorMessage: cert.error_message || undefined,
      rowData: JSON.parse(cert.row_data || "{}"),
      createdAt: cert.created_at,
      isPaid: Boolean(cert.is_paid),
      requiresVisualRegen: Boolean(cert.requires_visual_regen),
      r2PdfUrl: cert.r2_pdf_url || undefined,
      whatsappStatus: cert.whatsapp_status || undefined,
      whatsappMessageId: cert.whatsapp_message_id || undefined,
    }));

    return c.json({
      id: batch.id,
      workspaceId: batch.workspace_id,
      userId: batch.user_id,
      name: batch.name,
      status: batch.status,
      sheetId: batch.sheet_id,
      sheetName: batch.sheet_name,
      tabName: batch.tab_name,
      spreadsheetId: batch.spreadsheet_id,
      dataSourceKind: batch.data_source_kind,
      templateId: batch.template_id,
      templateName: batch.template_name,
      columnMap: JSON.parse(batch.column_map || "{}"),
      emailColumn: batch.email_column,
      nameColumn: batch.name_column,
      emailSubject: batch.email_subject,
      emailBody: batch.email_body,
      categoryColumn: batch.category_column,
      categorySlideMap: JSON.parse(batch.category_slide_map || "{}"),
      categorySlideIndexes: JSON.parse(batch.category_slide_indexes || "{}"),
      bannerUrl: batch.banner_url,
      bannerOverlayOpacity: batch.banner_overlay_opacity,
      bannerTextColor: batch.banner_text_color,
      bannerCropZoom: batch.banner_crop_zoom,
      bannerCropX: batch.banner_crop_x,
      bannerCropY: batch.banner_crop_y,
      generatedCount: batch.generated_count,
      failedCount: batch.failed_count,
      sentCount: batch.sent_count,
      whatsappSentCount: batch.whatsapp_sent_count,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      totalCount,
      certCount: totalCount,
      certificates,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. POST /batches — Create a draft batch
router.post("/batches", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  try {
    const rawBody = await c.req.json().catch(() => ({}));
    const parseResult = CreateBatchSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return c.json({ error: parseResult.error.errors[0].message }, 400);
    }
    const body = parseResult.data;
    const batchId = crypto.randomUUID();

    const dataSourceKind = "inbuilt";
    const spreadsheetId = body.spreadsheetId || null;

    let headers: string[] = [];
    let dataRows: Record<string, string>[] = [];
    let inbuiltSpreadsheetName = "";

    if (!spreadsheetId) {
      return c.json({ error: "spreadsheetId is required" }, 400);
    }

    const spreadsheet = await c.env.DB.prepare(`
      SELECT name, columns, rows FROM spreadsheets WHERE id = ? AND workspace_id = ?
    `).bind(spreadsheetId, workspace.id).first<any>();
    
    if (!spreadsheet) {
      return c.json({ error: "Spreadsheet not found" }, 400);
    }
    
    inbuiltSpreadsheetName = spreadsheet.name || "";
    const rawCols = JSON.parse(spreadsheet.columns || "[]") as string[];
    const rawRows = JSON.parse(spreadsheet.rows || "[]") as Record<string, string>[];
    
    const firstRow = rawRows[0];
    const filledCols = rawCols.filter((c) => firstRow?.[c]?.trim());
    if (filledCols.length > 0) {
      headers = filledCols.map((c) => firstRow[c].trim());
      dataRows = rawRows.slice(1)
        .filter((r) => filledCols.some((c) => r[c]?.trim()))
        .map((row) => {
          const mapped: Record<string, string> = {};
          filledCols.forEach((oldCol, i) => { mapped[headers[i]] = row[oldCol] ?? ""; });
          return mapped;
        });
    } else {
      headers = rawCols;
      dataRows = rawRows.filter((r) => Object.values(r).some((v) => v?.trim()));
    }

    const statements: any[] = [];

    // 1. Prepare batch insert
    statements.push(c.env.DB.prepare(`
      INSERT INTO batches (
        id, workspace_id, user_id, name, status, sheet_id, sheet_name, tab_name,
        spreadsheet_id, data_source_kind, template_id, template_name, template_kind,
        column_map, email_column, name_column, email_subject, email_body,
        category_column, category_template_map, category_slide_map, category_slide_indexes,
        total_count
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      batchId,
      workspace.id,
      user.uid,
      body.name || "Untitled Batch",
      "",
      inbuiltSpreadsheetName,
      null,
      spreadsheetId,
      dataSourceKind,
      body.templateId || "",
      body.templateName || "",
      body.templateKind || "slides",
      JSON.stringify(body.columnMap || {}),
      body.emailColumn || null,
      body.nameColumn || null,
      body.emailSubject || "Your Certificate",
      body.emailBody || "Please find your certificate attached.",
      body.categoryColumn || null,
      JSON.stringify(body.categoryTemplateMap || {}),
      JSON.stringify(body.categorySlideMap || {}),
      JSON.stringify(body.categorySlideIndexes || {}),
      dataRows.length
    ));

    // 2. Prepare certificate inserts
    for (const rowData of dataRows) {
      const certId = crypto.randomUUID();
      const recipientName = (body.nameColumn ? rowData[body.nameColumn] : null) || "Unknown";
      const recipientEmail = (body.emailColumn ? rowData[body.emailColumn] : null) || "";
      
      const keys = Object.keys(rowData);
      const pKey = keys.find(k => k.toLowerCase() === "phone" || k.toLowerCase() === "whatsapp" || k.toLowerCase().includes("phone"));
      if (pKey && rowData[pKey]) {
        try {
          rowData[pKey] = normalizePhoneNumber(rowData[pKey]);
        } catch (e: any) {
          return c.json({ error: e.message }, 400);
        }
      }
      
      statements.push(c.env.DB.prepare(`
        INSERT INTO certificates (
          id, batch_id, recipient_name, recipient_email, status, row_data, is_paid
        ) VALUES (?, ?, ?, ?, 'pending', ?, 0)
      `).bind(
        certId,
        batchId,
        recipientName,
        recipientEmail,
        JSON.stringify(rowData)
      ));
    }

    // 3. Run all in a batch transaction
    await c.env.DB.batch(statements);

    const batch = await c.env.DB.prepare(`SELECT * FROM batches WHERE id = ?`).bind(batchId).first<any>();

    return c.json({
      id: batch.id,
      workspaceId: batch.workspace_id,
      userId: batch.user_id,
      name: batch.name,
      status: batch.status,
      createdAt: batch.created_at,
    }, 201);
  } catch (err: any) {
    console.error("[POST /batches] error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// 4. PATCH /batches/:batchId — Update batch config
router.patch("/batches/:batchId", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const updateData = await c.req.json().catch(() => ({}));

    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const fieldMap: Record<string, string> = {
      name: "name", sheetId: "sheet_id", sheetName: "sheet_name", tabName: "tab_name",
      templateId: "template_id", templateName: "template_name", columnMap: "column_map",
      emailColumn: "email_column", nameColumn: "name_column", emailSubject: "email_subject",
      emailBody: "email_body", categoryColumn: "category_column",
      categorySlideMap: "category_slide_map", categorySlideIndexes: "category_slide_indexes",
      bannerUrl: "banner_url",
      bannerOverlayOpacity: "banner_overlay_opacity",
      bannerTextColor: "banner_text_color",
      bannerCropZoom: "banner_crop_zoom",
      bannerCropX: "banner_crop_x",
      bannerCropY: "banner_crop_y",
    };

    const fields: string[] = ["updated_at = datetime('now')"];
    const params: any[] = [];

    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (updateData[camel] !== undefined) {
        fields.push(`${snake} = ?`);
        let val = updateData[camel];
        if (camel === "columnMap" || camel === "categorySlideMap" || camel === "categorySlideIndexes") {
          val = JSON.stringify(val);
        }
        params.push(val);
      }
    }

    if (fields.length <= 1) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    params.push(batchId);

    await c.env.DB.prepare(`
      UPDATE batches
      SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...params).run();

    // Synced profile certificate batch name updates
    if (updateData.name !== undefined) {
      await c.env.DB.prepare(`
        UPDATE student_profile_certs
        SET batch_name = ?, updated_at = datetime('now')
        WHERE batch_id = ?
      `).bind(updateData.name, batchId).run();
    }

    return c.json({ success: true, updatedFields: Object.keys(updateData) });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. DELETE /batches/:batchId — Delete batch and all certs
router.delete("/batches/:batchId", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const { results: certs } = await c.env.DB.prepare(`
      SELECT id, r2_pdf_url, recipient_email FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<{ id: string; r2_pdf_url: string | null; recipient_email: string | null }>();

    // R2 file deletion
    const r2PublicBase = c.env.R2_PUBLIC_URL?.replace(/\/$/, "");
    if (r2PublicBase && certs.length > 0) {
      const r2Keys: string[] = [];
      for (const cert of certs) {
        if (cert.r2_pdf_url && cert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
          r2Keys.push(decodeURIComponent(cert.r2_pdf_url.slice(r2PublicBase.length + 1)));
        }
      }
      if (r2Keys.length > 0) {
        c.executionCtx.waitUntil((async () => {
          for (const key of r2Keys) {
            try { await c.env.CERTIFICATES.delete(key); } catch {}
          }
        })());
      }
    }

    // Clean up student profile certs and index listings
    const certIds = certs.map(c => c.id);
    if (certIds.length > 0) {
      const placeholders = certIds.map(() => "?").join(",");
      await c.env.DB.prepare(`
        DELETE FROM student_profile_certs WHERE cert_id IN (${placeholders})
      `).bind(...certIds).run();
      
      const uniqueEmails = [...new Set(certs.map(c => c.recipient_email).filter(Boolean))] as string[];
      if (uniqueEmails.length > 0) {
        const emailKeys = uniqueEmails.map(e => e.toLowerCase().replace(/[^a-z0-9]/g, "_"));
        const emailPlaceholders = emailKeys.map(() => "?").join(",");

        const { results: indexRows } = await c.env.DB.prepare(`
          SELECT slug, email_key FROM student_profile_index
          WHERE email_key IN (${emailPlaceholders})
        `).bind(...emailKeys).all<{ slug: string; email_key: string }>();

        if (indexRows && indexRows.length > 0) {
          const slugs = indexRows.map(r => r.slug);
          const slugPlaceholders = slugs.map(() => "?").join(",");

          // Check if slugs have remaining certs left
          const { results: remainingCerts } = await c.env.DB.prepare(`
            SELECT DISTINCT profile_slug FROM student_profile_certs
            WHERE profile_slug IN (${slugPlaceholders})
          `).bind(...slugs).all<{ profile_slug: string }>();

          const slugsWithRemaining = new Set(remainingCerts.map(r => r.profile_slug));
          const orphanedSlugs = slugs.filter(s => !slugsWithRemaining.has(s));
          const orphanedEmailKeys = indexRows
            .filter(r => orphanedSlugs.includes(r.slug))
            .map(r => r.email_key);

          if (orphanedSlugs.length > 0) {
            const osPlaceholders = orphanedSlugs.map(() => "?").join(",");
            const oekPlaceholders = orphanedEmailKeys.map(() => "?").join(",");
            
            await c.env.DB.batch([
              c.env.DB.prepare(`DELETE FROM student_profiles WHERE slug IN (${osPlaceholders})`).bind(...orphanedSlugs),
              c.env.DB.prepare(`DELETE FROM student_profile_index WHERE email_key IN (${oekPlaceholders})`).bind(...orphanedEmailKeys),
            ]);
          }
        }
      }
    }

    // Cascade delete batch
    await c.env.DB.prepare(`DELETE FROM batches WHERE id = ?`).bind(batchId).run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. POST /batches/:batchId/certificates/:certId/send — Send single certificate via email in-line
router.post("/batches/:batchId/certificates/:certId/send", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId, certId } = c.req.param();
  try {
    const { emailSubject: reqSubject, emailBody: reqBody } = await c.req.json().catch(() => ({}));

    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id, name, email_subject, email_body, column_map FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const cert = await c.env.DB.prepare(`
      SELECT * FROM certificates WHERE id = ? AND batch_id = ?
    `).bind(certId, batchId).first<any>();

    if (!cert) return c.json({ error: "Certificate not found" }, 404);
    if (!cert.recipient_email) return c.json({ error: "Certificate has no email address" }, 400);
    if (!cert.r2_pdf_url && !cert.slide_file_id) return c.json({ error: "Certificate has not been generated yet" }, 400);

    const subject = reqSubject || batch.email_subject || "Your Certificate";
    const body = reqBody || batch.email_body || "Please find your certificate attached.";

    // A. Personalize templates
    let personalizedSubject = subject;
    let personalizedBody = body;
    const rowData = JSON.parse(cert.row_data || "{}");
    const colMap = JSON.parse(batch.column_map || "{}");

    for (const [placeholder, column] of Object.entries(colMap)) {
      const val = rowData[String(column)] || "";
      personalizedSubject = personalizedSubject.replace(new RegExp(`<<${placeholder}>>`, "gi"), val);
      personalizedBody = personalizedBody.replace(new RegExp(`<<${placeholder}>>`, "gi"), val);
    }
    for (const [col, val] of Object.entries(rowData)) {
      personalizedSubject = personalizedSubject.replace(new RegExp(`<<${col}>>`, "gi"), String(val));
      personalizedBody = personalizedBody.replace(new RegExp(`<<${col}>>`, "gi"), String(val));
    }

    // B. Fetch PDF buffer
    let pdfBuffer: ArrayBuffer | undefined;
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "all");

    if (cert.r2_pdf_url) {
      try {
        const res = await fetch(cert.r2_pdf_url);
        if (res.ok) pdfBuffer = await res.arrayBuffer();
      } catch (e: any) {
        console.error("[Worker Send Email] R2 fetch failed, trying Drive:", e.message);
      }
    }

    if (!pdfBuffer && cert.pdf_file_id) {
      try {
        pdfBuffer = await downloadDriveFile(accessToken, cert.pdf_file_id);
      } catch (e: any) {
        console.error("[Worker Send Email] Drive download failed, trying Slides:", e.message);
      }
    }

    if (!pdfBuffer && cert.slide_file_id) {
      try {
        pdfBuffer = await exportSlidesToPdf(accessToken, cert.slide_file_id);
      } catch (e: any) {
        console.error("[Worker Send Email] Slides export failed:", e.message);
      }
    }

    if (!pdfBuffer) {
      return c.json({ error: "Could not retrieve certificate PDF attachment" }, 500);
    }

    const safeName = (cert.recipient_name || "cert").replace(/[^a-zA-Z0-9]/g, "_");
    const safeBatch = (batch.name || "batch").replace(/[^a-zA-Z0-9]/g, "_");
    const pdfFilename = `${safeName}_${safeBatch}.pdf`;

    // C. Deduct email delivery credits
    const emailCost = Number(c.env.CREDIT_COST_EMAIL || 1);
    const wsForEmail = await c.env.DB.prepare(`
      SELECT current_balance FROM workspaces WHERE id = ?
    `).bind(workspace.id).first<{ current_balance: number }>();
    if (!wsForEmail) return c.json({ error: "Workspace not found" }, 404);

    // Atomic deduction (C-2)
    const updatedWsForEmail = await c.env.DB.prepare(`
      UPDATE workspaces SET current_balance = current_balance - ?
      WHERE id = ? AND current_balance >= ?
      RETURNING current_balance
    `).bind(emailCost, workspace.id, emailCost).first<{ current_balance: number }>();

    if (!updatedWsForEmail) {
      return c.json({ error: `Insufficient credits for email delivery: need ${emailCost}, have ${wsForEmail.current_balance}` }, 402);
    }
    const newEmailBalance = updatedWsForEmail.current_balance;
    await c.env.DB.prepare(`
      INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
      VALUES (?, ?, ?, 'deduction', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), workspace.id, user.uid, -emailCost, newEmailBalance,
      `Email delivery: ${cert.recipient_email} (${cert.recipient_name})`,
      JSON.stringify({ certId: cert.id, batchId })
    ).run();

    // D. Send email
    await sendEmail(c.env, {
      to: cert.recipient_email,
      subject: personalizedSubject,
      body: personalizedBody,
      pdfBuffer: new Uint8Array(pdfBuffer),
      pdfFilename,
    });

    // E. Update certificate status to sent
    await c.env.DB.prepare(`
      UPDATE certificates
      SET status = 'sent', sent_at = datetime('now'), error_message = NULL
      WHERE id = ?
    `).bind(certId).run();

    // F. Backfill profile if approved
    const approved = await isApprovedInContext(c.env.DB, user.uid, workspace.id);
    if (approved) {
      try {
        await upsertStudentProfile(c.env.DB, {
          email: cert.recipient_email,
          name: cert.recipient_name,
          certId: cert.id,
          batchId,
          batchName: batch.name,
          r2PdfUrl: cert.r2_pdf_url ?? null,
          pdfUrl: cert.pdf_url ?? null,
          slideUrl: null,
          status: "sent",
        });
      } catch (err: any) {
        console.error("[Worker Send Email] Profile upsert failed:", err.message);
      }
    }

    return c.json({ success: true, message: "Email sent successfully" });
  } catch (err: any) {
    console.error("[Worker Send Email] Error:", err.message);
    await c.env.DB.prepare(`
      UPDATE certificates SET status = 'failed', error_message = ? WHERE id = ?
    `).bind(err.message, certId).run();
    return c.json({ error: err.message }, 500);
  }
});

// 7. POST /batches/:batchId/certificates/:certId/send-whatsapp — Send single certificate via WhatsApp in-line
router.post("/batches/:batchId/certificates/:certId/send-whatsapp", approvalMiddleware, async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId, certId } = c.req.param();
  try {
    const { var1Template, var2Template, var3Template } = await c.req.json().catch(() => ({}));

    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id, name, column_map FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const cert = await c.env.DB.prepare(`
      SELECT * FROM certificates WHERE id = ? AND batch_id = ?
    `).bind(certId, batchId).first<any>();

    if (!cert) return c.json({ error: "Certificate not found" }, 404);
    if (!cert.r2_pdf_url) return c.json({ error: "No R2 PDF URL for this certificate" }, 400);

    const rowData = JSON.parse(cert.row_data || "{}");
    
    // Extract phone number
    const keys = Object.keys(rowData);
    const pKey = keys.find(k => k.toLowerCase() === "phone" || k.toLowerCase() === "whatsapp" || k.toLowerCase().includes("phone"));
    const phone = pKey ? String(rowData[pKey] || "").replace(/[^0-9]/g, "") : "";

    if (!phone) return c.json({ error: "No phone number found for this certificate" }, 400);

    // Personalize variables
    let var1 = var1Template || cert.recipient_name;
    let var2 = var2Template || batch.name;
    const emailPrefix = emailToSlug(cert.recipient_email || cert.recipient_name);
    let var3 = var3Template || emailPrefix;

    for (const [col, value] of Object.entries(rowData)) {
      var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), String(value));
      var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), String(value));
      var3 = var3.replace(new RegExp(`<<${col}>>`, "gi"), String(value));
    }
    var3 = var3.replace(/<<EmailPrefix>>/gi, emailPrefix);

    const safeName = (cert.recipient_name || "cert").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "cert";
    const safeBatch = (batch.name || "batch").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "batch";
    const pdfFilename = `${safeName}_${safeBatch}.pdf`;

    const r2Base = c.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
    const certKey = r2Base && cert.r2_pdf_url?.startsWith(r2Base)
      ? decodeURIComponent(cert.r2_pdf_url.slice(r2Base.length + 1))
      : undefined;

    // Deduct WhatsApp delivery credits
    const whatsappCost = Number(c.env.CREDIT_COST_WHATSAPP || 3);
    const wsForWhatsapp = await c.env.DB.prepare(`
      SELECT current_balance FROM workspaces WHERE id = ?
    `).bind(workspace.id).first<{ current_balance: number }>();
    if (!wsForWhatsapp) return c.json({ error: "Workspace not found" }, 404);

    // Atomic deduction (C-2)
    const updatedWsForWhatsapp = await c.env.DB.prepare(`
      UPDATE workspaces SET current_balance = current_balance - ?
      WHERE id = ? AND current_balance >= ?
      RETURNING current_balance
    `).bind(whatsappCost, workspace.id, whatsappCost).first<{ current_balance: number }>();

    if (!updatedWsForWhatsapp) {
      return c.json({ error: `Insufficient credits for WhatsApp delivery: need ${whatsappCost}, have ${wsForWhatsapp.current_balance}` }, 402);
    }
    const newWhatsappBalance = updatedWsForWhatsapp.current_balance;
    await c.env.DB.prepare(`
      INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
      VALUES (?, ?, ?, 'deduction', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), workspace.id, user.uid, -whatsappCost, newWhatsappBalance,
      `WhatsApp delivery: ${phone} (${cert.recipient_name})`,
      JSON.stringify({ certId: cert.id, batchId })
    ).run();

    // Send WhatsApp Document via Meta Cloud API
    const wamid = await sendWhatsAppDocument(c.env, phone, cert.r2_pdf_url, pdfFilename, var1, var2, var3, certKey);

    const stmts = [
      c.env.DB.prepare(`
        UPDATE certificates
        SET status = 'sent', sent_at = datetime('now'), error_message = NULL, whatsapp_message_id = ?, whatsapp_status = 'sent'
        WHERE id = ?
      `).bind(wamid || null, certId),
    ];

    if (wamid) {
      stmts.push(c.env.DB.prepare(`
        INSERT INTO wa_messages (wamid, batch_id, cert_id) VALUES (?, ?, ?)
      `).bind(wamid, batchId, certId));
    }

    await c.env.DB.batch(stmts);

    // Backfill profile if approved
    const approved = await isApprovedInContext(c.env.DB, user.uid, workspace.id);
    if (approved) {
      try {
        await upsertStudentProfile(c.env.DB, {
          email: cert.recipient_email,
          name: cert.recipient_name,
          certId: cert.id,
          batchId,
          batchName: batch.name,
          r2PdfUrl: cert.r2_pdf_url ?? null,
          pdfUrl: cert.pdf_url ?? null,
          slideUrl: null,
          status: "sent",
        });
      } catch (err: any) {
        console.error("[Worker Send WhatsApp] Profile upsert failed:", err.message);
      }
    }

    // Update batch sent count in background
    c.executionCtx.waitUntil((async () => {
      const allCerts = await c.env.DB.prepare(`SELECT status FROM certificates WHERE batch_id = ?`).bind(batchId).all<{ status: string }>();
      const sentCount = (allCerts.results || []).filter(c => c.status === "sent").length;
      await c.env.DB.prepare(`
        UPDATE batches
        SET sent_count = ?, whatsapp_sent_count = whatsapp_sent_count + 1
        WHERE id = ?
      `).bind(sentCount, batchId).run();
    })());

    return c.json({ success: true, message: `WhatsApp sent to ${phone}` });
  } catch (err: any) {
    console.error("[Worker Send WhatsApp] Error:", err.message);
    await c.env.DB.prepare(`
      UPDATE certificates SET status = 'failed', error_message = ? WHERE id = ?
    `).bind(err.message, certId).run();
    return c.json({ error: err.message }, 500);
  }
});

// 8. POST /batches/:batchId/send-start — client send loops hook to mark status as sending
router.post("/batches/:batchId/send-start", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    await c.env.DB.prepare(`UPDATE batches SET status = 'sending' WHERE id = ?`).bind(batchId).run();
    return c.json({ success: true, status: "sending" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. POST /batches/:batchId/send-complete — client send loops hook to wrap up
router.post("/batches/:batchId/send-complete", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const { sentCount = 0, failedCount = 0 } = await c.req.json().catch(() => ({}));

    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id, sent_count FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const totalSent = (batch.sent_count || 0) + sentCount;
    const newStatus = failedCount === 0 ? "sent" : totalSent > 0 ? "partial" : "generated";

    await c.env.DB.prepare(`
      UPDATE batches SET status = ?, sent_count = ? WHERE id = ?
    `).bind(newStatus, totalSent, batchId).run();

    return c.json({ success: true, status: newStatus, totalSent });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 10. POST /batches/:batchId/sync-profiles — Backfill student profiles
router.post("/batches/:batchId/sync-profiles", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id, name FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    const approved = await isApprovedInContext(c.env.DB, batch.user_id, workspace.id);
    if (!approved) {
      return c.json({ error: "Profile pages are available for approved organizations only." }, 403);
    }

    const { results: certs } = await c.env.DB.prepare(`
      SELECT id, recipient_name, recipient_email, r2_pdf_url, pdf_url, status
      FROM certificates
      WHERE batch_id = ? AND status IN ('sent', 'generated')
    `).bind(batchId).all<any>();

    const profiles = certs
      .filter((c) => c.recipient_email)
      .map((c) => ({
        email: c.recipient_email!,
        name: c.recipient_name,
        certId: c.id,
        batchName: batch.name,
        r2PdfUrl: c.r2_pdf_url ?? null,
        pdfUrl: c.pdf_url ?? null,
        slideUrl: null,
      }));

    if (profiles.length === 0) return c.json({ synced: 0 });

    // Sync in background using c.executionCtx
    c.executionCtx.waitUntil((async () => {
      for (const p of profiles) {
        try {
          await upsertStudentProfile(c.env.DB, {
            email: p.email,
            name: p.name,
            certId: p.certId,
            batchId,
            batchName: p.batchName,
            r2PdfUrl: p.r2PdfUrl,
            pdfUrl: p.pdfUrl,
            slideUrl: null,
            status: "generated",
          });
        } catch (err: any) {
          console.error("[sync-profiles] Profile backfill failed:", err.message);
        }
      }
    })());

    return c.json({ synced: profiles.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 11. POST /batches/:batchId/convert-to-inbuilt — Convert Google Sheet batch to inbuilt spreadsheet batch
router.post("/batches/:batchId/convert-to-inbuilt", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();

  try {
    const batch = await c.env.DB.prepare(`
      SELECT * FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    // If already converted/inbuilt, return existing spreadsheet ID
    if (batch.spreadsheet_id && batch.data_source_kind === "inbuilt") {
      return c.json({ success: true, spreadsheetId: batch.spreadsheet_id });
    }

    // Retrieve all certificates of this batch
    const certsResult = await c.env.DB.prepare(`
      SELECT row_data FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<any>();
    const certs = certsResult.results || [];

    // Extract unique header keys
    const headerSet = new Set<string>();
    for (const cert of certs) {
      try {
        const rowData = JSON.parse(cert.row_data || "{}");
        for (const key of Object.keys(rowData)) {
          headerSet.add(key);
        }
      } catch {}
    }
    let uniqueHeaders = Array.from(headerSet);
    if (uniqueHeaders.length === 0) {
      // Fallbacks
      uniqueHeaders = ["Name", "Email"];
    }

    // Ensure Name and Email columns are mapped correctly if they were defined in batch
    if (batch.name_column && !uniqueHeaders.includes(batch.name_column)) {
      uniqueHeaders.push(batch.name_column);
    }
    if (batch.email_column && !uniqueHeaders.includes(batch.email_column)) {
      uniqueHeaders.push(batch.email_column);
    }

    // Generate column letters (e.g. A, B, C...)
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const getLetter = (i: number): string => {
      let letter = "";
      while (i >= 0) {
        letter = alphabet[i % 26] + letter;
        i = Math.floor(i / 26) - 1;
      }
      return letter;
    };

    const numCols = Math.max(uniqueHeaders.length, 14);
    const columns: string[] = [];
    for (let i = 0; i < numCols; i++) {
      columns.push(getLetter(i));
    }

    // First row contains the display names
    const firstRow: Record<string, string> = {};
    for (const col of columns) {
      firstRow[col] = "";
    }
    uniqueHeaders.forEach((header, index) => {
      firstRow[columns[index]] = header;
    });

    const rows: Record<string, string>[] = [firstRow];

    // Populate rows from certificates
    for (const cert of certs) {
      const rowObj: Record<string, string> = {};
      for (const col of columns) {
        rowObj[col] = "";
      }
      try {
        const rowData = JSON.parse(cert.row_data || "{}");
        uniqueHeaders.forEach((header, index) => {
          rowObj[columns[index]] = rowData[header] ?? "";
        });
      } catch {}
      rows.push(rowObj);
    }

    // Pad to 50 rows minimum
    const emptyRow = () => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        obj[col] = "";
      }
      return obj;
    };
    while (rows.length < 50) {
      rows.push(emptyRow());
    }

    const newSpreadsheetId = crypto.randomUUID();
    const spreadsheetName = `${batch.name || "Batch"} – Data`;

    // Perform database operations in batch transaction
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO spreadsheets (id, workspace_id, user_id, name, columns, rows)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        newSpreadsheetId,
        workspace.id,
        user.uid,
        spreadsheetName,
        JSON.stringify(columns),
        JSON.stringify(rows)
      ),
      c.env.DB.prepare(`
        UPDATE batches
        SET spreadsheet_id = ?, data_source_kind = 'inbuilt'
        WHERE id = ?
      `).bind(newSpreadsheetId, batchId)
    ]);

    return c.json({ success: true, spreadsheetId: newSpreadsheetId });
  } catch (err: any) {
    console.error("[CONVERT] failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

// 12. POST /batches/:batchId/sync — Sync batch data from source (inbuilt or google)
router.post("/batches/:batchId/sync", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();

  try {
    const batch = await c.env.DB.prepare(`
      SELECT * FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    if (!canAccessBatch(batch, workspace, user)) return c.json({ error: "Access denied" }, 403);

    let headers: string[] = [];
    let dataRows: Record<string, string>[] = [];

    if (!batch.spreadsheet_id) {
      return c.json({ error: "This batch does not have an associated spreadsheet ID." }, 400);
    }

    const spreadsheet = await c.env.DB.prepare(`
      SELECT columns, rows FROM spreadsheets WHERE id = ? AND workspace_id = ?
    `).bind(batch.spreadsheet_id, workspace.id).first<any>();
    if (!spreadsheet) return c.json({ error: "Inbuilt spreadsheet not found" }, 400);

    const rawCols = JSON.parse(spreadsheet.columns || "[]") as string[];
    const rawRows = JSON.parse(spreadsheet.rows || "[]") as Record<string, string>[];
    const firstRow = rawRows[0];
    const filledCols = rawCols.filter((c) => firstRow?.[c]?.trim());
    if (filledCols.length > 0) {
      headers = filledCols.map((c) => firstRow[c].trim());
      dataRows = rawRows.slice(1).filter((r) => filledCols.some((c) => r[c]?.trim())).map((row) => {
        const mapped: Record<string, string> = {};
        filledCols.forEach((oldCol, i) => { mapped[headers[i]] = row[oldCol] ?? ""; });
        return mapped;
      });
    } else {
      headers = rawCols;
      dataRows = rawRows.filter((r) => Object.values(r).some((v) => v?.trim()));
    }
    if (dataRows.length === 0) return c.json({ error: "Spreadsheet is empty." }, 400);

    const nameColumn = batch.name_column;
    const emailColumn = batch.email_column;

    const certsResult = await c.env.DB.prepare(`
      SELECT * FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<any>();
    const existingCerts = certsResult.results || [];

    // Build lookup maps
    const byEmailAndName = new Map<string, any>();
    const byEmail = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const cert of existingCerts) {
      const email = cert.recipient_email;
      const name = cert.recipient_name;
      if (email && name) byEmailAndName.set(`${email}__${name}`, cert);
      if (email) byEmail.set(email, cert);
      if (name) byName.set(name, cert);
    }
    const matched = new Set<string>();

    const toInsert: any[] = [];
    const toUpdate: any[] = [];
    const columnMap = JSON.parse(batch.column_map || "{}");
    const visualFields = Object.values(columnMap) as string[];

    for (const rowData of dataRows) {
      const email = rowData[emailColumn] || "";
      const name = rowData[nameColumn] || "Unknown";

      let matchingCert: any = undefined;
      const exactKey = `${email}__${name}`;
      if (email && name && byEmailAndName.has(exactKey) && !matched.has(byEmailAndName.get(exactKey).id)) {
        matchingCert = byEmailAndName.get(exactKey);
      } else if (email && byEmail.has(email) && !matched.has(byEmail.get(email).id)) {
        matchingCert = byEmail.get(email);
      } else if (name !== "Unknown" && byName.has(name) && !matched.has(byName.get(name).id)) {
        matchingCert = byName.get(name);
      }

      if (matchingCert) {
        matched.add(matchingCert.id);
        const certRowData = JSON.parse(matchingCert.row_data || "{}");
        const hasVisualChanged = matchingCert.recipient_name !== name ||
          visualFields.some(col => certRowData[col] !== rowData[col]);
        const hasMetadataChanged = !hasVisualChanged && JSON.stringify(certRowData) !== JSON.stringify(rowData);

        let status = matchingCert.status;
        let requiresVisualRegen = matchingCert.requires_visual_regen;

        if (hasVisualChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          status = "outdated";
          requiresVisualRegen = 1;
        } else if (hasMetadataChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          status = "outdated";
          requiresVisualRegen = 0;
        }

        toUpdate.push({
          id: matchingCert.id,
          recipient_name: name,
          recipient_email: email,
          row_data: JSON.stringify(rowData),
          status,
          requires_visual_regen: requiresVisualRegen
        });
      } else {
        toInsert.push({
          id: crypto.randomUUID(),
          recipient_name: name,
          recipient_email: email,
          row_data: JSON.stringify(rowData),
          status: "pending"
        });
      }
    }

    const statements: any[] = [];

    // Prepare inserts
    for (const cert of toInsert) {
      statements.push(c.env.DB.prepare(`
        INSERT INTO certificates (
          id, batch_id, recipient_name, recipient_email, status, row_data, is_paid
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
      `).bind(cert.id, batchId, cert.recipient_name, cert.recipient_email, cert.status, cert.row_data));
    }

    // Prepare updates
    for (const cert of toUpdate) {
      statements.push(c.env.DB.prepare(`
        UPDATE certificates
        SET recipient_name = ?, recipient_email = ?, row_data = ?, status = ?, requires_visual_regen = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(cert.recipient_name, cert.recipient_email, cert.row_data, cert.status, cert.requires_visual_regen, cert.id));
    }

    // Update batch total count if inserts happened
    if (toInsert.length > 0) {
      statements.push(c.env.DB.prepare(`
        UPDATE batches
        SET total_count = total_count + ?
        WHERE id = ?
      `).bind(toInsert.length, batchId));
    }

    if (statements.length > 0) {
      await c.env.DB.batch(statements);
    }

    const newCount = toInsert.length;
    return c.json({ success: true, message: `Synced successfully. Added ${newCount} new certificates.`, newCount });
  } catch (err: any) {
    console.error("[SYNC] failed:", err);
    return c.json({ error: err.message }, 500);
  }
});

export default router;
