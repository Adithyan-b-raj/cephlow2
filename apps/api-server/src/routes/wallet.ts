import { Router } from "express";
import { supabaseAdmin } from "@workspace/supabase";

const router = Router();

router.get("/wallet", async (req, res) => {
  try {
    const uid = req.user!.uid;
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("current_balance")
      .eq("id", uid)
      .maybeSingle();

    if (!data) {
      await supabaseAdmin
        .from("user_profiles")
        .upsert({ id: uid, current_balance: 0 }, { onConflict: "id" });
      return res.json({ currentBalance: 0 });
    }

    return res.json({ currentBalance: data.current_balance });
  } catch (err: any) {
    console.error("Error fetching wallet balance:", err);
    return res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
});

router.get("/wallet/history", async (req, res) => {
  try {
    const uid = req.user!.uid;
    const { data, error } = await supabaseAdmin
      .from("ledgers")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const ledgers = (data || []).map((row) => ({
      id: row.id,
      type: row.type || "topup",
      amount: row.amount || 0,
      balanceAfter: row.balance_after || 0,
      description: row.description || "",
      metadata: row.metadata || {},
      createdAt: row.created_at || new Date().toISOString(),
    }));

    return res.json({ ledgers });
  } catch (err: any) {
    console.error("Error fetching ledger history:", err);
    return res.status(500).json({ error: "Failed to fetch ledger history" });
  }
});

export default router;
