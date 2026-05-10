import { Router } from "express";
import { Cashfree, CFEnvironment } from "cashfree-pg";
import { CreateOrderBody } from "@workspace/api-zod";
import { supabaseAdmin } from "@workspace/supabase";

const env = process.env.VITE_CASHFREE_ENV === "PRODUCTION" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

const cashfree = new Cashfree(
  env,
  process.env.CASHFREE_APP_ID || "",
  process.env.CASHFREE_SECRET_KEY || "",
);

console.log(`[Payments Route] Initialized Cashfree SDK in ${process.env.VITE_CASHFREE_ENV === "PRODUCTION" ? "PRODUCTION" : "SANDBOX"} mode with App ID: ${process.env.CASHFREE_APP_ID?.substring(0, 10)}...`);

const router = Router();

router.post("/payments/create-order", async (req, res) => {
  try {
    const result = CreateOrderBody.parse(req.body);
    const uid = req.user!.uid;
    const phone = (req.user as any)?.phone_number || "9999999999";
    const email = req.user?.email || "sandbox@example.com";

    const request = {
      order_amount: result.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: uid,
        customer_phone: phone,
        customer_email: email,
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/?order_id={order_id}`,
      },
    };

    const response = await (cashfree as any).PGCreateOrder(request);
    
    if (response.data && response.data.payment_session_id) {
      // Record workspace → order mapping so the webhook can credit the right wallet
      const { error: insertErr } = await supabaseAdmin.from("payment_orders").insert({
        order_id: response.data.order_id,
        workspace_id: req.workspace!.id,
        user_id: uid,
        amount: result.amount,
      });

      if (insertErr) {
        console.error("[Payments] Failed to record payment_orders:", insertErr);
      }

      return res.json({
        payment_session_id: response.data.payment_session_id,
        order_id: response.data.order_id,
      });
    } else {
      console.error("Cashfree API returned unexpected response", response.data);
      return res.status(500).json({ error: "Invalid response from payment gateway" });
    }
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request payload", details: err.errors });
    }
    console.error("Cashfree Order Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Payment gateway error" });
  }
});

// POST /api/payments/verify — client-initiated payment verification fallback
// When Cashfree webhooks can't reach localhost (dev) or are delayed,
// the frontend calls this after the payment modal closes to verify & credit.
router.post("/payments/verify", async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ error: "order_id is required" });
    }

    console.log(`[Payment Verify] Checking order: ${order_id}`);

    // 1. Look up the order we recorded at creation time
    const { data: orderRow, error: orderErr } = await supabaseAdmin
      .from("payment_orders")
      .select("workspace_id, user_id, amount, processed")
      .eq("order_id", order_id)
      .maybeSingle();

    if (orderErr || !orderRow) {
      console.warn(`[Payment Verify] Order not found in DB: ${order_id}`);
      return res.status(404).json({ error: "Order not found" });
    }

    // 2. If already processed, skip
    if (orderRow.processed) {
      console.log(`[Payment Verify] Order ${order_id} already processed`);
      return res.json({ status: "already_processed", credited: false });
    }

    // 3. Fetch order status from Cashfree
    let cfOrder: any;
    try {
      const response = await (cashfree as any).PGFetchOrder(order_id);
      cfOrder = response.data;
    } catch (err: any) {
      console.error(`[Payment Verify] Cashfree fetch error:`, err.response?.data || err.message);
      return res.status(502).json({ error: "Could not verify with payment gateway" });
    }

    console.log(`[Payment Verify] Cashfree status: ${cfOrder?.order_status}`);

    if (cfOrder?.order_status !== "PAID") {
      return res.json({ status: cfOrder?.order_status || "UNKNOWN", credited: false });
    }

    // 4. Payment confirmed — credit via the same RPC the webhook uses
    const amount = cfOrder.order_amount || orderRow.amount;
    const userId = orderRow.user_id;

    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("process_payment", {
      p_user_id: userId,
      p_order_id: order_id,
      p_amount: amount,
      p_payment_id: null,
      p_payment_method: null,
    });

    if (rpcErr) {
      console.error("[Payment Verify] RPC error:", rpcErr);
      return res.status(500).json({ error: "Failed to credit wallet" });
    }

    if ((rpcResult as any)?.status === "already_processed") {
      console.log(`[Payment Verify] Order ${order_id} already processed by webhook`);
      return res.json({ status: "already_processed", credited: false });
    }

    console.log(`[Payment Verify] ✅ Credited ₹${amount} to user ${userId} (Order: ${order_id})`);
    return res.json({ status: "PAID", credited: true, amount });
  } catch (err: any) {
    console.error("[Payment Verify] Error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
