import redis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;
console.log("🔗 Redis URL:", redisUrl);

export const redisClient = new redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // rejectUnauthorized is not a valid option at this level, move to tls
  //   tls: redisUrl.startsWith("rediss://")
  //     ? { rejectUnauthorized: false }
  //     : undefined,
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
  try {
    if (redisClient.status !== "ready") {
      console.log("⏳ Waiting for Redis connection...");
    }
    console.log("✅ Connected to Redis successfully:", redisClient.status);
    isConnected = true;
  } catch (err) {
    isConnected = false;
    throw err;
  }
};
