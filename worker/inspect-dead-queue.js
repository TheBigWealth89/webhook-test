import redisService from "../service/redis.service.js";
import logger from "../utils/logger.js";

const inspectDeadLetterQueue = async () => {
  await redisService.connect();
  logger.info("Inspecting dead_letter_queue...");

  try {
    // Get queue length
    const length = await redisService.client.lLen("dead_letter_queue");
    logger.info(`Dead letter queue length: ${length}`);

    // Get all items
    const items = await redisService.client.lRange("dead_letter_queue", 0, -1);
    if (items.length === 0) {
      logger.info("No items in dead_letter_queue");
      return;
    }

    logger.info("Dead letter queue contents:");
    items.forEach((item, index) => {
      try {
        const payload = JSON.parse(item);
        logger.log(`Item ${index + 1}:`, payload);
      } catch (error) {
        logger.error(`Item ${index + 1} (failed to parse):`, item);
      }
    });
  } catch (error) {
    logger.error("Error inspecting dead_letter_queue:", error);
  } finally {
    await redisService.client.quit();
  }
};

inspectDeadLetterQueue().catch((error) => {
  logger.error("Failed to inspect queue:", error);
  process.exit(1);
});
