import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redisConnection: Redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on("error", (err) => {
  logger.error({ err: err.message }, "Redis connection error");
});

redisConnection.on("connect", () => {
  logger.info({ url: env.REDIS_URL }, "Redis connected");
});

export const taskQueue = new Queue(env.QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const pong = await redisConnection.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
