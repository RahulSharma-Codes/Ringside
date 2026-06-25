import { Router, type IRouter } from "express";
import healthRouter from "./health";
import targetsRouter from "./targets";
import actionsRouter from "./actions";
import interactionsRouter from "./interactions";
import importRouter from "./import";
import aiRouter from "./ai";
import reviewRouter from "./review";
import diligenceRouter from "./diligence";
import documentsRouter from "./documents";
import icSessionsRouter from "./ic-sessions";
import analyticsRouter from "./analytics";
import valuationsRouter from "./valuations";
import synergiesRouter from "./synergies";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/export", exportRouter);
router.use("/targets", targetsRouter);
router.use("/actions", actionsRouter);
router.use("/interactions", interactionsRouter);
router.use("/import", importRouter);
router.use("/ai", aiRouter);
router.use("/review", reviewRouter);
router.use("/diligence", diligenceRouter);
router.use("/documents", documentsRouter);
router.use("/ic-sessions", icSessionsRouter);
router.use("/analytics", analyticsRouter);
router.use("/valuations", valuationsRouter);
router.use("/synergies", synergiesRouter);

export default router;

