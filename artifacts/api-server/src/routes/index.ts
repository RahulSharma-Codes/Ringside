import { Router, type IRouter } from "express";
import healthRouter from "./health";
import targetsRouter from "./targets";
import actionsRouter from "./actions";
import interactionsRouter from "./interactions";
import importRouter from "./import";
import aiRouter from "./ai";
import reviewRouter from "./review";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/targets", targetsRouter);
router.use("/actions", actionsRouter);
router.use("/interactions", interactionsRouter);
router.use("/import", importRouter);
router.use("/ai", aiRouter);
router.use("/review", reviewRouter);

export default router;

