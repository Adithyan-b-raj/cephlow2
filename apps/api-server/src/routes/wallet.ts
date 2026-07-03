import { Router } from "express";
import { supabaseAdmin } from "@workspace/supabase";

const router = Router();

router.get("/wallet", async (req, res) => {
  try {
    const { id: workspaceId } = req.workspace!;

    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("current_balance, transfer_code, generation_cost, email_cost, whatsapp_cost")
      .eq("id", workspaceId)
      .single();

    if (error) throw error;
    return res.json({
      currentBalance: data?.current_balance ?? 0,
      transferCode: data?.transfer_code ?? null,
      costs: {
        generation: data?.generation_cost ?? 1.0,
        email: data?.email_cost ?? 1.0,
        whatsapp: data?.whatsapp_cost ?? 1.0,
      }
    });
  } catch (err: any) {
    console.error("Error fetching wallet balance:", err);
    return res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

router.get("/wallet/history", async (req, res) => {
  try {
    const { id: workspaceId } = req.workspace!;

    const { data, error } = await supabaseAdmin
      .from("ledgers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const ledgers = (data || []).map((row: any) => ({
      id: row.id,
      type: row.type || "topup",
      amount: row.amount || 0,
      balanceAfter: row.balance_after || 0,
      description: row.description || "",
      metadata: row.metadata || {},
      userId: row.user_id,
      createdAt: row.created_at || new Date().toISOString(),
    }));

    return res.json({ ledgers });
  } catch (err: any) {
    console.error("Error fetching ledger history:", err);
    return res.status(500).json({ error: "Failed to fetch ledger history" });
  }
});

// ─── GET /api/wallet/resolve?code= ───────────────────────────────────────────
// Preview a destination workspace by transfer code before committing a send.

router.get("/wallet/resolve", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : "";
    if (!code) return res.status(400).json({ error: "code is required" });

    const currentWorkspaceId = req.workspace!.id;

    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, transfer_code")
      .eq("transfer_code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No workspace found with that code" });
    if (data.id === currentWorkspaceId) {
      return res.status(400).json({ error: "That is your own workspace" });
    }

    return res.json({ id: data.id, name: data.name, code: data.transfer_code });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/wallet/send ────────────────────────────────────────────────────
// Atomically transfer credits from the current workspace to another workspace
// identified by its transfer code.

router.post("/wallet/send", async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { id: workspaceId, role } = req.workspace!;

    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({ error: "Only workspace admins can send credits" });
    }

    const { toCode, amount, note = "" } = req.body ?? {};

    if (!toCode || typeof toCode !== "string" || !toCode.trim()) {
      return res.status(400).json({ error: "toCode is required" });
    }
    if (!amount || typeof amount !== "number" || amount <= 0 || amount !== Math.floor(amount)) {
      return res.status(400).json({ error: "amount must be a positive whole number" });
    }
    if (typeof note !== "string" || note.length > 200) {
      return res.status(400).json({ error: "note must be 200 characters or fewer" });
    }

    // Resolve destination by transfer code
    const { data: toWs, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .eq("transfer_code", toCode.trim().toUpperCase())
      .maybeSingle();

    if (wsErr) throw wsErr;
    if (!toWs) return res.status(404).json({ error: "No workspace found with that code" });
    if (toWs.id === workspaceId) return res.status(400).json({ error: "Cannot transfer to your own workspace" });

    const { data: result, error } = await supabaseAdmin.rpc("send_workspace_credits", {
      p_from_workspace_id: workspaceId,
      p_to_workspace_id:   toWs.id,
      p_amount:            amount,
      p_user_id:           userId,
      p_note:              note.trim(),
    });

    if (error) throw error;
    if (!result.success) {
      return res.status(400).json({ error: result.error, available: result.available ?? undefined });
    }

    return res.json({
      success:          true,
      transferId:       result.transferId,
      toWorkspaceName:  toWs.name,
      newBalance:       result.newFromBalance,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/wallet/transfers ────────────────────────────────────────────────
// Paginated list of transfers in and out of the current workspace.

router.get("/wallet/transfers", async (req, res) => {
  try {
    const { id: workspaceId } = req.workspace!;
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from("workspace_transfers")
      .select(
        "id, amount, note, initiated_by, created_at, from_workspace_id, to_workspace_id, " +
        "from_workspace:workspaces!from_workspace_id(name, transfer_code), " +
        "to_workspace:workspaces!to_workspace_id(name, transfer_code)",
        { count: "exact" }
      )
      .or(`from_workspace_id.eq.${workspaceId},to_workspace_id.eq.${workspaceId}`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const transfers = (data || []).map((t: any) => ({
      id:            t.id,
      direction:     t.from_workspace_id === workspaceId ? "out" : "in",
      amount:        t.amount,
      note:          t.note,
      initiatedBy:   t.initiated_by,
      fromWorkspace: { name: t.from_workspace?.name, code: t.from_workspace?.transfer_code },
      toWorkspace:   { name: t.to_workspace?.name,   code: t.to_workspace?.transfer_code },
      createdAt:     t.created_at,
    }));

    return res.json({ transfers, total: count ?? 0, page });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
