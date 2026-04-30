import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import { getAuthClientForUser } from "../lib/googleAuth.js";
import { deleteFile } from "../lib/googleDrive.js";
import { r2UploadQueue } from "../queue/queues.js";

const router: IRouter = Router();

// ── GET /auth/google/access-token ──────────────────────────────────────────
// Returns a short-lived Google access token for the current user.
// The refresh token never leaves the server.
router.get("/auth/google/access-token", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const authClient = await getAuthClientForUser(userId);

    // Force a token refresh to get a fresh access token
    const tokenRes = await authClient.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) {
      return res.status(500).json({ error: "Could not obtain Google access token" });
    }

    // The token expires in ~3600s by default. Report the actual expiry if available.
    const credentials = authClient.credentials;
    const expiresAt = credentials.expiry_date ?? Date.now() + 3500 * 1000;

    return res.json({ accessToken, expiresAt });
  } catch (err: any) {
    if (err.code === "GOOGLE_NOT_CONNECTED") {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /batches/:batchId/client-generate ─────────────────────────────────
// Validates wallet, deducts payment, and returns all the data the client
// needs to process generation locally.
router.post("/batches/:batchId/client-generate", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const { selectedCertIds } = req.body || {};

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (batch.userId !== userId) return res.status(403).json({ error: "Access denied" });

    const { data: certsData } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("batch_id", batchId);
    const allCerts = (certsData || []).map(toCamel) as Certificate[];

    const targetCerts =
      selectedCertIds && Array.isArray(selectedCertIds) && selectedCertIds.length > 0
        // Explicit selection: respect exactly what was chosen
        ? allCerts.filter((c) => selectedCertIds.includes(c.id))
        // No selection = "generate/resume all remaining" — skip already done certs
        : allCerts.filter((c) => ["pending", "failed", "outdated"].includes(c.status));

    if (targetCerts.length === 0) {
      const hasSelection = selectedCertIds && Array.isArray(selectedCertIds) && selectedCertIds.length > 0;
      return res.status(400).json({
        error: hasSelection
          ? "None of the selected certificates need generation."
          : "All certificates have already been generated. Nothing left to resume.",
      });
    }

    const unpaidCerts = targetCerts.filter((c) => !c.isPaid);
    const visualRegenCerts = targetCerts.filter(
      (c) => c.isPaid && c.status === "outdated" && c.requiresVisualRegen
    );

    const unpaidCount = unpaidCerts.length;
    const visualRegenCount = visualRegenCerts.length;

    const RATE = Number(process.env.VITE_CERT_GENERATION_RATE || 1);
    const REGEN_RATE = Number(process.env.VITE_CERT_REGENERATION_RATE || 0.2);
    const cost = unpaidCount * RATE + visualRegenCount * REGEN_RATE;

    const ledgerId = `gen_${batchId}_${Date.now()}`;
    const unpaidCertIds = unpaidCerts.map((c) => c.id);

    // Atomic wallet deduction + batch status update
    const { error: rpcErr } = await supabaseAdmin.rpc("start_batch_generation", {
      p_user_id: userId,
      p_batch_id: batchId,
      p_cost: cost,
      p_unpaid_cert_ids: unpaidCertIds,
      p_ledger_id: ledgerId,
      p_batch_name: batch.name,
      p_unpaid_count: unpaidCount,
      p_regen_count: visualRegenCount,
      p_rate: RATE,
      p_regen_rate: REGEN_RATE,
    });

    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("already_generating"))
        return res.status(409).json({ error: "Batch is already generating" });
      if (msg.includes("currently_sending"))
        return res.status(409).json({ error: "Batch is currently being sent" });
      if (msg.includes("insufficient_funds")) {
        const parts = msg.split(":");
        const detail = parts[1] || msg;
        return res.status(402).json({ error: `Insufficient funds: ${detail}` });
      }
      throw rpcErr;
    }

    const baseUrl = (
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`
    ).replace(/\/$/, "");

    // Return everything the client needs to process locally
    return res.json({
      success: true,
      batch: {
        id: batch.id,
        name: batch.name,
        templateId: batch.templateId,
        columnMap: batch.columnMap,
        driveFolderId: batch.driveFolderId,
        pdfFolderId: batch.pdfFolderId,
        categoryColumn: batch.categoryColumn,
        categoryTemplateMap: batch.categoryTemplateMap,
        categorySlideMap: batch.categorySlideMap,
      },
      certificates: targetCerts.map((c) => ({
        id: c.id,
        recipientName: c.recipientName,
        recipientEmail: c.recipientEmail,
        status: c.status,
        rowData: c.rowData,
        slideFileId: c.slideFileId,
        requiresVisualRegen: (c as any).requiresVisualRegen,
        r2PdfUrl: (c as any).r2PdfUrl,
      })),
      baseUrl,
    });
  } catch (err: any) {
    console.error("[CLIENT-GENERATE] Initial request failed:", err);
    try {
      await supabaseAdmin.from("batches").update({ status: "draft" }).eq("id", batchId);
    } catch {}
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ── POST /batches/:batchId/client-report ───────────────────────────────────
// Client reports per-cert completion. Server updates DB immediately and
// queues the R2 upload to a background worker so the API stays fast.
router.post("/batches/:batchId/client-report", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const {
    certId,
    recipientName,
    recipientEmail,
    pdfBase64,
    drivePdfFileId,
    drivePdfUrl,
    driveSlideFileId,
    driveSlideUrl,
    rowData,
    batchName,
  } = req.body;

  if (!certId) return res.status(400).json({ error: "certId is required" });

  try {
    // Verify batch ownership
    const { data: batchRow } = await supabaseAdmin
      .from("batches")
      .select("user_id")
      .eq("id", batchId)
      .single();
    if (!batchRow || batchRow.user_id !== userId)
      return res.status(403).json({ error: "Access denied" });

    // Mark cert as generated immediately (DB write is fast)
    const updateData: Record<string, any> = {
      status: "generated",
      error_message: null,
      updated_at: new Date().toISOString(),
      requires_visual_regen: false,
    };
    // Drive info if provided (usually null from client-side gen)
    if (drivePdfFileId) updateData.pdf_file_id = drivePdfFileId;
    if (drivePdfUrl) updateData.pdf_url = drivePdfUrl;
    if (driveSlideFileId) updateData.slide_file_id = driveSlideFileId;
    if (driveSlideUrl) updateData.slide_url = driveSlideUrl;

    await supabaseAdmin.from("certificates").update(updateData).eq("id", certId);

    // Increment generated count
    await supabaseAdmin.rpc("increment_batch_column", {
      p_batch_id: batchId,
      p_column: "generated_count",
      p_amount: 1,
    });

    // Queue R2 upload + student profile upsert to background worker
    if (pdfBase64) {
      await r2UploadQueue.add("r2-upload", {
        certId,
        batchId,
        recipientName: recipientName || "cert",
        recipientEmail: recipientEmail || "",
        batchName: batchName || "batch",
        pdfBase64,
        rowData: rowData || {},
        drivePdfFileId: drivePdfFileId || null,
        drivePdfUrl: drivePdfUrl || null,
        driveSlideFileId: driveSlideFileId || null,
        driveSlideUrl: driveSlideUrl || null,
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    // Mark cert as failed
    await supabaseAdmin
      .from("certificates")
      .update({ status: "failed", error_message: err.message })
      .eq("id", certId);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /batches/:batchId/client-complete ──────────────────────────────────
// Client signals that generation is complete (or partially complete).
// `cancelled` flag distinguishes a user-aborted run from a true full completion.
router.post("/batches/:batchId/client-complete", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const { generated = 0, failed = 0, cancelled = false } = req.body;

  try {
    const { data: batchRow } = await supabaseAdmin
      .from("batches")
      .select("user_id, total_count")
      .eq("id", batchId)
      .single();
    if (!batchRow || batchRow.user_id !== userId)
      return res.status(403).json({ error: "Access denied" });

    let newStatus: string;
    if (cancelled) {
      // Aborted by user or unexpected error — never claim fully generated
      newStatus = generated > 0 ? "partial" : "draft";
    } else {
      // Normal completion path
      newStatus = failed === 0 ? "generated" : generated > 0 ? "partial" : "draft";
    }

    await supabaseAdmin.from("batches").update({ status: newStatus }).eq("id", batchId);

    return res.json({ success: true, status: newStatus });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /batches/:batchId/client-cleanup ───────────────────────────────────
// Called by navigator.sendBeacon or explicit cleanup to delete orphaned
// temp presentations from the user's Google Drive.
router.post("/batches/:batchId/client-cleanup", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { tempFileIds } = req.body;
  if (!tempFileIds || !Array.isArray(tempFileIds)) {
    return res.json({ success: true }); // Nothing to clean
  }

  try {
    await Promise.all(
      tempFileIds.map((fileId: string) =>
        deleteFile(userId, fileId).catch((e: any) =>
          console.error("[CLIENT-CLEANUP] Drive delete failed:", fileId, e.message)
        )
      )
    );
    return res.json({ success: true, cleaned: tempFileIds.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /batches/:batchId/recover-stuck ────────────────────────────────────
// Called by the client on page load when it detects status="generating" but
// no local generation is actually running (tab was force-closed / device off).
// Derives the correct status from cert rows — no timestamps needed.
router.post("/batches/:batchId/recover-stuck", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batchRow } = await supabaseAdmin
      .from("batches")
      .select("user_id, status")
      .eq("id", batchId)
      .single();

    if (!batchRow || batchRow.user_id !== userId)
      return res.status(403).json({ error: "Access denied" });

    // Only act on stuck batches — if it's already resolved, return current state
    if (batchRow.status !== "generating") {
      return res.json({ recovered: false, status: batchRow.status });
    }

    // Derive the true status from the cert rows (source of truth)
    const { data: certs } = await supabaseAdmin
      .from("certificates")
      .select("status")
      .eq("batch_id", batchId);

    const statuses = (certs || []).map((c: any) => c.status as string);
    const doneCount = statuses.filter((s) => s === "generated" || s === "sent").length;
    const totalCount = statuses.length;

    const newStatus =
      doneCount === totalCount ? "generated"
      : doneCount > 0         ? "partial"
      :                         "draft";

    await supabaseAdmin.from("batches").update({ status: newStatus }).eq("id", batchId);

    console.log(`[RECOVER-STUCK] Batch ${batchId}: generating → ${newStatus} (${doneCount}/${totalCount} done)`);
    return res.json({ recovered: true, status: newStatus, doneCount, totalCount });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
