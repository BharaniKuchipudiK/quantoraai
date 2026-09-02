import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";

import admin from "./api/admin.js";
import auth from "./api/auth.js";
import autocomplete, { fetchApiGatewayKey } from "./api/autocomplete.js";
import chat from "./api/_lib/chat-handler.js";
import { handleAffordabilityDecision } from "./api/_lib/chat-decision-gateway.js";
import { getSessionUser } from "./api/_lib/session.js";
import {
  routeTravelConversationBody,
  shouldPreferTravelConversationProvider,
} from "./api/_lib/travel-model-routing.js";
import { readByokCredentials } from "./api/_lib/byok-credentials.js";
import { resolveOpenRouterEnvKey } from "./api/_lib/openrouter-key.js";
import deploy from "./api/deploy.js";
import domains from "./api/domains.js";
import enhance from "./api/enhance.js";
import generateOffice from "./api/generate-office.js";
import models from "./api/models.js";
import pipeline from "./api/pipeline.js";
import studyEvidence from "./api/study-evidence.js";
import studyAssessment from "./api/study-assessment.js";
import qirRuns from "./api/qir-runs.js";

dotenv.config();

type ApiHandler = (req: any, res: any) => unknown | Promise<unknown>;

/**
 * Local/standalone adapter for the same handlers deployed by Vercel.
 * Business, identity, safety, rate-limit and Office compilation policy lives in
 * api/* only so development cannot silently become a second implementation.
 */
async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || "6mb";

  const httpServer = http.createServer(app);

  // Pillar 3: Continuous Voice / Gemini Live WebSocket Bridge
  const wss = new WebSocketServer({ server: httpServer, path: "/api/live" });
  wss.on('connection', async (ws, req) => {
    console.log("Client connected to /api/live WebSocket");
    
    const geminiKey = process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI');
    if (!geminiKey) {
       console.error("No Gemini API key found for Voice mode");
       ws.close();
       return;
    }
    
    // Auth via header — never put the API key in the WebSocket URL (logs/proxies).
    const liveUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";
    const geminiWs = new WebSocket(liveUrl, {
      headers: {
        "x-goog-api-key": geminiKey,
      },
    });
    
    ws.on('message', (message) => {
       if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(message);
       }
    });
    
    geminiWs.on('message', (message) => {
       if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
       }
    });

    geminiWs.on('error', (error) => {
      console.error("Gemini Live upstream WebSocket error:", error?.message || error);
      try { ws.close(); } catch { /* ignore */ }
    });

    ws.on('close', () => geminiWs.close());
    geminiWs.on('close', () => ws.close());
  });

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: bodyLimit }));

  const route = (method: "all" | "get" | "post", routePath: string, handler: ApiHandler) => {
    app[method](routePath, (req, res, next) => {
      Promise.resolve(handler(req, res)).catch(next);
    });
  };

  route("all", "/api/auth/verify", (req, res) => {
    req.query = { ...(req.query || {}), route: "verify" };
    return auth(req, res);
  });
  route("all", "/api/auth/session", (req, res) => {
    req.query = { ...(req.query || {}), route: "session" };
    return auth(req, res);
  });
  route("all", "/api/auth/logout", (req, res) => {
    req.query = { ...(req.query || {}), route: "logout" };
    return auth(req, res);
  });
  route("all", "/api/auth/signup", (req, res) => {
    req.query = { ...(req.query || {}), route: "signup" };
    return auth(req, res);
  });
  route("all", "/api/auth/login", (req, res) => {
    req.query = { ...(req.query || {}), route: "login" };
    return auth(req, res);
  });
  route("all", "/api/auth/password-reset-request", (req, res) => {
    req.query = { ...(req.query || {}), route: "password-reset-request" };
    return auth(req, res);
  });
  route("all", "/api/auth/password-reset-confirm", (req, res) => {
    req.query = { ...(req.query || {}), route: "password-reset-confirm" };
    return auth(req, res);
  });
  route("all", "/api/auth/github", (req, res) => {
    req.query = { ...(req.query || {}), route: "github" };
    return auth(req, res);
  });
  route("all", "/api/auth/github/callback", (req, res) => {
    req.query = { ...(req.query || {}), route: "github-callback" };
    return auth(req, res);
  });
  route("all", "/api/auth/desktop/grant", (req, res) => {
    req.query = { ...(req.query || {}), route: "desktop-grant" };
    return auth(req, res);
  });
  route("all", "/api/auth/desktop/exchange", (req, res) => {
    req.query = { ...(req.query || {}), route: "desktop-exchange" };
    return auth(req, res);
  });
  route("all", "/api/chat", async (req, res) => {
    if (await handleAffordabilityDecision(req, res)) return;

    // Mirror pipeline?route=chat Travel preamble so local Express matches Vercel.
    if (shouldPreferTravelConversationProvider(req.body, {
      hasGeminiByok: Boolean(readByokCredentials(req).gemini),
    })) {
      const signedIn = Boolean(getSessionUser(req));
      const byok = readByokCredentials(req);
      let openRouterAvailable = Boolean(byok.openRouter || (signedIn && resolveOpenRouterEnvKey()));
      if (!openRouterAvailable && signedIn) {
        try {
          openRouterAvailable = Boolean(await fetchApiGatewayKey("OPENROUTER"));
        } catch (error: any) {
          console.warn("Travel provider routing could not resolve OpenRouter availability:", error?.message || error);
        }
      }
      if (openRouterAvailable) {
        req.body = routeTravelConversationBody(req.body);
      }
    }

    return chat(req, res);
  });
  route("all", "/api/autocomplete", autocomplete);
  route("all", "/api/enhance", enhance);
  route("all", "/api/generate-office", generateOffice);
  route("all", "/api/domains", domains);
  // Health rides on domains, not pipeline, so it stays alive when the
  // pipeline mega-function is the thing that is down. Mirrors vercel.json.
  route("get", "/api/inference-health", (req, res) => {
    req.query = { ...(req.query || {}), route: "inference-health" };
    return domains(req, res);
  });
  route("all", "/api/deploy", deploy);
  route("all", "/api/pipeline", pipeline);
  route("all", "/api/moderate", (req, res) => {
    req.query = { ...(req.query || {}), route: "moderate" };
    return pipeline(req, res);
  });
  route("all", "/api/models", models);
  route("all", "/api/study-evidence", studyEvidence);
  route("all", "/api/study-assessment", studyAssessment);
  route("all", "/api/qir-runs", qirRuns);
  route("all", "/api/admin/models", (req, res) => {
    req.query = { ...(req.query || {}), route: "models" };
    return admin(req, res);
  });
  route("all", "/api/admin/metrics", (req, res) => {
    req.query = { ...(req.query || {}), route: "metrics" };
    return admin(req, res);
  });
  route("all", "/api/admin/feedback", (req, res) => {
    req.query = { ...(req.query || {}), route: "feedback" };
    return admin(req, res);
  });
  route("all", "/api/product-event", (req, res) => {
    req.query = { ...(req.query || {}), route: "product-event" };
    return pipeline(req, res);
  });
  route("all", "/api/travel-search", (req, res) => {
    req.query = { ...(req.query || {}), route: "travel-search" };
    return pipeline(req, res);
  });
  route("post", "/api/trace", (req, res) => {
    req.query = { ...(req.query || {}), route: "trace" };
    return pipeline(req, res);
  });

  // Production rewrites these friendly routes to /api/pipeline. Mirror that
  // behavior locally while keeping one implementation and one function budget.
  route("post", "/api/github/preview", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "repository-preview" };
    return pipeline(req, res);
  });
  // Legacy Studio Import Repository path — same read-only context import.
  route("post", "/api/github/fetch-repo", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "repository-preview" };
    return pipeline(req, res);
  });
  route("post", "/api/github/create-pr", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "github-create-pr" };
    return pipeline(req, res);
  });
  route("post", "/api/github/merge-pr", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "github-merge-pr" };
    return pipeline(req, res);
  });
  route("post", "/api/outcomes", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "outcome-state" };
    return pipeline(req, res);
  });
  route("post", "/api/projects", (req, res) => {
    req.body = { ...(req.body || {}), targetStage: "project-state" };
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

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Quantora listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
