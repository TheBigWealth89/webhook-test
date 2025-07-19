import express from "express";
import dotenv from "dotenv";
import redisService from "../service/redis.service.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const PORT = process.env.DASHBOARD_PORT || 7001;
await redisService.connect();

// Set up EJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files (CSS) 
app.use(express.static(path.join(__dirname, "public")));

// Parse form submissions
app.use(express.urlencoded({ extended: true }));

// Dashboard route
app.get("/dashboard", async (req, res) => {
  try {
    const length = await redisService.client.lLen("dead_letter_queue");
    const jobs = await redisService.client.lRange("dead_letter_queue", 0, -1);
    const jobDetails = jobs.map((jobString, index) => {
      try {
        const jobData = JSON.parse(jobString);
        // It's an enriched object, return its details
        return {
          index,
          payload: JSON.stringify(jobData.payload, null, 2), // Print the inner payload
          error: jobData.error,
          failedAt: jobData.failedAt,
        };
      } catch (e) {
        // It's just a raw string, not enriched object
        return {
          index,
          payload: jobString,
          error: "This job is not a structured error object.",
          failedAt: "N/A",
        };
      }
    });
    res.render("dashboard", { jobs: jobDetails, queueLength: length });
  } catch (error) {
    res.status(500).send(`Error fetching dead_letter_queue: ${error.message}`);
  }
});

// Retry job route
app.post("/retry-job/:index", async (req, res) => {
  const index = parseInt(req.params.index, 10);
  try {
    const length = await redisService.client.lLen("dead_letter_queue");
    if (isNaN(index) || index < 0 || index >= length) {
      return res.status(400).send(`Invalid job index: ${index}`);
    }

    //Get the job's value at the index
    const jobs = await redisService.client.lRange(
      "dead_letter_queue",
      index,
      index
    );
    if (!jobs || jobs.length === 0) {
      return res.status(404).send(`No job found at index: ${index}`);
    }
    const jobToRetry = jobs[0];

    // Use a transaction to ensure the job is moved and removed atomically.
    const multi = redisService.client.multi();
    multi.lPush("webhook_jobs", jobToRetry); // Add to main queue
    multi.lRem("dead_letter_queue", 1, jobToRetry); // Remove from DLQ
    await multi.exec(); // Execute atomically

    logger.info(`Retried job from DLQ index ${index} via dashboard.`);
    res.redirect("/dashboard");
  } catch (error) {
    logger.error("Error retrying job from dashboard:", {
      error: error.message,
    });
    res.status(500).send(`Error retrying job: ${error.message}`);
  }
});

(async () => {
  try {
    console.log("✅ Redis connected for dashboard");
    app.listen(PORT, () => {
      console.log(`✅ Dashboard running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start dashboard:", error.message);
    process.exit(1);
  }
})();
