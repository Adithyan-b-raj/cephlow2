import express, { type Express } from "express";
import cors from "cors";
import { requireAuth } from "./middlewares/auth.js";
import healthRouter from "./routes/health.js";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check — no auth required
app.use("/api", healthRouter);

// All other routes require Firebase Auth
app.use("/api", requireAuth, router);

export default app;
