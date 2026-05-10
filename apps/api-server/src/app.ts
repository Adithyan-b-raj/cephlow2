import express, { type Express } from "express";
import cors from "cors";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { requireAuth } from "./middlewares/auth.js";
import healthRouter from "./routes/health.js";
import verifyRouter from "./routes/verify.js";
import authRouter from "./routes/auth.js";
import webhooksRouter from "./routes/webhooks.js";
import profilesRouter from "./routes/profiles.js";
import qrRouter from "./routes/qr.js";
import internalRouter from "./routes/internal.js";
import router from "./routes/index.js";
import { getDriveClient } from "./lib/googleDrive.js";

const app: Express = express();
app.set("trust proxy", 1);

// Global limiter — catches everything before auth
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Strict limiter for expensive operations (generate, send, sync)
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).user?.uid || ipKeyGenerator(req.ip ?? ""),
  message: { error: "Too many batch operations, please wait before retrying." },
});


app.use(globalLimiter);
app.use(cors());
app.use(
  express.json({
    limit: "25mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Health check — no auth required
app.use("/api", healthRouter);

// Certificate verification — public, no auth required
app.use("/api", verifyRouter);

// Student profile pages — public, no auth required
app.use("/api", profilesRouter);

// Auth routes — already protected by requireAuth inside the router; no extra limiter needed
app.use("/api", authRouter);

// WhatsApp webhook — must be public (no auth), Meta POSTs here
app.use("/api", webhooksRouter);

// QR endpoint - public (Google Slides servers need access)
app.use("/api", qrRouter);

// Internal server-to-server routes (guarded by shared-secret header, no user auth)
app.use("/api", internalRouter);

// Heavy operations: auth runs first so req.user is populated,
// then the per-user rate limiter kicks in before the route handler.
app.use("/api/batches/:batchId/client-generate", requireAuth, heavyLimiter);
app.use("/api/batches/:batchId/send", requireAuth, heavyLimiter);
app.use("/api/batches/:batchId/send-whatsapp", requireAuth, heavyLimiter);
app.use("/api/batches/:batchId/sync", requireAuth, heavyLimiter);

// Slide thumbnail proxy — requires auth only (no workspace header needed, used by <img> tags)
app.get("/api/slides/thumbnail/:fileId", requireAuth, async (req, res) => {
  try {
    const drive = await getDriveClient(req.user!.uid);
    const file = await drive.files.get({ fileId: req.params.fileId as string, fields: "thumbnailLink" });
    const thumbnailLink = (file.data as any).thumbnailLink;
    if (!thumbnailLink) return res.status(404).send("No thumbnail available");
    const response = await fetch(thumbnailLink);
    if (!response.ok) throw new Error("Failed to fetch thumbnail from Google");
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// All other routes require Firebase Auth
app.use("/api", requireAuth, router);

export default app;
