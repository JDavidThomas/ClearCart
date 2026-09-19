import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function sendHealth(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).end(JSON.stringify(data));
}

router.get("/health", sendHealth);
router.get("/healthz", sendHealth);

export default router;
