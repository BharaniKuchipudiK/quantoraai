import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";

import adminMetrics from "./api/admin/metrics.js";
import adminModels from "./api/admin/models.js";
import authLogout from "./api/auth/logout.js";
import authSession from "./api/auth/session.js";
import authVerify from "./api/auth/verify.js";
import autocomplete from "./api/autocomplete.js";
import chat from "./api/chat.js";
import deploy from "./api/deploy.js";
import domains from "./api/domains.js";
import enhance from "./api/enhance.js";
import models from "./api/models.js";
import moderate from "./api/moderate.js";
import pipeline from "./api/pipeline.js";
import productEvent from "./api/product-event.js";

dotenv.config();

type ApiHandler = (req: any, res: any) => unknown | Promise<unknown>;

/**
 * Local/standalone adapter for the same handlers deployed by Vercel.
 * Business, identity, safety, and rate-limit policy lives in api/* only so the
 * development server cannot silently become a second implementation.
 */
async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || "6mb";

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: bodyLimit }));

  const route = (method: "all" | "get" | "post", routePath: string, handler: ApiHandler) => {
    app[method](routePath, (req, res, next) => {
      Promise.resolve(handler(req, res)).catch(next);
    });
  };

  route("all", "/api/auth/verify", authVerify);
  route("all", "/api/auth/session", authSession);
  route("all", "/api/auth/logout", authLogout);
  route("all", "/api/chat", chat);
  route("all", "/api/autocomplete", autocomplete);
  route("all", "/api/enhance", enhance);
  route("all", "/api/domains", domains);
  route("all", "/api/deploy", deploy);
  route("all", "/api/pipeline", pipeline);
  route("all", "/api/moderate", moderate);
  route("all", "/api/models", models);
  route("all", "/api/admin/models", adminModels);
  route("all", "/api/admin/metrics", adminMetrics);
  route("all", "/api/product-event", productEvent);

  // Production rewrites this friendly route to /api/pipeline. Mirror that
  // behavior locally while keeping one implementation of repository preview.
  route("post", "/api/github/preview", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "repository-preview" };
    return pipeline(req, res);
  });
  route("post", "/api/outcomes", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "outcome-state" };
    return pipeline(req, res);
  });

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled API error:", error?.message || error);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

  const serveStatic = process.env.NODE_ENV === "production" && process.env.SERVE_STATIC === "true";
  if (serveStatic) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Quantora listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
