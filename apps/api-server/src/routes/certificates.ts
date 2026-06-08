import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel } from "@workspace/supabase";
import { isAdminOrOwner } from "../middlewares/requireWorkspace.js";
import { deleteR2Objects, isR2Configured } from "../lib/cloudflareR2.js";

const router: IRouter = Router({ mergeParams: true });

// List certificates with optional filters
router.get("/certificates", async (req, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const batchId = req.query.batchId as string | undefined;
    const status = req.query.status as string | undefined;

    const { id: workspaceId, role } = req.workspace!;

    if (batchId) {
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from("batches")
        .select("user_id, workspace_id")
        .eq("id", batchId)
        .single();
      if (batchErr || !batch) return res.status(404).json({ error: "Batch not found" });
      if (batch.workspace_id !== workspaceId) return res.status(403).json({ error: "Access denied" });
      if (!isAdminOrOwner(role) && batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

      let query = supabaseAdmin.from("certificates").select("*").eq("batch_id", batchId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      const certificates = (data || []).map(toCamel);
      return res.json({ certificates, total: certificates.length });
    }

    // No batchId — get all certs in the workspace (role-scoped)
    let query = supabaseAdmin
      .from("certificates")
      .select("*, batches!inner(user_id, workspace_id)")
      .eq("batches.workspace_id", workspaceId);
    if (!isAdminOrOwner(role)) {
      query = (query as any).eq("batches.user_id", userId);
    }
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    const certificates = (data || []).map((row: any) => {
      const { batches: _, ...cert } = row;
      return toCamel(cert);
    });

    return res.json({ certificates, total: certificates.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Remove a single recipient (and their certificate/event data) from a batch
router.delete("/certificates/:certId", async (req, res) => {
  const userId = req.user?.uid;
  if (!userId || !req.workspace) return res.status(401).json({ error: "Unauthorized" });

  const { certId } = req.params;

  try {
    const { data: cert, error: certError } = await supabaseAdmin
      .from("certificates")
      .select("id, batch_id, recipient_email, r2_pdf_url")
      .eq("id", certId)
      .single();
    if (certError || !cert) return res.status(404).json({ error: "Certificate not found" });

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("batches")
      .select("user_id, workspace_id")
      .eq("id", cert.batch_id)
      .single();
    if (batchError || !batch) return res.status(404).json({ error: "Batch not found" });

    const { id: workspaceId, role } = req.workspace;
    if (batch.workspace_id !== workspaceId) return res.status(403).json({ error: "Access denied" });
    if (!isAdminOrOwner(role) && batch.user_id !== userId) return res.status(403).json({ error: "Access denied" });

    // Clean up the R2 PDF object
    if (isR2Configured() && cert.r2_pdf_url) {
      const r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
      if (r2PublicBase && cert.r2_pdf_url.startsWith(r2PublicBase + "/")) {
        try { await deleteR2Objects([cert.r2_pdf_url.slice(r2PublicBase.length + 1)]); }
        catch (r2Err) { console.error("[R2] Failed to delete object:", r2Err); }
      }
    }

    // Unlink from any student profile, then drop the profile if it has no certs left
    const { data: unlinked } = await supabaseAdmin
      .from("student_profile_certs")
      .delete()
      .eq("cert_id", cert.id)
      .select("profile_slug");

    const slugs = [...new Set((unlinked || []).map((r: any) => r.profile_slug).filter(Boolean))] as string[];
    if (slugs.length > 0) {
      const { data: remaining } = await supabaseAdmin
        .from("student_profile_certs")
        .select("profile_slug")
        .in("profile_slug", slugs);
      const slugsWithRemainingCerts = new Set((remaining || []).map((r: any) => r.profile_slug));
      const orphanedSlugs = slugs.filter((s) => !slugsWithRemainingCerts.has(s));

      if (orphanedSlugs.length > 0) {
        const { data: indexRows } = await supabaseAdmin
          .from("student_profile_index")
          .select("email_key")
          .in("slug", orphanedSlugs);
        const orphanedEmailKeys = (indexRows || []).map((r: any) => r.email_key);

        await Promise.all([
          supabaseAdmin.from("student_profiles").delete().in("slug", orphanedSlugs),
          orphanedEmailKeys.length > 0
            ? supabaseAdmin.from("student_profile_index").delete().in("email_key", orphanedEmailKeys)
            : Promise.resolve(),
        ]);
      }
    }

    await supabaseAdmin.from("certificates").delete().eq("id", cert.id);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Public route to verify a certificate by ID.
 * Fast path: cert_index table (populated by trigger on insert).
 * Fallback: direct cert lookup by UUID (O(1) in PostgreSQL).
 */
router.get("/certificates/:certId/verify", async (req, res) => {
  try {
    const { certId } = req.params as any;
    console.log(`Verifying certificate ID: ${certId}`);

    // Fast path via cert_index
    const { data: indexRow } = await supabaseAdmin
      .from("cert_index")
      .select("batch_id")
      .eq("cert_id", certId)
      .maybeSingle();

    let foundCert: any = null;
    let foundBatch: any = null;

    if (indexRow) {
      const [{ data: cert }, { data: batch }] = await Promise.all([
        supabaseAdmin.from("certificates").select("*").eq("id", certId).single(),
        supabaseAdmin.from("batches").select("name").eq("id", indexRow.batch_id).single(),
      ]);
      if (cert && batch) {
        foundCert = cert;
        foundBatch = batch;
        console.log(`Certificate found via index in batch: ${indexRow.batch_id}`);
      }
    }

    // Fallback — direct lookup (UUID PK is always O(1))
    if (!foundCert) {
      console.log(`Index miss for ${certId}, falling back to direct lookup`);
      const { data } = await supabaseAdmin
        .from("certificates")
        .select("*, batches(name)")
        .eq("id", certId)
        .maybeSingle();
      if (data) {
        const { batches, ...cert } = data as any;
        foundCert = cert;
        foundBatch = batches;
        console.log(`Certificate found via direct lookup`);
      }
    }

    if (!foundCert || !foundBatch) {
      console.log(`Certificate ${certId} not found.`);
      return res.status(404).json({ error: "Certificate not found" });
    }

    return res.json({
      valid: true,
      recipientName: foundCert.recipient_name,
      batchName: foundBatch.name,
      issuedAt: foundCert.created_at,
      status: foundCert.status,
    });
  } catch (err: any) {
    console.error("Verification error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
