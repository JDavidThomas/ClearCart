import app from "./app";
import { logger } from "./lib/logger";
console.log(">>> RENDER IS RUNNING THIS EXACT FILE <<<");
// Use the PORT provided by Replit/the environment, or fall back to 3000
const port = Number(process.env.PORT) || 3000;

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
