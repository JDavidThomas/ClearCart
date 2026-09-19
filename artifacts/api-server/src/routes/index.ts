import { Router, type IRouter } from "express";
import healthRouter from "./health";
import visionRouter from "./vision";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visionRouter);
router.use(authRouter);

export default router;
