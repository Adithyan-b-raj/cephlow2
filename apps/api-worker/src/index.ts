import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { authMiddleware } from "./middleware/auth.js";
import { workspaceMiddleware, requireNotSuspended } from "./middleware/workspace.js";
import { requireApproval as approvalMiddleware } from "./middleware/approval.js";
import { rateLimit } from "./middleware/rateLimiter.js";
import { getAccessToken } from "./lib/google-auth.js";
import { googleFetch } from "./lib/google-drive.js";

// Routes imports
import healthRouter from "./routes/health.js";
import verifyRouter from "./routes/verify.js";
import galleryRouter from "./routes/gallery.js";
import authRouter from "./routes/auth.js";
import webhooksRouter from "./routes/webhooks.js";
import profilesRouter from "./routes/profiles.js";
import qrRouter from "./routes/qr.js";
import internalRouter from "./routes/internal.js";
import workspacesRouter from "./routes/workspaces.js";
import approvalRouter from "./routes/approval.js";
import batchesRouter from "./routes/batches.js";
import sheetsRouter from "./routes/sheets.js";
import slidesRouter from "./routes/slides.js";
import spreadsheetsRouter from "./routes/spreadsheets.js";
import frameTemplatesRouter from "./routes/frameTemplates.js";
import frameMarketplaceRouter from "./routes/frameMarketplace.js";
import certificatesRouter from "./routes/certificates.js";
import paymentsRouter from "./routes/payments.js";
import clientGenerateRouter from "./routes/clientGenerate.js";
import builtinTemplatesRouter from "./routes/builtinTemplates.js";
import reportsRouter from "./routes/reports.js";
import walletRouter from "./routes/wallet.js";
import adminRouter from "./routes/admin.js";

const app = new Hono<ContextEnv>();

// 1. Configure Secure Headers (M-2, M-3, M-4)
app.use("*", secureHeaders({
  strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    connectSrc: ["'self'", "https://*.supabase.co", "https://*.cashfree.com", "https://*.googleapis.com"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https://*.r2.cloudflarestorage.com"],
    frameAncestors: ["'none'"],
  },
}));

// 2. Configure CORS (M-2)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
];

app.use("*", cors({
  origin: (origin, c) => {
    if (!origin) return undefined;
    if (allowedOrigins.includes(origin)) return origin;
    if (c.env?.FRONTEND_URL && origin === c.env.FRONTEND_URL.replace(/\/$/, "")) return origin;
    if (c.env?.PUBLIC_BASE_URL && origin === c.env.PUBLIC_BASE_URL.replace(/\/$/, "")) return origin;
    return undefined;
  },
  allowHeaders: ["Authorization", "Content-Type", "X-Workspace-Id"],
  exposeHeaders: ["Content-Disposition"],
  credentials: true,
  maxAge: 86400,
}));

// 2. Register health route
app.route("/api", healthRouter);

// 3. Register public routes (verification, public galleries, student profiles)
app.route("/api", verifyRouter);
app.route("/api", galleryRouter);
app.route("/api", profilesRouter);
app.route("/api", qrRouter);
app.route("/api", webhooksRouter);

// 4. Register internal server-to-server routes
app.route("/api", internalRouter);

// ── Protected routes (Require User Auth Middleware) ──
app.use("/api/auth/*", authMiddleware);
app.use("/api/approval/*", authMiddleware);
app.use("/api/workspaces*", authMiddleware);
app.use("/api/workspaces/*", authMiddleware);
app.use("/api/slides/*", authMiddleware);
app.use("/api/sheets/*", authMiddleware);
app.use("/api/batches/*", authMiddleware);
app.use("/api/frame-templates*", authMiddleware);
app.use("/api/frame-templates/*", authMiddleware);
app.use("/api/marketplace/*", authMiddleware);
app.use("/api/certificates*", authMiddleware);
app.use("/api/certificates/*", authMiddleware);
app.use("/api/payments/*", authMiddleware);
app.use("/api/builtin-templates*", authMiddleware);
app.use("/api/builtin-templates/*", authMiddleware);
app.use("/api/spreadsheets*", authMiddleware);
app.use("/api/spreadsheets/*", authMiddleware);
app.use("/api/reports*", authMiddleware);
app.use("/api/reports/*", authMiddleware);
app.use("/api/wallet*", authMiddleware);
app.use("/api/wallet/*", authMiddleware);
app.use("/api/admin/*", authMiddleware);

// ── Rate Limiting (Applied to critical endpoints) ──
app.use("/api/auth/*", rateLimit({ limit: 30, windowSeconds: 60, keyPrefix: "auth" }));
app.use("/api/payments/create-order", rateLimit({ limit: 10, windowSeconds: 60, keyPrefix: "pay" }));
app.use("/api/batches", async (c, next) => {
  if (c.req.method === "POST") {
    return rateLimit({ limit: 10, windowSeconds: 60, keyPrefix: "batch-create" })(c, next);
  }
  return next();
});

app.route("/api", authRouter);
app.route("/api", approvalRouter);
app.route("/api", workspacesRouter);

// Slide thumbnail proxy
app.get("/api/slides/thumbnail/:fileId", async (c) => {
  const user = c.get("user")!;
  const fileId = c.req.param("fileId");
  try {
    const { accessToken } = await getAccessToken(c.env.DB, c.env, user.uid, "slides");
    const fileRes = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
      { method: "GET" },
      accessToken
    );
    const fileData = (await fileRes.json()) as any;
    const thumbnailLink = fileData.thumbnailLink;
    if (!thumbnailLink) {
      return c.text("No thumbnail available", 404);
    }
    const res = await fetch(thumbnailLink);
    if (!res.ok) throw new Error("Failed to fetch thumbnail from Google");
    const buffer = await res.arrayBuffer();
    
    return c.body(buffer, 200, {
      "Content-Type": res.headers.get("Content-Type") || "image/png",
      "Cache-Control": "public, max-age=3600",
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Workspace-scoped routes (Require Workspace Context Middleware) ──
app.use("/api/sheets/*", workspaceMiddleware);
app.use("/api/batches/*", workspaceMiddleware);
app.use("/api/frame-templates*", workspaceMiddleware);
app.use("/api/frame-templates/*", workspaceMiddleware);
app.use("/api/marketplace/*", workspaceMiddleware);
app.use("/api/certificates*", workspaceMiddleware);
app.use("/api/certificates/*", workspaceMiddleware);
app.use("/api/payments/*", workspaceMiddleware);
app.use("/api/builtin-templates*", workspaceMiddleware);
app.use("/api/builtin-templates/*", workspaceMiddleware);
app.use("/api/spreadsheets*", workspaceMiddleware);
app.use("/api/spreadsheets/*", workspaceMiddleware);
app.use("/api/reports*", workspaceMiddleware);
app.use("/api/reports/*", workspaceMiddleware);
app.use("/api/slides/*", workspaceMiddleware);
app.use("/api/wallet*", workspaceMiddleware);
app.use("/api/wallet/*", workspaceMiddleware);

// ── Suspended-workspace kill switch (usage routes only — deliberately NOT
// applied to /api/payments/*, so a suspended workspace can still complete an
// already-charged payment instead of leaving money stuck uncredited) ──
app.use("/api/sheets/*", requireNotSuspended);
app.use("/api/batches/*", requireNotSuspended);
app.use("/api/frame-templates*", requireNotSuspended);
app.use("/api/frame-templates/*", requireNotSuspended);
app.use("/api/marketplace/*", requireNotSuspended);
app.use("/api/certificates*", requireNotSuspended);
app.use("/api/certificates/*", requireNotSuspended);
app.use("/api/builtin-templates*", requireNotSuspended);
app.use("/api/builtin-templates/*", requireNotSuspended);
app.use("/api/spreadsheets*", requireNotSuspended);
app.use("/api/spreadsheets/*", requireNotSuspended);
app.use("/api/reports*", requireNotSuspended);
app.use("/api/reports/*", requireNotSuspended);
app.use("/api/slides/*", requireNotSuspended);
app.use("/api/wallet*", requireNotSuspended);
app.use("/api/wallet/*", requireNotSuspended);

app.route("/api", sheetsRouter);
app.route("/api", batchesRouter);
app.route("/api", frameTemplatesRouter);
app.route("/api", frameMarketplaceRouter);
app.route("/api", certificatesRouter);
app.route("/api", paymentsRouter);
app.route("/api", clientGenerateRouter);
app.route("/api", builtinTemplatesRouter);
app.route("/api", spreadsheetsRouter);
app.route("/api", reportsRouter);

// ── Approved organization restricted routes ──
app.use("/api/slides/*", approvalMiddleware);
app.use("/api/wallet*", approvalMiddleware);
app.use("/api/wallet/*", approvalMiddleware);

app.route("/api", slidesRouter);
app.route("/api", walletRouter);

// ── Platform-admin routes (cross-workspace, requirePlatformAdmin inside the router) ──
app.route("/api", adminRouter);

export default app;
