import { Worker } from "bullmq";
import { redisConnection } from "./queue/connection.js";
import { processSendEmail } from "./processors/sendEmail.js";
import { processSendWhatsApp } from "./processors/sendWhatsApp.js";
import { processR2Upload } from "./processors/r2Upload.js";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

// Max time a job can run before BullMQ considers it stalled and re-queues it.
const LOCK_DURATION = parseInt(process.env.WORKER_LOCK_DURATION_MS || String(5 * 60 * 1000), 10);

const sendEmailWorker = new Worker("cert-send-email", processSendEmail, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
  lockDuration: LOCK_DURATION,
});

const sendWhatsAppWorker = new Worker("cert-send-whatsapp", processSendWhatsApp, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
  lockDuration: LOCK_DURATION,
});

// R2 uploads are I/O-bound — safe to run at higher concurrency
const R2_CONCURRENCY = parseInt(process.env.R2_UPLOAD_CONCURRENCY || "10", 10);

const r2UploadWorker = new Worker("r2-upload", processR2Upload, {
  connection: redisConnection,
  concurrency: R2_CONCURRENCY,
  lockDuration: 60_000, // individual uploads should be fast — 60s is plenty
});

for (const worker of [sendEmailWorker, sendWhatsAppWorker, r2UploadWorker]) {
  worker.on("completed", (job, result) => {
    console.log(`[${job.queueName}] job ${job.id} completed`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${job?.queueName}] job ${job?.id} failed:`, err.message);
  });
}

console.log(`Workers started (send=${CONCURRENCY}, r2Upload=${R2_CONCURRENCY})`);

async function shutdown() {
  await Promise.all([sendEmailWorker.close(), sendWhatsAppWorker.close(), r2UploadWorker.close()]);
  redisConnection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
