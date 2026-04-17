import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import sheetsRouter from "./sheets.js";
import slidesRouter from "./slides.js";
import batchesRouter from "./batches.js";
import certificatesRouter from "./certificates.js";
import paymentsRouter from "./payments.js";
import walletRouter from "./wallet.js";
const router: IRouter = Router();

router.use(healthRouter);
router.use(sheetsRouter);
router.use(slidesRouter);
router.use(batchesRouter);
router.use(certificatesRouter);
router.use(paymentsRouter);
router.use(walletRouter);

export default router;
