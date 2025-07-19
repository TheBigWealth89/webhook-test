import redisService from "../service/redis.service.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import logger from "../utils/logger.js";

await redisService.connect();
const argv = yargs(hideBin(process.argv))
  .option("view", {
    type: "boolean",
    description: "View contents of dead_letter_queue",
  })
  .option("retry", {
    type: "number",
    description: "Retry a specific job by index (0-based)",
  })
  .option("flush", {
    type: "boolean",
    description: "Delete all jobs from dead_letter_queue",
  })
  .check((argv) => {
    const options = ["view", "retry", "flush"];
    const selected = options.filter((opt) => argv[opt]);
    if (selected.length !== 1) {
      throw new Error(
        "Exactly one of --view, --retry, or --flush must be provided"
      );
    }
    return true;
  })
  .parse();

const inspectDeadLetterQueue = async () => {
  try {
    const length = await redisService.client.lLen("dead_letter_queue");
    console.log("✅ Worker started, waiting for jobs...");
    if (argv.view) {
      if (length === 0) {
        console.log("No items in dead_letter_queue");
        return;
      }
      const items = await redisService.client.lRange(
        "dead_letter_queue",
        0,
        -1
      );
      console.log("Dead letter queue contents:");
      items.forEach((item, index) => {
        try {
          const payload = JSON.parse(item);
          console.log(`Item ${index}:`, payload);
        } catch (error) {
          console.log(`Item ${index} (failed to parse):`, item);
        }
      });
    } else if (argv.retry !== undefined) {
      if (length === 0) {
        console.log("Error: dead_letter_queue is empty");
        return;
      }
      if (argv.retry < 0 || argv.retry >= length) {
        console.log(
          `Error: Invalid job index ${argv.retry}. Must be between 0 and ${
            length - 1
          }`
        );
        return;
      }
      // Pop the job at the specific index
      const items = await redisService.client.lRange(
        "dead_letter_queue",
        argv.retry,
        argv.retry
      );

      if (!items || items.length === 0) {
        console.log(`Error: No job found at index ${argv.retry}`);
        return;
      }

      const jobToRetry = items[0];

      // Use a transaction to ensure the job is moved and removed atomically.
      console.log(`Attempting to retry job:`, jobToRetry);

      const multi = redisService.client.multi();

      //Push the job back to the main queue.
      multi.lPush("webhook_jobs", jobToRetry);

      //Remove exactly 1 instance of that job from the DLQ.
      multi.lRem("dead_letter_queue", 1, jobToRetry);

      const transactionResult = await multi.exec();

      if (transactionResult) {
        console.log(`✅ Job at index ${argv.retry} successfully retried.`);
      } else {
        console.error(
          `❌ Transaction failed. Job at index ${argv.retry} was not retried.`
        );
      }
    } else if (argv.flush) {
      console.log(
        "WARNING: This will delete all jobs in dead_letter_queue. Confirm? (y/N)"
      );
      const stdin = process.openStdin();
      stdin.addListener("data", async (data) => {
        if (data.toString().trim().toLowerCase() === "y") {
          await redisService.client.del("dead_letter_queue");
          console.log("dead_letter_queue flushed successfully");
        } else {
          console.log("Flush cancelled");
        }
        stdin.destroy();
        // await redisService.client.quit();
        process.exit(0);
      });
      return; // Exit early to wait for user input
    }
  } catch (error) {
    logger.error("Error managing dead_letter_queue:", error.message);
  }
};

inspectDeadLetterQueue().catch((error) => {
  logger.error("Failed to run inspect-dead-queue:", error.message);
  process.exit(1);
});
