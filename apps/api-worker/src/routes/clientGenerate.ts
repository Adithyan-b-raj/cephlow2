import { Hono } from "hono";
import type { Env } from "../types.js";
import { getAccessToken } from "../lib/google-auth.js";
import { deleteFile } from "../lib/google-drive.js";
import { generatePresignedPutUrl, getR2PublicUrl } from "../lib/r2.js";
import { isApprovedInContext } from "../lib/approval.js";
import { workspaceMiddleware, isAdminOrOwner } from "../middleware/workspace.js";
import { upsertStudentProfile, emailToSlug } from "../lib/cert-utils.js";

const router = new Hono<ContextEnv>();

router.use("/batches/:batchId/*", workspaceMiddleware);

async function getCachedApproval(env: Env, userId: string, workspaceId?: string | null): Promise<boolean> {
  const cacheKey = `approval:${userId}`;
  const cached = await env.CACHE.get(cacheKey);
  
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return parsed.isApproved;
    } catch {}
  }
  
  const isApproved = await isApprovedInContext(env.DB, userId, workspaceId);
  // Cache for 10 minutes (600s)
  await env.CACHE.put(cacheKey, JSON.stringify({ isApproved }), { expirationTtl: 600 });
  return isApproved;
}

// 1. GET /auth/google/access-token
router.get("/auth/google/access-token", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const tokenData = await getAccessToken(c.env.DB, c.env, user.uid, "all");
    return c.json({ accessToken: tokenData.accessToken, expiresAt: tokenData.expiresAt });
  } catch (err: any) {
    const status = err.status || 500;
    return c.json({ error: err.message, code: err.code }, status);
  }
});

// 2. POST /batches/:batchId/client-generate
router.post("/batches/:batchId/client-generate", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const { selectedCertIds } = await c.req.json().catch(() => ({}));

    const batch = await c.env.DB.prepare(`
      SELECT * FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    if (!batch) return c.json({ error: "Batch not found" }, 404);
    
    const canAccess = batch.workspace_id === workspace.id &&
      (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
    if (!canAccess) return c.json({ error: "Access denied" }, 403);

    const { results: certsData } = await c.env.DB.prepare(`
      SELECT * FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<any>();

    const targetCerts =
      selectedCertIds && Array.isArray(selectedCertIds) && selectedCertIds.length > 0
        ? certsData.filter((c) => selectedCertIds.includes(c.id))
        : certsData.filter((c) => ["pending", "failed", "outdated"].includes(c.status));

    if (targetCerts.length === 0) {
      const hasSelection = selectedCertIds && Array.isArray(selectedCertIds) && selectedCertIds.length > 0;
      return c.json({
        error: hasSelection
          ? "None of the selected certificates need generation."
          : "All certificates have already been generated. Nothing left to resume.",
      }, 400);
    }

    const unpaidCerts = targetCerts.filter((c) => !c.is_paid);

    const unpaidCount = unpaidCerts.length;

    const RATE = Number(c.env.VITE_CERT_GENERATION_RATE || 1);

    const approved = await getCachedApproval(c.env, user.uid, workspace.id);
    const cost = approved ? unpaidCount * RATE : 0;
    
    // Deduct workspace balance and update status via transaction
    const ws = await c.env.DB.prepare(`
      SELECT current_balance FROM workspaces WHERE id = ?
    `).bind(workspace.id).first<{ current_balance: number }>();
    if (!ws) return c.json({ error: "Workspace not found" }, 404);

    if (ws.current_balance < cost) {
      return c.json({ error: `Insufficient funds: need ${cost}, have ${ws.current_balance}` }, 402);
    }

    const newWsBalance = ws.current_balance - cost;
    const unpaidCertIds = unpaidCerts.map((c) => c.id);
    const ledgerId = crypto.randomUUID();

    const stmts = [
      c.env.DB.prepare(`UPDATE workspaces SET current_balance = ? WHERE id = ?`).bind(newWsBalance, workspace.id),
      c.env.DB.prepare(`UPDATE batches SET status = 'generating' WHERE id = ?`).bind(batchId),
      c.env.DB.prepare(`
        INSERT INTO ledgers (id, workspace_id, user_id, type, amount, balance_after, description, metadata)
        VALUES (?, ?, ?, 'deduction', ?, ?, ?, ?)
      `).bind(
        ledgerId, workspace.id, user.uid, -cost, newWsBalance, `Certificate generation: ${batch.name}`,
        JSON.stringify({
          batch_id: batchId,
          unpaid_count: unpaidCount,
          regen_count: 0,
          rate: approved ? RATE : 0,
          regen_rate: 0
        })
      )
    ];

    if (unpaidCertIds.length > 0) {
      stmts.push(c.env.DB.prepare(`
        UPDATE certificates SET is_paid = 1 WHERE id IN (${unpaidCertIds.map(() => "?").join(",")})
      `).bind(...unpaidCertIds));
    }

    await c.env.DB.batch(stmts);

    // Fetch built-in template properties if needed
    let builtinTemplate: any = null;
    const builtinTemplateDataById: Record<string, any> = {};
    if (batch.template_kind === "builtin") {
      const neededIds = new Set<string>([batch.template_id]);
      if (batch.category_template_map) {
        try {
          const catMap = JSON.parse(batch.category_template_map);
          for (const v of Object.values(catMap as Record<string, { templateId: string }>)) {
            if (v.templateId) neededIds.add(v.templateId);
          }
        } catch {}
      }

      const placeholders = [...neededIds].map(() => "?").join(",");
      const { results: tplRows } = await c.env.DB.prepare(`
        SELECT id, name, canvas, placeholders FROM builtin_templates
        WHERE id IN (${placeholders}) AND workspace_id = ?
      `).bind(...[...neededIds], workspace.id).all<any>();

      for (const row of tplRows ?? []) {
        let canvasObj = null;
        let pList = null;
        try { canvasObj = JSON.parse(row.canvas); } catch {}
        try { pList = JSON.parse(row.placeholders); } catch {}
        
        const tplData = { id: row.id, name: row.name, canvas: canvasObj || row.canvas, placeholders: pList || row.placeholders };
        builtinTemplateDataById[row.id] = tplData;
        if (row.id === batch.template_id) builtinTemplate = tplData;
      }
    }

    // Cache generation session in KV (expires in 2 hours)
    await c.env.CACHE.put(`session:${batchId}`, JSON.stringify({
      userId: user.uid,
      workspaceId: workspace.id,
      isApproved: approved,
    }), { expirationTtl: 7200 });

    const baseUrl = (c.env.PUBLIC_BASE_URL || "https://cephlow.online").replace(/\/$/, "");

    return c.json({
      success: true,
      isApproved: approved,
      batch: {
        id: batch.id,
        name: batch.name,
        templateId: batch.template_id,
        templateKind: batch.template_kind || "slides",
        columnMap: JSON.parse(batch.column_map || "{}"),
        driveFolderId: batch.drive_folder_id,
        pdfFolderId: batch.pdf_folder_id,
        categoryColumn: batch.category_column,
        categoryTemplateMap: JSON.parse(batch.category_template_map || "{}"),
        categorySlideMap: JSON.parse(batch.category_slide_map || "{}"),
        builtinTemplate,
        builtinTemplateDataById: Object.keys(builtinTemplateDataById).length > 0 ? builtinTemplateDataById : null,
      },
      certificates: targetCerts.map((c) => ({
        id: c.id,
        recipientName: c.recipient_name,
        recipientEmail: c.recipient_email,
        status: c.status,
        rowData: JSON.parse(c.row_data || "{}"),
        slideFileId: c.slide_file_id,
        requiresVisualRegen: Boolean(c.requires_visual_regen),
        r2PdfUrl: c.r2_pdf_url,
      })),
      baseUrl,
    });
  } catch (err: any) {
    console.error("[CLIENT-GENERATE] Initial request failed:", err.message);
    try {
      await c.env.DB.prepare(`UPDATE batches SET status = 'draft' WHERE id = ?`).bind(batchId).run();
    } catch {}
    return c.json({ error: err.message }, 500);
  }
});

// 3. POST /batches/:batchId/presigned-urls
router.post("/batches/:batchId/presigned-urls", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const { certificates, batchName } = await c.req.json().catch(() => ({}));
    if (!Array.isArray(certificates)) {
      return c.json({ error: "certificates array is required" }, 400);
    }

    // Read session cache
    const sessionStr = await c.env.CACHE.get(`session:${batchId}`);
    let approved = false;
    if (sessionStr) {
      try { approved = JSON.parse(sessionStr).isApproved; } catch {}
    } else {
      approved = await getCachedApproval(c.env, user.uid, workspace.id);
    }

    if (!approved) {
      return c.json({
        error: "R2 storage is restricted to approved organizations. Free tier uploads to Google Drive.",
        code: "APPROVAL_REQUIRED",
      }, 403);
    }

    // Verify batch ownership
    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id FROM batches WHERE id = ?
    `).bind(batchId).first<any>();
    
    const canAccess = batch && batch.workspace_id === workspace.id &&
      (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
    if (!canAccess) return c.json({ error: "Access denied" }, 403);

    const presignedUrls = [];
    for (const cert of certificates) {
      const { certId, recipientName, rowData } = cert;
      const shortBatchId = batchId.replace(/-/g, "").slice(0, 8);
      const safeName = (recipientName || "cert").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "cert";
      const safeBatchName = (batchName || "batch").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "batch";
      const pdfName = `${safeName}_${safeBatchName}_${shortBatchId}`;
      
      let phoneNumber = "";
      if (rowData) {
        // Extract phone number helper logic
        const keys = Object.keys(rowData);
        const pKey = keys.find(k => k.toLowerCase() === "phone" || k.toLowerCase() === "whatsapp" || k.toLowerCase().includes("phone"));
        if (pKey) phoneNumber = String(rowData[pKey] || "").replace(/[^0-9]/g, "");
      }
      
      const folderName = phoneNumber || safeName;

      const { url, key } = await generatePresignedPutUrl(c.env, folderName, pdfName);
      const r2PdfUrl = getR2PublicUrl(c.env, key);

      presignedUrls.push({ certId, uploadUrl: url, r2PdfUrl });
    }

    console.log(`[PRESIGNED-URLS] Generated ${presignedUrls.length} direct upload URLs`);
    return c.json({ presignedUrls });
  } catch (err: any) {
    console.error("[PRESIGNED-URLS] Failed:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// 4. POST /batches/:batchId/client-report
router.post("/batches/:batchId/client-report", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const { certs } = await c.req.json().catch(() => ({}));
    if (!Array.isArray(certs) || certs.length === 0) {
      return c.json({ error: "certs array is required" }, 400);
    }

    // Verify batch ownership
    const sessionStr = await c.env.CACHE.get(`session:${batchId}`);
    let cachedSession = null;
    try { if (sessionStr) cachedSession = JSON.parse(sessionStr); } catch {}

    if (cachedSession) {
      if (cachedSession.userId !== user.uid || cachedSession.workspaceId !== workspace.id) {
        return c.json({ error: "Access denied" }, 403);
      }
    } else {
      const batch = await c.env.DB.prepare(`
        SELECT user_id, workspace_id FROM batches WHERE id = ?
      `).bind(batchId).first<any>();
      const canAccess = batch && batch.workspace_id === workspace.id &&
        (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
      if (!canAccess) return c.json({ error: "Access denied" }, 403);
    }

    const certIds = certs.map((c: any) => c.certId);
    const placeholders = certIds.map(() => "?").join(",");

    // Update status in batch
    await c.env.DB.prepare(`
      UPDATE certificates
      SET status = 'generated', error_message = NULL, updated_at = datetime('now'), requires_visual_regen = 0
      WHERE id IN (${placeholders})
    `).bind(...certIds).run();

    // Update individual URL paths
    const certsWithUrls = certs.filter((c: any) =>
      c.r2PdfUrl || c.drivePdfFileId || c.drivePdfUrl || c.driveSlideFileId || c.driveSlideUrl
    );
    
    if (certsWithUrls.length > 0) {
      const updates = certsWithUrls.map((item: any) =>
        c.env.DB.prepare(`
          UPDATE certificates
          SET r2_pdf_url = ?, pdf_file_id = ?, pdf_url = ?, slide_file_id = ?, slide_url = ?
          WHERE id = ?
        `).bind(
          item.r2PdfUrl || null,
          item.drivePdfFileId || null,
          item.drivePdfUrl || null,
          item.driveSlideFileId || null,
          item.driveSlideUrl || null,
          item.certId
        )
      );
      // Run updates in batch
      await c.env.DB.batch(updates);
    }

    console.log(`[CLIENT-REPORT] Recorded ${certs.length} certs`);
    return c.json({ success: true });
  } catch (err: any) {
    console.error("[CLIENT-REPORT] Error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// 5. POST /batches/:batchId/client-complete
router.post("/batches/:batchId/client-complete", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const { generated = 0, failed = 0, cancelled = false, profiles = [] } = await c.req.json().catch(() => ({}));

    // Verify session
    const sessionStr = await c.env.CACHE.get(`session:${batchId}`);
    let cachedSession = null;
    try { if (sessionStr) cachedSession = JSON.parse(sessionStr); } catch {}

    if (cachedSession) {
      if (cachedSession.userId !== user.uid || cachedSession.workspaceId !== workspace.id) {
        return c.json({ error: "Access denied" }, 403);
      }
    } else {
      const batch = await c.env.DB.prepare(`
        SELECT user_id, workspace_id FROM batches WHERE id = ?
      `).bind(batchId).first<any>();
      const canAccess = batch && batch.workspace_id === workspace.id &&
        (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
      if (!canAccess) return c.json({ error: "Access denied" }, 403);
    }

    let newStatus = "draft";
    if (cancelled) {
      newStatus = generated > 0 ? "partial" : "draft";
    } else {
      newStatus = failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
    }

    await c.env.DB.prepare(`
      UPDATE batches SET status = ?, generated_count = ?, failed_count = ? WHERE id = ?
    `).bind(newStatus, generated, failed, batchId).run();

    await c.env.CACHE.delete(`session:${batchId}`);

    // Backfill student profiles if approved
    if (profiles.length > 0) {
      const approved = cachedSession ? cachedSession.isApproved : await getCachedApproval(c.env, user.uid, workspace.id);
      if (approved) {
        // Run profile updates concurrently in background using c.executionCtx
        c.executionCtx.waitUntil((async () => {
          for (const p of profiles) {
            try {
              await upsertStudentProfile(c.env.DB, {
                email: p.email,
                name: p.name,
                certId: p.certId,
                batchId,
                batchName: p.batchName,
                r2PdfUrl: p.r2PdfUrl || null,
                pdfUrl: p.pdfUrl || null,
                slideUrl: p.slideUrl || null,
                status: "generated",
              });
            } catch (err: any) {
              console.error("[CLIENT-COMPLETE] Upsert profile failed:", err.message);
            }
          }
        })());
      }
    }

    return c.json({ success: true, status: newStatus });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. POST /batches/:batchId/client-cleanup
router.post("/batches/:batchId/client-cleanup", async (c) => {
  const user = c.get("user")!;
  try {
    const { tempFileIds } = await c.req.json().catch(() => ({}));
    if (!tempFileIds || !Array.isArray(tempFileIds) || tempFileIds.length === 0) {
      return c.json({ success: true });
    }

    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "all");
    
    // Clean up files in background
    c.executionCtx.waitUntil(Promise.all(
      tempFileIds.map((fileId) =>
        deleteFile(accessToken, fileId).catch((e) =>
          console.error("[CLIENT-CLEANUP] Drive delete failed:", fileId, e.message)
        )
      )
    ));

    return c.json({ success: true, cleaned: tempFileIds.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. POST /batches/:batchId/recover-stuck
router.post("/batches/:batchId/recover-stuck", async (c) => {
  const user = c.get("user")!;
  const workspace = c.get("workspace")!;
  const { batchId } = c.req.param();
  try {
    const batch = await c.env.DB.prepare(`
      SELECT user_id, workspace_id, status FROM batches WHERE id = ?
    `).bind(batchId).first<any>();

    const canAccess = batch && batch.workspace_id === workspace.id &&
      (isAdminOrOwner(workspace.role) || batch.user_id === user.uid);
    if (!canAccess) return c.json({ error: "Access denied" }, 403);

    if (batch.status !== "generating") {
      return c.json({ recovered: false, status: batch.status });
    }

    // Derive correct status from certificate rows
    const { results } = await c.env.DB.prepare(`
      SELECT status FROM certificates WHERE batch_id = ?
    `).bind(batchId).all<{ status: string }>();

    const doneCount = results.filter((c) => c.status === "generated" || c.status === "sent").length;
    const totalCount = results.length;

    const newStatus =
      doneCount === totalCount ? "generated"
      : doneCount > 0 ? "partial"
      : "draft";

    await c.env.DB.prepare(`UPDATE batches SET status = ? WHERE id = ?`).bind(newStatus, batchId).run();

    console.log(`[RECOVER-STUCK] Batch ${batchId}: generating -> ${newStatus} (${doneCount}/${totalCount} done)`);
    return c.json({ recovered: true, status: newStatus, doneCount, totalCount });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default router;
