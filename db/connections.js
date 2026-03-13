import redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redisClient = new redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // rejectUnauthorized is not a valid option at this level, move to tls
  //   tls: redisUrl.startsWith("rediss://")
  //     ? { rejectUnauthorized: false }
  //     : undefined,
});

redisClient.on("connect", () =>
  console.log("✅ Redis status:", redisClient.status),
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
      console.log(" Waiting for Redis connection...");
    }
    console.log("✅ Connected to Redis successfully:", redisClient.status);
    isConnected = true;
  } catch (err) {
    isConnected = false;
    console.error("❌ Failed to connect to Redis ", err);
  }
};
