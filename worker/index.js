import { redisClient } from "../db/connections.js";
import logger from "../utils/logger.js";

const startWorker = async () => {
  logger.info("Worker started, waiting for jobs...");

  // Infinite loop to continuously process jobs
  while (true) {
    let job = null;
    try {
      // Block until a job is available
      job = await redisClient.brpop("webhook_jobs", 0);
      logger.info("Raw job", job);
      logger.info("Attempting to parse job value:", { value: job[1] });
      const payload = JSON.parse(job[1]);
      //I'll add database later
      logger.info("Processing webhook payload:", payload);
      logger.info("Event:", payload.action || "unknown");
    } catch (error) {
      logger.error("Error processing job:", error.message);

      if (job) {
        try {
          const failedJob = {
            payload: job[1],
            error: error.message, // The reason it failed!
            stack: error.stack, // The full error stack for deep debugging
            failedAt: new Date().toISOString(), // When it failed
          };
          await redisClient.lpush(
            "dead_letter_queue",
            JSON.stringify(failedJob),
          );
          logger.info("Pushed to dead_letter_queue:", failedJob);
        } catch (dlqError) {
          logger.error("!!! CRITICAL: FAILED TO PUSH TO DLQ !!!", {
            originalError: error.message,
            dlqError: dlqError.message,
            jobValue: job[1],
          });
        }
      } else {
        logger.error("Could not push to DLQ because job was null.");
      }
    }
  }
};

startWorker().catch((error) => {
  logger.error("Worker failed to start:", error);
  process.exit(1);
});
