import { Router } from "express";
import { Cashfree } from "cashfree-pg-sdk-nodejs";
import { CreateOrderBody } from "@workspace/api-zod";

Cashfree.XClientId = process.env.CASHFREE_APP_ID || "";
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY || "";
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

const router = Router();

router.post("/payments/create-order", async (req, res) => {
  try {
    const result = CreateOrderBody.parse(req.body);
    const uid = req.user!.uid;
    const phone = req.user?.phone_number || "9999999999";
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

    const response = await Cashfree.PGCreateOrder("2023-08-01", request);
    
    if (response.data && response.data.payment_session_id) {
      res.json({
        payment_session_id: response.data.payment_session_id,
        order_id: response.data.order_id,
      });
    } else {
      console.error("Cashfree API returned unexpected response", response.data);
      res.status(500).json({ error: "Invalid response from payment gateway" });
    }
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request payload", details: err.errors });
    }
    console.error("Cashfree Order Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Payment gateway error" });
  }
});

export default router;
