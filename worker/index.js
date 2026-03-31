import logger from "../utils/logger.js";
import { queueService } from "../utils/queueService.js";
import { retryLogic } from "../utils/retryLogic.js";

const pollDelayedQueue = () => {
  setInterval(async () => {
    try {
      await queueService.pollDelayedJobs();
    } catch (error) {
      logger.error("Error polling delayed jobs:", error);
    }
  }, 1000);
};

const startWorker = async () => {
  logger.info("Worker started, waiting for jobs...");

  // Start polling delayed jobs in the background concurrently
  pollDelayedQueue();

  // Infinite loop to continuously process jobs
  while (true) {
    let jobData = null;
    let parsedPayload = null;

    try {
      // Block until a job is available
      const rawJobString = await queueService.getNextJob(0);
      if (!rawJobString) continue;

      logger.info("Attempting to parse job value:", { value: rawJobString });
      console.log("Attempting to parse job value:", { value: rawJobString });

      // First, parse the top-level string.
      // This is either our new wrapped job from API,n or raw JSON from scripts.
      let rawData;
      try {
        rawData = JSON.parse(rawJobString);
      } catch (parseErr) {
        // We want this error handled by the generic catch block
        // However, if we can't parse it, we can't wrap it reliably.
        jobData = { payload: rawJobString, retryCount: 0, maxRetries: 5 };
        throw new Error(`Failed to parse top-level job JSON: ${parseErr.message}`);
      }

      // Check for wrapping (it's wrapped if retryCount is present)
      const isWrapped = rawData && rawData.retryCount !== undefined;

      // Construct a standardized jobData object
      jobData = isWrapped
        ? rawData
        : {
          payload: rawData, // It was an unwrapped payload (like from the push bad job script)
          retryCount: 0,
          maxRetries: 5,
        };

      // Extract the actual inner payload (API sends it as a stringified JSON body)
      parsedPayload =
        typeof jobData.payload === "string"
          ? JSON.parse(jobData.payload)
          : jobData.payload;

      logger.info("Processing webhook payload:", parsedPayload);
      logger.info("Event:", parsedPayload.action || "unknown");
      console.log("Event:", parsedPayload.action || "unknown");

      // FOR TESTING PURPOSES ONLY: Simulate process failure if `bad-payload` test script was used
      if (parsedPayload && parsedPayload.not_expected_field) {
        throw new Error("Missing expected fields in payload!");
      }

      // Normally we would save to DB or do some complex work here.
    } catch (error) {
      logger.error("Error processing job:", error.message);
      console.log("Error processing job:", error.message);

      if (jobData) {
        try {
          // Delegate failure tracking directly to our pure retryLogic helper
          await retryLogic.handleFailure(jobData, error, queueService);
        } catch (retryError) {
          logger.error("!!! CRITICAL: FAILED TO ROUTE FAILURE TO RETRY/DLQ !!!", {
            originalError: error.message,
            retryError: retryError.message,
          });
          console.error("!!! CRITICAL: FAILED TO ROUTE FAILURE TO RETRY/DLQ !!!", {
            originalError: error.message,
            retryError: retryError.message,
          });
        }
      } else {
        logger.error("Could not handle failure because job data was unexpectedly null.");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
};

startWorker().catch((error) => {
  logger.error("Worker failed to start:", error);
  process.exit(1);
});
