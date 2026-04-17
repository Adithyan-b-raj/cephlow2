import express, { type Express } from "express";
import cors from "cors";
import { requireAuth } from "./middlewares/auth.js";
import healthRouter from "./routes/health.js";
import verifyRouter from "./routes/verify.js";
import authRouter from "./routes/auth.js";
import webhooksRouter from "./routes/webhooks.js";
import profilesRouter from "./routes/profiles.js";
import qrRouter from "./routes/qr.js";
import router from "./routes/index.js";

const app: Express = express();

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

// Auth routes — callback is unprotected; url/status routes self-apply requireAuth
app.use("/api", authRouter);

// WhatsApp webhook — must be public (no auth), Meta POSTs here
app.use("/api", webhooksRouter);

// QR endpoint - public (Google Slides servers need access)
app.use("/api", qrRouter);

// All other routes require Firebase Auth
app.use("/api", requireAuth, router);

export default app;
