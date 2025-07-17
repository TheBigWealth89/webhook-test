import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import redisService from "../service/redis.service.js";
import logger from "../utils/logger.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 7000;

//Capture the raw body for verification
app.use(
  express.raw({
    type: "application/json",
    verify: (req, res, buf) => {
      // Store the raw buffer on the request object
      req.rawBody = buf;
    },
  })
);

app.use(express.json());

// Verify GitHub webhook signature
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    return res.status(401).send("Missing X-Hub-Signature-256 header");
  }

  const hmac = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET || "");
    const digest = `sha256=${hmac.update(req.rawBody).digest("hex")}`;

  //Compares the two signatures in a way that prevents timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    logger.warn("Invalid webhook signature received.");
    return res.status(401).send("Invalid webhook signature");
  }
  next();
};

//Health check
app.get("/", (req, res) => {
  res.send("Webhook processor is running");
});

app.post("/api/webhooks/github", verifyWebhookSignature, async (req, res) => {
  try {
    // const payload = process.env.TEST_INVALID_JSON
    //   ? "invalid-json"
    //   : JSON.stringify(req.body);

      const payloadString = req.body.toString('utf8');

    await redisService.client.lPush("webhook_jobs", payloadString);
    logger.info("🔔 Webhook queued:", req.headers["x-github-event"]);
    res.status(202).send("Webhook queued for processing");
  } catch (error) {
    logger.error("Error queuing webhook:", error);
    res.status(500).send("Failed to queue webhook");
  }
});
(async () => {
  await redisService.connect();
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
})();
