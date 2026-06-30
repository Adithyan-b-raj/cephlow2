import { Hono } from "hono";
import { generateQrPng } from "../lib/qr.js";

const router = new Hono<ContextEnv>();

// GET /api/qr?data=YOUR_URL
router.get("/qr", async (c) => {
  try {
    const data = c.req.query("data");
    if (!data) {
      return c.text("The 'data' query parameter is required.", 400);
    }

    const qrBytes = await generateQrPng(data);

    return new Response(qrBytes as any, {
      headers: { "Content-Type": "image/png" }
    });
  } catch (err: any) {
    console.error("[QR GENERATION] Failed:", err);
    return c.text("Internal Server Error processing QR Code", 500);
  }
});

export default router;
