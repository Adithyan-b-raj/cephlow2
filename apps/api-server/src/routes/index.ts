import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sheetsRouter from "./sheets.js";
import slidesRouter from "./slides.js";
import batchesRouter from "./batches.js";
import certificatesRouter from "./certificates.js";
import paymentsRouter from "./payments.js";
import walletRouter from "./wallet.js";
import clientGenerateRouter from "./clientGenerate.js";
import builtinTemplatesRouter from "./builtinTemplates.js";
import approvalRouter from "./approval.js";
import workspacesRouter from "./workspaces.js";
import { requireApproval } from "../middlewares/requireApproval.js";
import { requireWorkspace } from "../middlewares/requireWorkspace.js";

const router: IRouter = Router();

// Approval state — must NOT itself be gated (so unapproved users can read it).
router.use(approvalRouter);

// Workspace management endpoints (and /invites/accept) — must NOT require workspace context.
router.use(workspacesRouter);

router.use(healthRouter);

// All routes below this line are scoped to a workspace (X-Workspace-Id header required).
router.use(requireWorkspace);

router.use(sheetsRouter);
router.use(batchesRouter);
router.use(certificatesRouter);
router.use(paymentsRouter);
router.use(clientGenerateRouter);
router.use(builtinTemplatesRouter);

// Approved-org-only routes:
//   • slides — Google Slides template browsing/copying is locked for free tier
//   • wallet — wallet management (top-up etc.) locked for free tier
router.use(requireApproval, slidesRouter);
router.use(requireApproval, walletRouter);

export default router;
