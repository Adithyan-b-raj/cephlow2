import IORedis from "ioredis";

const url = process.env.REDIS_URL || "redis://localhost:6379";
const parsed = new URL(url);

export const redisConnection = new IORedis({
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  username: parsed.username || undefined,
  password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  tls: url.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
});
