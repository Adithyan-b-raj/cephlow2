import { Router, type IRouter } from "express";
import { supabaseAdmin, toCamel } from "@workspace/supabase";
import { isAdminOrOwner } from "../middlewares/requireWorkspace.js";

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
