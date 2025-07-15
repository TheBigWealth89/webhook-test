import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
const PORT = 7000;
app.post("/api/webhooks/github", (req, res) => {
  console.log("🔔 Webhook received from GitHub!");
  console.log("Event:", req.headers["x-github-event"]);
  console.log("Payload:", req.body);

  res.status(200).send("Webhook received!");
});
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
