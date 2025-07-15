import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 7000;

app.use(express.json());

// Verify GitHub webhook signature
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    return res.status(401).send("Missing X-Hub-Signature-256 header");
  }

  const hmac = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET || "");
  const digest = `sha256=${hmac
    .update(JSON.stringify(req.body))
    .digest("hex")}`;
  if (signature !== digest) {
    return res.status(401).send("Invalid webhook signature");
  }
  next();
};

//Health check
app.get("/", (req, res) => {
  res.send("Webhook processor is running");
});

app.post("/api/webhooks/github", verifyWebhookSignature, (req, res) => {
  console.log("🔔 Webhook received from GitHub!");
  console.log("Event:", req.headers["x-github-event"]);
  console.log("Payload:", req.body);

  res.status(200).send("Webhook received!");
});
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
