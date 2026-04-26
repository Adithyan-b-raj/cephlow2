import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";
import type { GenerateJobData, SendEmailJobData, SendWhatsAppJobData } from "./types.js";

const sharedJobOptions = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 5000 },
  removeOnComplete: { count: 500 },  // keep last 500 completed jobs in Redis
  removeOnFail: { count: 200 },      // keep last 200 failed jobs for debugging
};

export const generateQueue = new Queue<GenerateJobData>("cert-generate", {
  connection: redisConnection,
  defaultJobOptions: sharedJobOptions,
});

export const sendEmailQueue = new Queue<SendEmailJobData>("cert-send-email", {
  connection: redisConnection,
  defaultJobOptions: sharedJobOptions,
});

export const sendWhatsAppQueue = new Queue<SendWhatsAppJobData>("cert-send-whatsapp", {
  connection: redisConnection,
  defaultJobOptions: sharedJobOptions,
});
