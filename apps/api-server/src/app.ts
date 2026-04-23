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
import router from "./routes/index.js";

const app: Express = express();

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

// Heavy operations get their own stricter limit
app.use("/api/batches/:batchId/generate", heavyLimiter);
app.use("/api/batches/:batchId/send", heavyLimiter);
app.use("/api/batches/:batchId/send-whatsapp", heavyLimiter);
app.use("/api/batches/:batchId/sync", heavyLimiter);

// All other routes require Firebase Auth
app.use("/api", requireAuth, router);

export default app;
