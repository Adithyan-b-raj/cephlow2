import express, { type Express } from "express";
import cors from "cors";
import { requireAuth } from "./middlewares/auth.js";
import healthRouter from "./routes/health.js";
import router from "./routes";
import certificatesRouter from "./routes/certificates.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — no auth required
app.use("/api", healthRouter);

// Public verification route
app.use("/api/certificates/:certId/verify", (req, res, next) => {
    // We pass the certId to the sub-router via req.params
    next();
}, certificatesRouter);

// All other routes require Firebase Auth
app.use("/api", requireAuth, router);

export default app;
