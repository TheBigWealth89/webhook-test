import winston from "winston";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Recreate __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Logs will go in logs/ directory relative to this file
const logDir = join(__dirname, "..", "..", "logs");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.prettyPrint()
  ),
  transports: [
    new winston.transports.File({ filename: `${logDir}/error.log`, level: "error" }),
    new winston.transports.File({ filename: `${logDir}/combined.log` }),
  ],
});

export default logger;
