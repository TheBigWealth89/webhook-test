import redis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;
console.log("🔗 Redis URL:", redisUrl);

export const redisClient = new redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // rejectUnauthorized is not a valid option at this level, move to tls
  tls: (redisUrl && redisUrl.startsWith("rediss://"))
    ? { rejectUnauthorized: false }
    : undefined,
});

redisClient.on("connect", () =>
  console.log("connecting to Redis at", redisUrl),
);
redisClient.on("ready", () => console.log("✅ Redis client is ready to use"));
redisClient.on("end", () => console.warn("🔌 Redis connection closed"));
redisClient.on("error", (err) => console.error("❌ Redis Error:", err));

// Central connection management for Redis
let isConnected = false;
export const connectToRedis = async () => {
  if (isConnected) return;

  if (redisClient.status === "ready") {
    isConnected = true;
    return;
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      console.log("✅ Redis client is ready to use");
      isConnected = true;
      redisClient.removeListener("error", onError);
      resolve();
    };

    const onError = (err) => {
      console.error("❌ Redis initial connection error:", err);
      // Wait for ioredis to handle its own retries unless it's a fatal error
    };

    redisClient.once("ready", onReady);
    redisClient.on("error", onError);

    // If status is already connecting, just wait
    if (redisClient.status !== "ready") {
      console.log("⏳ Waiting for Redis connection... current status:", redisClient.status);
    }

    // Set a timeout for initial connection
    setTimeout(() => {
      if (!isConnected) {
        redisClient.removeListener("ready", onReady);
        redisClient.removeListener("error", onError);
        reject(new Error("Redis connection timeout"));
      }
    }, 10000);
  });
};
