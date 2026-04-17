import { Router } from "express";
import QRCode from "qrcode";

const router = Router();

// GET /api/qr?data=YOUR_URL
router.get("/qr", async (req, res) => {
  try {
    const data = req.query.data as string;
    if (!data) {
      return res.status(400).send("The 'data' query parameter is required.");
    }

    res.setHeader("Content-Type", "image/png");
    // Generate QR directly to the response stream
    QRCode.toFileStream(res, data, { 
      type: "png", 
      width: 300, 
      margin: 1 
    });
  } catch (err) {
    console.error("[QR GENERATION] Failed:", err);
    return res.status(500).send("Internal Server Error processing QR Code");
  }
});

export default router;
