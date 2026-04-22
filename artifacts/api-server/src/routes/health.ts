import { Router, type IRouter } from "express";
import { isMongoHealthy } from "../lib/mongo";
import { isRedisHealthy } from "../lib/queue";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const mongoOk = isMongoHealthy();
  const redisOk = await isRedisHealthy();
  const ok = mongoOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    checks: { mongo: mongoOk, redis: redisOk },
  });
});

export default router;
