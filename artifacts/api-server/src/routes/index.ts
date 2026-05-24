import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import profileRouter from "./profile";
import sankalpRouter from "./sankalp";
import jaapRouter from "./jaap";
import dashboardRouter from "./dashboard";
import leaderboardRouter from "./leaderboard";
import payoutsRouter from "./payouts";
import adminRouter from "./admin";
import mantrasRouter from "./mantras";
import yajamanaRouter from "./yajamanas";
import patronSankalpsRouter from "./patron-sankalps";
import settingsRouter from "./settings";
import nijJaapRouter from "./nij-jaap";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(sankalpRouter);
router.use(jaapRouter);
router.use(dashboardRouter);
router.use(leaderboardRouter);
router.use(payoutsRouter);
router.use(adminRouter);
router.use(mantrasRouter);
router.use(yajamanaRouter);
router.use(patronSankalpsRouter);
router.use(settingsRouter);
router.use(nijJaapRouter);

export default router;
