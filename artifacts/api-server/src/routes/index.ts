import { Router, type IRouter } from "express";
import healthRouter from "./health";
import visionRouter from "./vision";
import authRouter from "./auth";
import fsisRouter from "./fsis";
import fdaRouter from "./fda";
import newsRouter from "./news";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visionRouter);
router.use(fsisRouter);
router.use(fdaRouter);
router.use(newsRouter);
router.use(authRouter);

export default router;
