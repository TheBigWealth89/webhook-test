import { redisClient } from "../db/connections.js";
import logger from "../utils/logger.js";

const USAGE = `Usage: node scripts/push-bad-job.js [type]
types:
  invalid-json   - push a non-JSON string (default)
  bad-payload    - push JSON that will parse but be missing expected fields
`;

const pushInvalidJson = async () => {
  console.log(
    "Redis client status before push:",
    redisClient && redisClient.status,
  );
  // This will cause JSON.parse to throw an error in the worker
  await redisClient.lpush("webhook_jobs", "this is not json");
  logger.info("Pushed malformed job to webhook_jobs: (invalid JSON)");
};

const pushBadPayload = async () => {
  // This will parse, but may be missing fields the worker expects
  const payload = { not_expected_field: true };
  console.log(
    "Redis client status before push:",
    redisClient && redisClient.status,
  );
  // Note: the worker expects certain fields in the payload, so this may cause it to throw an error when processing
  await redisClient.lpush("webhook_jobs", JSON.stringify(payload));
  logger.info("Pushed malformed job to webhook_jobs: (bad payload)");
};

const main = async () => {
  const type = process.argv[2] || "invalid-json";
  try {
    if (type === "invalid-json") {
      // This will cause JSON.parse to throw an error in the worker
      await pushInvalidJson();
    } else if (type === "bad-payload") {
      await pushBadPayload();
    } else {
      console.log(USAGE);
      process.exit(1);
    }
  } catch (err) {
    logger.error("Failed to push bad job", {
      message: err && err.message,
      stack: err && err.stack,
      redisStatus: redisClient && redisClient.status,
    });
    console.error("Failed to push bad job:", err);
    process.exit(1);
  } finally {
    try {
      await redisClient.quit();
    } catch (_) {}
  }
  process.exit(0);
};

main();
