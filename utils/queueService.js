import { redisClient } from "../db/connections.js";

const blockingRedisClient = redisClient.duplicate();
// We want a separate client for blocking operations to avoid interfering with other commands
const QUEUES = {
  MAIN: "webhook_jobs",
  DELAYED: "delayed_webhook_jobs",
  DLQ: "dead_letter_queue",
};

class QueueService {
  async pushJob(job) {
    await redisClient.lpush(QUEUES.MAIN, JSON.stringify(job));
  }

  async getNextJob(timeout = 0) {
    const result = await blockingRedisClient.brpop(QUEUES.MAIN, timeout);
    if (!result) return null;
    return result[1];
  }

  async scheduleRetry(job, delayMs) {
    const nextExecutionTime = Date.now() + delayMs;
    await redisClient.zadd(QUEUES.DELAYED, nextExecutionTime, JSON.stringify(job));
  }

  async sendToDlq(job, originalError) {
    // Mimic the previous DLQ error structure
    const failedJob = {
      payload: typeof job.payload === "string" ? job.payload : JSON.stringify(job),
      error: originalError.message,
      stack: originalError.stack,
      failedAt: new Date().toISOString(),
      jobState: job, // Include the job state for context
    };
    await redisClient.lpush(QUEUES.DLQ, JSON.stringify(failedJob));
  }

  async pollDelayedJobs() {
    const now = Date.now();

    // Attempting atomic fetch and process using pipelining
    const jobs = await redisClient.zrangebyscore(QUEUES.DELAYED, 0, now);

    if (jobs && jobs.length > 0) {
      const pipeline = redisClient.pipeline();
      jobs.forEach((jobString) => {
        pipeline.lpush(QUEUES.MAIN, jobString);
        pipeline.zrem(QUEUES.DELAYED, jobString);
      });
      await pipeline.exec();
    }
  }
}

export const queueService = new QueueService();
