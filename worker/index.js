import redisService from "../service/redis.service.js";
import logger from "../utils/logger.js";
const startWorker = async () => {
  await redisService.connect();
  console.log("✅ Worker started, waiting for jobs...");
  while (true) {
    try {
      // Block until a job is available
      const job = await redisService.client.brPop("webhook_jobs", 0);
      logger.info("Incoming jobs:", job.element)
      const payload = JSON.parse(job.element);
      logger.info("Processing webhook payload:", payload);
      logger.info("Event:", payload.action || "unknown");
    } catch (error) {
      logger.error("Error processing job:", error);
      await redisService.client.lPush("dead_letter_queue", job.element);
    }
  }
};

startWorker().catch((error) => {
  logger.error("Worker failed to start:", error);
  process.exit(1);
});
