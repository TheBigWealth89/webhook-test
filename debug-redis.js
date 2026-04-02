import { redisClient, connectToRedis } from "./db/connections.js";

const debug = async () => {
  try {
    console.log("DEBUG: Initializing Redis...");
    await connectToRedis();
    console.log("DEBUG: Connected. Fetching queue lengths...");
    
    const mainLen = await redisClient.llen("webhook_jobs");
    const delayedLen = await redisClient.zcard("delayed_webhook_jobs");
    const dlqLen = await redisClient.llen("dead_letter_queue");
    
    process.stdout.write(`
--- Redis Debug Info ---
Status: ${redisClient.status}
webhook_jobs: ${mainLen}
delayed_webhook_jobs: ${delayedLen}
dead_letter_queue: ${dlqLen}
------------------------
`);
    
    if (dlqLen > 0) {
      const items = await redisClient.lrange("dead_letter_queue", 0, -1);
      console.log("DLQ Items:", items);
    }
  } catch (err) {
    process.stderr.write(`Debug script failed: ${err.stack}\n`);
  } finally {
    await redisClient.quit();
    process.exit(0);
  }
};

debug();
