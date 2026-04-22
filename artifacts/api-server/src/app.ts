import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

// Top-level healthz (for Kubernetes liveness/readiness probes)
app.use(healthRouter);
// Also expose under /api for the Replit proxy and frontend
app.use("/api", healthRouter);

app.use("/api", router);

// In production, also serve the built React frontend from the same process so
// the whole app can deploy to a single port (required for Autoscale / Cloud Run).
// The Vite build is emitted to artifacts/web/dist/public and copied alongside
// the api-server bundle in production.
if (process.env["NODE_ENV"] === "production") {
  const candidates = [
    path.resolve(process.cwd(), "artifacts/web/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public"),
  ];
  const webRoot = candidates.find((p) => existsSync(p));
  if (webRoot) {
    logger.info({ webRoot }, "Serving static frontend");
    app.use(
      express.static(webRoot, {
        index: false,
        maxAge: "1y",
        setHeaders(res, filePath) {
          if (filePath.endsWith("index.html")) {
            res.setHeader("Cache-Control", "no-store");
          }
        },
      }),
    );
    // SPA fallback: any non-/api route returns index.html so client-side
    // routing (e.g. /auth) works on direct loads and refreshes.
    app.get(/^\/(?!api\/|healthz$).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(webRoot, "index.html"));
    });
  } else {
    logger.warn({ candidates }, "No built frontend found; only API is served");
  }
}

export default app;
