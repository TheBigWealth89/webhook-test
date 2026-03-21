import logger from "./logger.js";

class RetryLogic {
  constructor(options = {}) {
    this.baseDelayMs = options.baseDelayMs || 1000;
  }

  calculateDelay(retryCount) {
    // Exponential backoff: baseDelay * 2^retryCount
    return this.baseDelayMs * Math.pow(2, retryCount);
  }

  async handleFailure(job, error, queueService) {
    job.retryCount = (job.retryCount || 0) + 1;
    job.error = error.message;
    const maxRetries = job.maxRetries || 5;

    if (job.retryCount <= maxRetries) {
      // e.g., retryCount=1 -> 1000ms, retryCount=2 -> 2000ms
      const delayMs = this.calculateDelay(job.retryCount - 1);
      logger.info(
        `[RetryLogic] Job failed. Retrying in ${delayMs}ms (Attempt ${job.retryCount}/${maxRetries}). Error: ${error.message}`
      );
      await queueService.scheduleRetry(job, delayMs);
    } else {
      logger.error(
        `[RetryLogic] Job exceeded max retries (${maxRetries}). Sending to DLQ. Error: ${error.message}`
      );
      await queueService.sendToDlq(job, error);
    }
  }
}

export const retryLogic = new RetryLogic();
