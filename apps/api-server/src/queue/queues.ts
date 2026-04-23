import { Queue } from "bullmq";
import { redisConnection } from "./connection.js";
import type { GenerateJobData, SendEmailJobData, SendWhatsAppJobData } from "./types.js";

export const generateQueue = new Queue<GenerateJobData>("cert-generate", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 5000 } },
});

export const sendEmailQueue = new Queue<SendEmailJobData>("cert-send-email", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 5000 } },
});

export const sendWhatsAppQueue = new Queue<SendWhatsAppJobData>("cert-send-whatsapp", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 5000 } },
});
