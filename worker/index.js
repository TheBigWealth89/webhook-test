import redisService from "../service/redis.service.js";
import logger from "../utils/logger.js";
const startWorker = async () => {
  await redisService.connect();
  console.log("✅ Worker started, waiting for jobs...");
  while (true) {
    let job = null
    try {
      // Block until a job is available
       job = await redisService.client.brPop("webhook_jobs", 0);
      console.log("Raw job", job)
      logger.info("Raw job", job)
       logger.info("Attempting to parse job.element:", { element: job.element });
      const payload = JSON.parse(job.element);
      logger.info("Processing webhook payload:", payload);
      logger.info("Event:", payload.action || "unknown");
    } catch (error) {
      logger.error("Error processing job:", error);
      await redisService.client.lPush("dead_letter_queue", job.element);
      logger.info("Pushed to dead_letter_queue:", { element: job.element });
    }
  }
};

startWorker().catch((error) => {
  logger.error("Worker failed to start:", error);
  process.exit(1);
});
