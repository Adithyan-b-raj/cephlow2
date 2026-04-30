import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";
import type { SendEmailJobData, SendWhatsAppJobData, R2UploadJobData } from "./types.js";

const sharedJobOptions = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 5000 },
  removeOnComplete: { count: 500 },  // keep last 500 completed jobs in Redis
  removeOnFail: { count: 200 },      // keep last 200 failed jobs for debugging
};

export const sendEmailQueue = new Queue<SendEmailJobData>("cert-send-email", {
  connection: redisConnection,
  defaultJobOptions: sharedJobOptions,
});

export const sendWhatsAppQueue = new Queue<SendWhatsAppJobData>("cert-send-whatsapp", {
  connection: redisConnection,
  defaultJobOptions: sharedJobOptions,
});

export const r2UploadQueue = new Queue<R2UploadJobData>("r2-upload", {
  connection: redisConnection,
  defaultJobOptions: {
    ...sharedJobOptions,
    attempts: 3,  // R2 uploads are more transient — give an extra retry
  },
});
