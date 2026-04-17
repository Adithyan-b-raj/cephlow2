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

    // Generate QR directly to a buffer
    const buffer = await QRCode.toBuffer(data, { 
      type: "png", 
      width: 300, 
      margin: 1 
    });
    
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[QR GENERATION] Failed:", err);
    return res.status(500).send("Internal Server Error processing QR Code");
  }
});

export default router;
