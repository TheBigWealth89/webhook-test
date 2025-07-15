import redisService from "../service/redis.service.js";
const startWorker = async () => {
  await redisService.connect();
  console.log("✅ Worker started, waiting for jobs...");
  while (true) {
    try {
      // Block until a job is available
      const job = await redisService.client.brPop("webhook_jobs", 0);
      const payload = JSON.parse(job.element);
      console.log("Processing webhook payload:", payload);
      console.log("Event:", payload.action || "unknown");
    } catch (error) {
      console.error("Error processing job:", error);
    }
  }
};

startWorker().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
