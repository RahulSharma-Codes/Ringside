import { Router, type IRouter } from "express";
import healthRouter from "./health";
import targetsRouter from "./targets";
import actionsRouter from "./actions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/targets", targetsRouter);
router.use("/actions", actionsRouter);

export default router;
