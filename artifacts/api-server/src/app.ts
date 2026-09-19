import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 500;
  const type = typeof error === "object" && error !== null && "type" in error
    ? String((error as { type?: unknown }).type)
    : undefined;

  logger.error({ err: error, method: req.method, url: req.url, status, type }, "Request parsing or route error");
  if (type === "entity.too.large" || status === 413) {
    res.status(413).json({ message: "That photo is too large. Please try a smaller image." });
    return;
  }
  if (!res.headersSent) {
    res.status(500).json({ message: "The server could not process that request." });
    return;
  }
  next(error);
});

export default app;
