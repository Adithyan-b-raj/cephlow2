import { Worker } from "bullmq";
import { redisConnection } from "./queue/connection.js";
import { processGenerate } from "./processors/generate.js";
import { processSendEmail } from "./processors/sendEmail.js";
import { processSendWhatsApp } from "./processors/sendWhatsApp.js";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

// Max time a job can run before BullMQ considers it stalled and re-queues it.
// Generate jobs can take ~2 min for large batches; give 5 min headroom.
const LOCK_DURATION = parseInt(process.env.WORKER_LOCK_DURATION_MS || String(5 * 60 * 1000), 10);

const generateWorker = new Worker("cert-generate", processGenerate, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
  lockDuration: LOCK_DURATION,
});

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

for (const worker of [generateWorker, sendEmailWorker, sendWhatsAppWorker]) {
  worker.on("completed", (job, result) => {
    console.log(`[${job.queueName}] job ${job.id} completed`, result);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${job?.queueName}] job ${job?.id} failed:`, err.message);
  });
}

console.log(`Workers started (concurrency=${CONCURRENCY})`);

async function shutdown() {
  await Promise.all([generateWorker.close(), sendEmailWorker.close(), sendWhatsAppWorker.close()]);
  redisConnection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
