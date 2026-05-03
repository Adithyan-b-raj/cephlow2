import { Router } from "express";
import { supabaseAdmin } from "@workspace/supabase";

const router = Router();

router.get("/wallet", async (req, res) => {
  try {
    const { id: workspaceId } = req.workspace!;

    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("current_balance")
      .eq("id", workspaceId)
      .single();

    if (error) throw error;
    return res.json({ currentBalance: data?.current_balance ?? 0 });
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

export default router;
