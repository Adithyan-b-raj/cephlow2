import { Worker } from "bullmq";
import { redisConnection } from "./queue/connection.js";
import { processGenerate } from "./processors/generate.js";
import { processSendEmail } from "./processors/sendEmail.js";
import { processSendWhatsApp } from "./processors/sendWhatsApp.js";

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

const generateWorker = new Worker("cert-generate", processGenerate, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
});

const sendEmailWorker = new Worker("cert-send-email", processSendEmail, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
});

const sendWhatsAppWorker = new Worker("cert-send-whatsapp", processSendWhatsApp, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
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
