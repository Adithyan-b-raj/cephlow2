import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel, type Certificate } from "@workspace/supabase";
import { getSheetsClient } from "../lib/googleSheets.js";
import { createFolder, makeFilePublic, generateCertificate, uploadPdf } from "../lib/googleDrive.js";
import { handleGoogleError } from "../lib/googleAuth.js";
import { deleteR2Objects, isR2Configured, uploadBufferToR2, getR2PublicUrl } from "../lib/cloudflareR2.js";
import { isWhatsAppConfigured, sendWhatsAppDocument } from "../lib/whatsapp.js";
import { extractPhoneNumber, bulkUpsertStudentProfiles, emailToSlug } from "../lib/certUtils.js";
import { isApprovedInContext, isUserApproved } from "../lib/approval.js";
import { requireApproval } from "../middlewares/requireApproval.js";
import { isAdminOrOwner } from "../middlewares/requireWorkspace.js";
import type { Request } from "express";

const router: IRouter = Router();

function canAccessBatch(batch: { workspace_id: string; user_id: string }, req: Request): boolean {
  if (!req.workspace || batch.workspace_id !== req.workspace.id) return false;
  return isAdminOrOwner(req.workspace.role) || batch.user_id === req.user!.uid;
}

// List all batches
router.get("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { id: workspaceId, role } = req.workspace!;

    let query = supabaseAdmin
      .from("batches")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (!isAdminOrOwner(role)) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    const batches = (data || []).map(toCamel);
    return res.json({ batches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Create a new batch
router.post("/batches", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      name, sheetId, sheetName, tabName,
      spreadsheetId: inbuiltSpreadsheetId, dataSourceKind,
      templateId, templateName,
      templateKind,
      columnMap, emailColumn, nameColumn, emailSubject, emailBody,
      categoryColumn, categoryTemplateMap, categorySlideMap, categorySlideIndexes,
      bannerUrl, frameTier,
    } = req.body;

    const isInbuilt = dataSourceKind === "inbuilt";
    let headers: string[];
    let dataRows: Record<string, string>[];
    let inbuiltSpreadsheetName = "";

    if (isInbuilt) {
      const { data: spreadsheet, error: ssErr } = await supabaseAdmin
        .from("spreadsheets")
        .select("name, columns, rows")
        .eq("id", inbuiltSpreadsheetId)
        .eq("workspace_id", req.workspace!.id)
        .single();
      if (ssErr || !spreadsheet) return res.status(400).json({ error: "Spreadsheet not found" });
      inbuiltSpreadsheetName = (spreadsheet as any).name ?? "";
      const rawCols = spreadsheet.columns as string[];
      const rawRows = spreadsheet.rows as Record<string, string>[];
      // Mirror the frontend: treat first row as headers if it has values
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
    } else {
      const sheets = await getSheetsClient(userId);
      const range = tabName ? tabName : "A:ZZ";
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
      const rawRows = response.data.values || [];
      headers = rawRows[0] as string[];
      dataRows = rawRows.slice(1).filter((r) => r.length > 0).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (row[i] as string) || ""; });
        return obj;
      });
    }

    const approved = await isApprovedInContext(userId, req.workspace?.id);

    // Free tier (unapproved): force builtin templates only.
    let kind = templateKind === "builtin" ? "builtin" : "slides";
    if (!approved && kind === "slides") {
      return res.status(403).json({
        error: "Google Slides templates are restricted to approved organizations. Use the builtin editor instead.",
        code: "APPROVAL_REQUIRED",
      });
    }

    // Drive folder: always for slides; also for builtin when user is unapproved
    // (free tier stores PDFs in their Google Drive instead of R2).
    let driveFolderId: string | null = null;
    let pdfFolderId: string | null = null;
    if (kind === "slides" || !approved) {
      try {
        driveFolderId = await createFolder(userId, name);
        if (driveFolderId) {
          pdfFolderId = await createFolder(userId, "pdf", driveFolderId);
        }
      } catch (err) {
        console.error("Failed to create Google Drive folders:", err);
      }
    }

    const { data: batchRow, error: batchErr } = await supabaseAdmin
      .from("batches")
      .insert({
        user_id: userId,
        workspace_id: req.workspace!.id,
        name,
        sheet_id: isInbuilt ? "" : sheetId,
        sheet_name: isInbuilt ? inbuiltSpreadsheetName : sheetName,
        tab_name: isInbuilt ? null : (tabName || null),
        spreadsheet_id: isInbuilt ? inbuiltSpreadsheetId : null,
        data_source_kind: isInbuilt ? "inbuilt" : "google",
        template_id: templateId,
        template_name: templateName,
        template_kind: kind,
        column_map: columnMap,
        email_column: emailColumn,
        name_column: nameColumn,
        email_subject: emailSubject || null,
        email_body: emailBody || null,
        category_column: categoryColumn || null,
        category_template_map: categoryTemplateMap || null,
        category_slide_map: categorySlideMap || null,
        category_slide_indexes: categorySlideIndexes || null,
        banner_url: bannerUrl || null,
        frame_tier: frameTier || 'none',
        status: "draft",
        drive_folder_id: driveFolderId,
        pdf_folder_id: pdfFolderId,
        total_count: dataRows.length,
        generated_count: 0,
        sent_count: 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchErr) throw batchErr;
    const batchId = batchRow.id;

    const certRows = dataRows.map((rowData) => {
      return {
        batch_id: batchId,
        recipient_name: rowData[nameColumn] || "Unknown",
        recipient_email: rowData[emailColumn] || "",
        status: "pending",
        row_data: rowData,
        slide_file_id: null,
        slide_url: null,
        sent_at: null,
        error_message: null,
        is_paid: false,
        created_at: new Date().toISOString(),
      };
    });

    if (certRows.length > 0) {
      const { error: certErr } = await supabaseAdmin.from("certificates").insert(certRows);
      if (certErr) throw certErr;
    }

    return res.status(201).json(toCamel(batchRow));
  } catch (err: any) {
    console.error("[POST /batches] error:", err?.message ?? err);
    const uid = req.user?.uid;
    if (uid) {
      try { await handleGoogleError(uid, err); } catch (mapped: any) {
        return res.status(mapped.status ?? 500).json({ error: mapped.message, code: mapped.code });
      }
    }
    return res.status(500).json({ error: err.message });
  }
});

// Get batch detail with certificates
router.get("/batches/:batchId", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { batchId } = req.params;
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("*, certificates(*)")
      .eq("id", batchId)
      .single();

    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    const result = toCamel(batch);
    result.certificates = (batch.certificates || []).map(toCamel);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Upload a banner image for a batch
router.post("/batches/:batchId/banner", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const mimeType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
  if (!mimeType.startsWith("image/")) {
    return res.status(400).json({ error: "Content-Type must be an image" });
  }
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/gif" ? "gif" : "jpg";

  try {
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("user_id, workspace_id")
      .eq("id", batchId)
      .single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    if (!isR2Configured()) {
      return res.status(422).json({ error: "Image storage is not configured on this server" });
    }

    // Collect raw body chunks manually — avoids express.raw() which can be
    // unreliable in Express 5 when body-parser json is already mounted globally.
    const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    if (imageBuffer.length === 0) return res.status(400).json({ error: "Empty body" });
    if (imageBuffer.length > 1 * 1024 * 1024) return res.status(413).json({ error: "Image must be under 1 MB" });

    const key = await uploadBufferToR2(`banners/${batchId}/banner.${ext}`, imageBuffer, mimeType);
    const url = getR2PublicUrl(key);
    if (!url) return res.status(500).json({ error: "R2 public URL not configured" });

    await supabaseAdmin.from("batches").update({ banner_url: url }).eq("id", batchId);
    return res.json({ bannerUrl: url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Frame tier costs loaded from env vars (₹ per batch, one-time charge on first use)
function getFrameCosts(): Record<string, number> {
  const e = process.env;
  return {
    bronze:            Number(e.FRAME_COST_BRONZE            ?? 2),
    silver:            Number(e.FRAME_COST_SILVER            ?? 5),
    gold:              Number(e.FRAME_COST_GOLD              ?? 10),
    cyberpunk:         Number(e.FRAME_COST_CYBERPUNK         ?? 15),
    fire:              Number(e.FRAME_COST_FIRE              ?? 15),
    ice:               Number(e.FRAME_COST_ICE               ?? 15),
    matrix:            Number(e.FRAME_COST_MATRIX            ?? 15),
    holographic:       Number(e.FRAME_COST_HOLOGRAPHIC       ?? 20),
    "neon-pulse":      Number(e.FRAME_COST_NEON_PULSE        ?? 20),
    "hud-grid-blue":   Number(e.FRAME_COST_HUD_GRID_BLUE    ?? 20),
    "hud-grid-purple": Number(e.FRAME_COST_HUD_GRID_PURPLE  ?? 20),
    "hud-grid-gold":   Number(e.FRAME_COST_HUD_GRID_GOLD    ?? 20),
    "hud-command-blue":Number(e.FRAME_COST_HUD_COMMAND_BLUE ?? 20),
    "hud-command-gold":Number(e.FRAME_COST_HUD_COMMAND_GOLD ?? 20),
    // custom: cost key for any workspace-designed frame (value: custom:{uuid})
    custom:            Number(e.FRAME_COST_CUSTOM            ?? 20),
  };
}

// Resolve the cost-map key for a frame tier string.
// Returns null for marketplace: tiers — cost is handled at purchase time, not here.
function frameCostKey(tier: string): string | null {
  if (tier.startsWith("marketplace:")) return null;
  if (tier.startsWith("custom:")) return "custom";
  return tier;
}

// Return frame costs so the frontend can show pricing
router.get("/frame-costs", (_req, res) => {
  return res.json(getFrameCosts());
});

// Update banner appearance settings (POST avoids PATCH being blocked by some proxies/CDNs)
router.post("/batches/:batchId/banner-settings", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const { bannerOverlayOpacity, bannerTextColor, bannerCropZoom, bannerCropX, bannerCropY, frameTier } = req.body;

  try {
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("user_id, workspace_id, frame_tier, paid_frames")
      .eq("id", batchId)
      .single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    const paidFrames: string[] = batch.paid_frames ?? [];

    // If it's a custom frame, verify it exists in this workspace
    if (frameTier !== undefined && typeof frameTier === 'string' && frameTier.startsWith('custom:')) {
      const customId = frameTier.slice(7);
      const { data: cf, error: cfErr } = await supabaseAdmin
        .from("custom_frames")
        .select("id")
        .eq("id", customId)
        .eq("workspace_id", batch.workspace_id)
        .maybeSingle();
      if (cfErr || !cf) return res.status(404).json({ error: "Custom frame not found in this workspace" });
    }

    // Marketplace frames: verify the workspace has already purchased the listing
    if (frameTier !== undefined && typeof frameTier === 'string' && frameTier.startsWith('marketplace:')) {
      const listingId = frameTier.slice(12);
      const { data: listing, error: listErr } = await supabaseAdmin
        .from("frame_listings")
        .select("id, is_active, price")
        .eq("id", listingId)
        .maybeSingle();
      if (listErr || !listing) return res.status(404).json({ error: "Marketplace frame listing not found" });
      if (!listing.is_active) return res.status(410).json({ error: "This marketplace frame has been unpublished" });

      const { data: purchase } = await supabaseAdmin
        .from("frame_purchases")
        .select("id")
        .eq("listing_id", listingId)
        .eq("workspace_id", batch.workspace_id)
        .maybeSingle();
      if (!purchase) {
        return res.status(402).json({
          error: "Marketplace frame not purchased",
          code: "marketplace_frame_not_purchased",
          listingId,
          required: listing.price,
        });
      }
      // No charge — purchase was handled by POST /marketplace/listings/:id/purchase
    }

    // Charge only if this specific frame has never been purchased for this batch
    // (skip for marketplace: tiers which are tracked in frame_purchases, not paid_frames)
    const costKey = frameCostKey(frameTier ?? '');
    if (frameTier !== undefined && frameTier !== 'none' && costKey !== null && !paidFrames.includes(frameTier)) {
      const costs = getFrameCosts();
      const cost = costs[costKey] ?? 0;
      if (cost > 0) {
        const workspaceId = batch.workspace_id;
        const { data: ws, error: wsErr } = await supabaseAdmin
          .from("workspaces")
          .select("current_balance")
          .eq("id", workspaceId)
          .single();
        if (wsErr || !ws) return res.status(500).json({ error: "Could not read workspace balance" });

        const currentBalance = Number(ws.current_balance ?? 0);
        if (currentBalance < cost) {
          return res.status(402).json({
            error: "Insufficient balance",
            code: "insufficient_funds",
            required: cost,
            available: currentBalance,
          });
        }

        const newBalance = currentBalance - cost;
        await supabaseAdmin.from("workspaces").update({ current_balance: newBalance }).eq("id", workspaceId);
        await supabaseAdmin.from("ledgers").insert({
          user_id: userId,
          workspace_id: workspaceId,
          type: "deduction",
          amount: -cost,
          balance_after: newBalance,
          description: `Certificate frame: ${frameTier}`,
          metadata: { batchId, frameTier, cost },
        });
        // Mark this frame as purchased so re-selecting it later is free
        await supabaseAdmin
          .from("batches")
          .update({ paid_frames: [...paidFrames, frameTier] })
          .eq("id", batchId);
      }
    }

    const updatePayload: Record<string, any> = {
      banner_overlay_opacity: bannerOverlayOpacity,
      banner_text_color: bannerTextColor,
      banner_crop_zoom: bannerCropZoom,
      banner_crop_x: bannerCropX,
      banner_crop_y: bannerCropY,
    };
    if (frameTier !== undefined) updatePayload.frame_tier = frameTier;
    await supabaseAdmin.from("batches").update(updatePayload).eq("id", batchId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Share the PDF folder (make it public).
// For paid/approved users whose PDFs live in R2 (no pdf_folder_id), this
// creates a Drive folder on-demand, uploads all generated PDFs, saves the
// folder ID, then makes it public — so subsequent shares skip the upload.
router.post("/batches/:batchId/share-folder", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  try {
    const { data: batch, error } = await supabaseAdmin
      .from("batches")
      .select("user_id, workspace_id, pdf_folder_id, name")
      .eq("id", batchId)
      .single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    // Fast path: folder already exists — just re-share it.
    if (batch.pdf_folder_id) {
      await makeFilePublic(userId, batch.pdf_folder_id);
      return res.json({ success: true, shareLink: `https://drive.google.com/drive/folders/${batch.pdf_folder_id}` });
    }

    // Slow path: R2-only batch — upload all generated PDFs to Drive first.
    const { data: certs } = await supabaseAdmin
      .from("certificates")
      .select("id, recipient_name, r2_pdf_url")
      .eq("batch_id", batchId)
      .in("status", ["generated", "sent"])
      .not("r2_pdf_url", "is", null);

    if (!certs || certs.length === 0) {
      return res.status(400).json({ error: "No generated certificates to share" });
    }

    const folderId = await createFolder(userId, batch.name || batchId);
    await makeFilePublic(userId, folderId);

    // Upload each PDF from R2 to the Drive folder (in parallel, capped at 5)
    const CONCURRENCY = 5;
    for (let i = 0; i < certs.length; i += CONCURRENCY) {
      await Promise.all(
        certs.slice(i, i + CONCURRENCY).map(async (cert) => {
          const r2Res = await fetch(cert.r2_pdf_url!);
          if (!r2Res.ok) throw new Error(`Failed to fetch PDF for cert ${cert.id}`);
          const buffer = Buffer.from(await r2Res.arrayBuffer());
          await uploadPdf(userId, cert.recipient_name || cert.id, buffer, folderId);
        })
      );
    }

    // Persist the folder ID so subsequent shares are instant.
    await supabaseAdmin
      .from("batches")
      .update({ pdf_folder_id: folderId })
      .eq("id", batchId);

    return res.json({ success: true, shareLink: `https://drive.google.com/drive/folders/${folderId}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Sync data from the Google Sheet into the existing batch
router.post("/batches/:batchId/sync", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    let headers: string[];
    let dataRows: Record<string, string>[];

    if (batch.data_source_kind === "inbuilt") {
      const { data: spreadsheet, error: ssErr } = await supabaseAdmin
        .from("spreadsheets")
        .select("columns, rows")
        .eq("id", batch.spreadsheet_id)
        .single();
      if (ssErr || !spreadsheet) return res.status(400).json({ error: "Inbuilt spreadsheet not found" });
      const rawCols = spreadsheet.columns as string[];
      const rawRows = spreadsheet.rows as Record<string, string>[];
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
      if (dataRows.length === 0) return res.status(400).json({ error: "Spreadsheet is empty." });
    } else {
      const sheets = await getSheetsClient(userId);
      const range = batch.tab_name ? batch.tab_name : "A:ZZ";
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: batch.sheet_id, range });
      const rawRows = response.data.values || [];
      if (rawRows.length === 0) return res.status(400).json({ error: "Spreadsheet is empty." });
      headers = rawRows[0] as string[];
      dataRows = rawRows.slice(1).filter((r: any[]) => r.length > 0).map((row: any[]) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (row[i] as string) || ""; });
        return obj;
      });
    }
    const { name_column: nameColumn, email_column: emailColumn } = batch;

    const { data: certsData } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("batch_id", batchId);
    const existingCerts = (certsData || []).map(toCamel) as Certificate[];

    // Build lookup maps for O(1) matching instead of O(n) findIndex per row
    const byEmailAndName = new Map<string, Certificate>();
    const byEmail = new Map<string, Certificate>();
    const byName = new Map<string, Certificate>();
    for (const c of existingCerts) {
      if (c.recipientEmail && c.recipientName) byEmailAndName.set(`${c.recipientEmail}__${c.recipientName}`, c);
      if (c.recipientEmail) byEmail.set(c.recipientEmail, c);
      if (c.recipientName) byName.set(c.recipientName, c);
    }
    const matched = new Set<string>(); // track used cert IDs to avoid double-matching

    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; data: any }> = [];
    const visualFields = Object.values(batch.column_map || {}) as string[];
    const now = new Date().toISOString();

    for (const rowData of dataRows) {

      const email = rowData[emailColumn] || "";
      const name = rowData[nameColumn] || "Unknown";

      let matchingCert: Certificate | undefined;
      const exactKey = `${email}__${name}`;
      if (email && name && byEmailAndName.has(exactKey) && !matched.has(byEmailAndName.get(exactKey)!.id)) {
        matchingCert = byEmailAndName.get(exactKey);
      } else if (email && byEmail.has(email) && !matched.has(byEmail.get(email)!.id)) {
        matchingCert = byEmail.get(email);
      } else if (name !== "Unknown" && byName.has(name) && !matched.has(byName.get(name)!.id)) {
        matchingCert = byName.get(name);
      }

      if (matchingCert) {
        matched.add(matchingCert.id);
        const hasVisualChanged = matchingCert.recipientName !== name ||
          visualFields.some(col => matchingCert!.rowData?.[col] !== rowData[col]);
        const hasMetadataChanged = !hasVisualChanged && JSON.stringify(matchingCert.rowData) !== JSON.stringify(rowData);

        const updateData: any = { recipient_name: name, recipient_email: email, row_data: rowData, updated_at: now };
        if (hasVisualChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = true;
        } else if (hasMetadataChanged && ["generated", "sent", "outdated"].includes(matchingCert.status)) {
          updateData.status = "outdated";
          updateData.requires_visual_regen = false;
        }
        toUpdate.push({ id: matchingCert.id, data: updateData });
      } else {
        toInsert.push({
          batch_id: batchId, recipient_name: name, recipient_email: email,
          status: "pending", row_data: rowData, slide_file_id: null, slide_url: null,
          sent_at: null, error_message: null, is_paid: false, created_at: now, updated_at: now,
        });
      }
    }

    // Batch insert new certs in one query
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin.from("certificates").insert(toInsert);
      if (insertErr) throw insertErr;
    }

    // Batch updates: group by identical update shape to minimise round-trips
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      await Promise.all(
        toUpdate.slice(i, i + CHUNK).map(({ id, data }) =>
          supabaseAdmin.from("certificates").update(data).eq("id", id)
        )
      );
    }

    const newCount = toInsert.length;
    if (newCount > 0) {
      await supabaseAdmin
        .from("batches")
        .update({ total_count: existingCerts.length + newCount })
        .eq("id", batchId);
    }

    return res.json({ success: true, message: `Synced successfully. Added ${newCount} new certificates.`, newCount });
  } catch (err: any) {
    console.error("[SYNC] failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Send certificates via Gmail
router.post("/batches/:batchId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batchRow, error } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (error || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (!canAccessBatch(batchRow, req)) return res.status(403).json({ error: "Access denied" });

    const { emailSubject: reqSubject, emailBody: reqBody } = req.body;
    const subject = reqSubject || batch.emailSubject || "Your Certificate";
    const body = reqBody || batch.emailBody || "Please find your certificate attached.";

    await supabaseAdmin
      .from("batches")
      .update({ status: "sending", email_subject: subject, email_body: body })
      .eq("id", batchId);

    const { data: taskData } = await supabaseAdmin.from("tasks").insert({
      batch_id: batchId,
      type: "send_email",
      payload: { batchId, userId, subject, body }
    }).select("id").single();
    
    return res.json({ success: true, message: "Send queued", jobId: taskData?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Send certificates via WhatsApp
router.post("/batches/:batchId/send-whatsapp", requireApproval, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({ error: "WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN." });
  }

  const { batchId } = req.params;

  try {
    const { data: batchRow, error } = await supabaseAdmin
      .from("batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (error || !batchRow) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batchRow, req)) return res.status(403).json({ error: "Access denied" });

    const { var1Template, var2Template, var3Template } = req.body;
    await supabaseAdmin.from("batches").update({ status: "sending" }).eq("id", batchId);

    const { data: taskData } = await supabaseAdmin.from("tasks").insert({
      batch_id: batchId,
      type: "send_whatsapp",
      payload: { batchId, userId, var1Template, var2Template, var3Template }
    }).select("id").single();
    
    return res.json({ success: true, message: "WhatsApp send queued", jobId: taskData?.id });
  } catch (err: any) {
    await supabaseAdmin.from("batches").update({ status: "generated" }).eq("id", batchId);
    return res.status(500).json({ error: err.message });
  }
});

// Send a single certificate via email (queued to background worker)
router.post("/batches/:batchId/certificates/:certId/send", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId, certId } = req.params;

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin.from("batches").select("user_id, workspace_id").eq("id", batchId).single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batchRow, req)) return res.status(403).json({ error: "Access denied" });

    const { data: certRow, error: certErr } = await supabaseAdmin.from("certificates").select("recipient_email, status, r2_pdf_url, slide_file_id").eq("id", certId).single();
    if (certErr || !certRow) return res.status(404).json({ error: "Certificate not found" });

    if (!certRow.recipient_email) return res.status(400).json({ error: "Certificate has no email address" });
    if (!certRow.r2_pdf_url && !certRow.slide_file_id) return res.status(400).json({ error: "Certificate has not been generated yet" });

    const { emailSubject: reqSubject, emailBody: reqBody } = req.body;

    const { data: batchFull } = await supabaseAdmin.from("batches").select("email_subject, email_body").eq("id", batchId).single();
    const subject = reqSubject || batchFull?.email_subject || "Your Certificate";
    const body = reqBody || batchFull?.email_body || "Please find your certificate attached.";

    // Queue to worker via tasks table
    await supabaseAdmin.from("tasks").insert({
      batch_id: batchId,
      certificate_id: certId,
      type: "send_email",
      payload: {
        batchId,
        userId,
        subject,
        body,
        certId,
      }
    });

    return res.json({ success: true, message: "Email send queued" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Lazily create an editable Google Slides file for a single cert (on-demand "Open in Slides")
router.post("/batches/:batchId/certificates/:certId/open-slide", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId, certId } = req.params;

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin.from("batches").select("*").eq("id", batchId).single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (!canAccessBatch(batchRow, req)) return res.status(403).json({ error: "Access denied" });

    const { data: certRow, error: certErr } = await supabaseAdmin.from("certificates").select("*").eq("id", certId).single();
    if (certErr || !certRow) return res.status(404).json({ error: "Certificate not found" });
    const cert = toCamel(certRow) as any;

    if (cert.slideUrl && cert.slideFileId) {
      return res.json({ slideFileId: cert.slideFileId, slideUrl: cert.slideUrl });
    }

    // Resolve template + slideIndex the same way the processor does
    const rowData = (cert.rowData as Record<string, string>) || {};
    let templateId: string = batch.templateId;
    let slideIndex: number | null = null;
    if (batch.categoryColumn && batch.categorySlideMap) {
      const val = rowData[batch.categoryColumn] || "";
      if (val && val in batch.categorySlideMap) slideIndex = batch.categorySlideMap[val];
      else if ("_default" in batch.categorySlideMap) slideIndex = batch.categorySlideMap["_default"];
      else slideIndex = 0;
    } else if (batch.categoryColumn && batch.categoryTemplateMap) {
      const val = rowData[batch.categoryColumn];
      if (val && batch.categoryTemplateMap[val]) templateId = batch.categoryTemplateMap[val].templateId;
    }

    const replacements: Record<string, string> = {};
    for (const [placeholder, column] of Object.entries(batch.columnMap || {})) {
      replacements[placeholder] = rowData[String(column)] || "";
    }

    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = process.env.PUBLIC_BASE_URL || `${protocol}://${host}`;
    const qrCodeUrl = `${baseUrl}/verify/${batchId}/${certId}`;

    const slideRes = await generateCertificate(
      userId,
      templateId,
      cert.recipientName,
      replacements,
      batch.driveFolderId ?? null,
      qrCodeUrl,
      slideIndex,
    );

    await supabaseAdmin.from("certificates").update({
      slide_file_id: slideRes.fileId,
      slide_url: slideRes.url,
      updated_at: new Date().toISOString(),
    }).eq("id", certId);

    return res.json({ slideFileId: slideRes.fileId, slideUrl: slideRes.url });
  } catch (err: any) {
    console.error("[OPEN-SLIDE] failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Send a single certificate via WhatsApp
router.post("/batches/:batchId/certificates/:certId/send-whatsapp", requireApproval, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({ error: "WhatsApp is not configured." });
  }

  const { batchId, certId } = req.params;

  try {
    const { data: batchRow, error: batchErr } = await supabaseAdmin.from("batches").select("*").eq("id", batchId).single();
    if (batchErr || !batchRow) return res.status(404).json({ error: "Batch not found" });
    const batch = toCamel(batchRow) as any;
    if (!canAccessBatch(batchRow, req)) return res.status(403).json({ error: "Access denied" });

    const { data: certRow, error: certErr } = await supabaseAdmin.from("certificates").select("*").eq("id", certId).single();
    if (certErr || !certRow) return res.status(404).json({ error: "Certificate not found" });
    const cert = toCamel(certRow) as any;

    if (!cert.r2PdfUrl) return res.status(400).json({ error: "No R2 PDF URL for this certificate" });

    const rowData = (cert.rowData as Record<string, string>) || {};
    const { var1Template, var2Template, var3Template } = req.body;
    const phone = extractPhoneNumber(rowData);
    if (!phone) return res.status(400).json({ error: "No phone number found for this certificate" });

    let var1 = var1Template || cert.recipientName;
    let var2 = var2Template || batch.name;
    const emailPrefix = emailToSlug(cert.recipientEmail || cert.recipientName);
    let var3 = var3Template || emailPrefix;
    for (const [col, value] of Object.entries(rowData)) {
      var1 = var1.replace(new RegExp(`<<${col}>>`, "gi"), value);
      var2 = var2.replace(new RegExp(`<<${col}>>`, "gi"), value);
      var3 = var3.replace(new RegExp(`<<${col}>>`, "gi"), value);
    }
    var3 = var3.replace(/<<EmailPrefix>>/gi, emailPrefix);

    const safePdfName = (cert.recipientName || "cert").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "cert";
    const safePdfBatch = (batch.name || "batch").trim().replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "batch";
    const pdfFilename = `${safePdfName}_${safePdfBatch}.pdf`;

    const r2Base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";
    const certKey = r2Base && cert.r2PdfUrl?.startsWith(r2Base)
      ? decodeURIComponent(cert.r2PdfUrl.slice(r2Base.length + 1))
      : undefined;

    const wamid = await sendWhatsAppDocument(phone, cert.r2PdfUrl, pdfFilename, var1, var2, var3, certKey);
    await supabaseAdmin.from("certificates").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      whatsapp_message_id: wamid || null,
      whatsapp_status: "sent",
    }).eq("id", certId);

    if (wamid) {
      await supabaseAdmin.from("wa_messages").insert({ wamid, batch_id: batchId, cert_id: certId });
    }

    const { data: allCerts } = await supabaseAdmin.from("certificates").select("status").eq("batch_id", batchId);
    const sentCount = (allCerts || []).filter((c: { status: string }) => c.status === "sent").length;
    const { data: batchData } = await supabaseAdmin.from("batches").select("whatsapp_sent_count").eq("id", batchId).single();
    await supabaseAdmin.from("batches").update({
      sent_count: sentCount,
      whatsapp_sent_count: ((batchData as any)?.whatsapp_sent_count || 0) + 1,
    }).eq("id", batchId);

    return res.json({ success: true, message: `WhatsApp sent to ${phone}` });
  } catch (err: any) {
    await supabaseAdmin.from("certificates").update({ status: "failed", error_message: err.message }).eq("id", certId);
    return res.status(500).json({ error: err.message });
  }
});

// Update a batch configuration
router.patch("/batches/:batchId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;
  const updateData = req.body;

  try {
    const { data: batch, error } = await supabaseAdmin.from("batches").select("user_id, workspace_id").eq("id", batchId).single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

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

    const finalUpdate: Record<string, any> = {};
    for (const [camel, snake] of Object.entries(fieldMap)) {
      if (updateData[camel] !== undefined) {
        finalUpdate[snake] = updateData[camel];
      }
    }

    if (Object.keys(finalUpdate).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await supabaseAdmin.from("batches").update(finalUpdate).eq("id", batchId);
    return res.json({ success: true, updatedFields: Object.keys(finalUpdate) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete a batch and all its certificates
router.delete("/batches/:batchId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batch, error } = await supabaseAdmin.from("batches").select("user_id, workspace_id").eq("id", batchId).single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    const { data: certsData } = await supabaseAdmin.from("certificates").select("id, r2_pdf_url, recipient_email").eq("batch_id", batchId);
    const certs = certsData || [];

    // Clean up R2 objects
    if (isR2Configured()) {
      const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      const r2Keys: string[] = [];
      for (const cert of certs) {
        if (cert.r2_pdf_url && r2PublicBase && cert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
          r2Keys.push(cert.r2_pdf_url.slice(r2PublicBase.length + 1));
        }
      }
      if (r2Keys.length > 0) {
        try { await deleteR2Objects(r2Keys); }
        catch (r2Err) { console.error("[R2] Failed to delete objects:", r2Err); }
      }
    }

    // Clean up student profile certs and orphaned profiles
    const certIds = certs.map((c: any) => c.id);
    if (certIds.length > 0) {
      await supabaseAdmin.from("student_profile_certs").delete().in("cert_id", certIds);
    }

    // Find and delete orphaned student profiles in bulk
    const uniqueEmails = [...new Set(certs.map((c: any) => c.recipient_email).filter(Boolean))] as string[];
    if (uniqueEmails.length > 0) {
      const emailKeys = uniqueEmails.map((e) => e.toLowerCase().replace(/[^a-z0-9]/g, "_"));

      // Fetch all index rows in one query
      const { data: indexRows } = await supabaseAdmin
        .from("student_profile_index")
        .select("slug, email_key")
        .in("email_key", emailKeys);

      if (indexRows && indexRows.length > 0) {
        const slugs = indexRows.map((r: any) => r.slug);

        // Find which slugs still have certs remaining (after our delete above)
        const { data: remainingCerts } = await supabaseAdmin
          .from("student_profile_certs")
          .select("profile_slug")
          .in("profile_slug", slugs);

        const slugsWithRemainingCerts = new Set((remainingCerts || []).map((r: any) => r.profile_slug));
        const orphanedSlugs = slugs.filter((s: string) => !slugsWithRemainingCerts.has(s));
        const orphanedEmailKeys = indexRows
          .filter((r: any) => orphanedSlugs.includes(r.slug))
          .map((r: any) => r.email_key);

        // Bulk delete orphaned profiles and index entries
        if (orphanedSlugs.length > 0) {
          await Promise.all([
            supabaseAdmin.from("student_profiles").delete().in("slug", orphanedSlugs),
            supabaseAdmin.from("student_profile_index").delete().in("email_key", orphanedEmailKeys),
          ]);
        }
      }
    }

    // Delete the batch — cascades to certificates, cert_index, wa_messages via FK
    await supabaseAdmin.from("batches").delete().eq("id", batchId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Backfill student profiles for all sent certs in a batch (approved orgs only)
router.post("/batches/:batchId/sync-profiles", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { batchId } = req.params;

  try {
    const { data: batch, error } = await supabaseAdmin.from("batches").select("user_id, workspace_id, name").eq("id", batchId).single();
    if (error || !batch) return res.status(404).json({ error: "Batch not found" });
    if (!canAccessBatch(batch, req)) return res.status(403).json({ error: "Access denied" });

    if (!(await isUserApproved(batch.user_id))) {
      return res.status(403).json({ error: "Profile pages are available for approved organizations only." });
    }

    const { data: certs } = await supabaseAdmin
      .from("certificates")
      .select("id, recipient_name, recipient_email, r2_pdf_url, pdf_url, status")
      .eq("batch_id", batchId)
      .in("status", ["sent", "generated"]);

    const profiles = (certs || [])
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

    if (profiles.length === 0) return res.json({ synced: 0 });

    await bulkUpsertStudentProfiles(batchId, profiles);
    return res.json({ synced: profiles.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
