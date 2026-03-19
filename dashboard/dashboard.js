import express from "express";
import dotenv from "dotenv";
import { redisClient } from "../db/connections.js";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

dotenv.config();
const app = express();
const PORT = process.env.DASHBOARD_PORT || 7001;

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
    const pageSize = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const length = await redisClient.llen("dead_letter_queue");
    const totalPages = Math.max(1, Math.ceil(length / pageSize));

    // Calculate start/end indexes for redis lrange (0-based list)
    const start = (page - 1) * pageSize;
    const end = Math.min(length - 1, start + pageSize - 1);

    const jobs =
      start <= end
        ? await redisClient.lrange("dead_letter_queue", start, end)
        : [];

    const jobDetails = jobs.map((jobString, idx) => {
      const index = start + idx; // global index in the list
      try {
        const jobData = JSON.parse(jobString);
        return {
          index,
          payload: jobData.payload, // keep as object for JSON.stringify in the view
          error: jobData.error,
          failedAt: jobData.failedAt,
        };
      } catch (e) {
        return {
          index,
          payload: jobString,
          error: "This job is not a structured error object.",
          failedAt: "N/A",
        };
      }
    });

    res.render("dashboard", {
      jobs: jobDetails,
      queueLength: length,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    res.status(500).send(`Error fetching dead_letter_queue: ${error.message}`);
  }
});

// Retry job route
app.post("/retry-job/:index", async (req, res) => {
  const index = parseInt(req.params.index, 10);
  try {
    const length = await redisClient.llen("dead_letter_queue");
    if (isNaN(index) || index < 0 || index >= length) {
      return res.status(400).send(`Invalid job index: ${index}`);
    }

    //Get the job's value at the index
    const jobs = await redisClient.lrange("dead_letter_queue", index, index);
    if (!jobs || jobs.length === 0) {
      return res.status(404).send(`No job found at index: ${index}`);
    }
    const jobToRetry = jobs[0];

    // Use a transaction to ensure the job is moved and removed atomically.
    const multi = redisClient.multi();
    multi.lpush("webhook_jobs", jobToRetry); // Add to main queue
    multi.lrem("dead_letter_queue", 1, jobToRetry); // Remove from DLQ
    await multi.exec(); // Execute atomically

    logger.info(`Retried job from DLQ index ${index} via dashboard.`);
    res.redirect(`/dashboard?page=${req.query.page || 1}`);
  } catch (error) {
    logger.error("Error retrying job from dashboard:", {
      error: error.message,
    });
    res.status(500).send(`Error retrying job: ${error.message}`);
  }
});

(async () => {
  try {
    app.listen(PORT, () => {
      console.log(`Dashboard running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start dashboard:", error.message);
    process.exit(1);
  }
})();
