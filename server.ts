import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";

import adminMetrics from "./api/admin/metrics.js";
import adminModels from "./api/admin/models.js";
import authLogout from "./api/auth/logout.js";
import authSession from "./api/auth/session.js";
import authVerify from "./api/auth/verify.js";
import autocomplete from "./api/autocomplete.js";
import chat from "./api/chat.js";
import { handleAffordabilityDecision } from "./api/_lib/chat-decision-gateway.js";
import deploy from "./api/deploy.js";
import domains from "./api/domains.js";
import enhance from "./api/enhance.js";
import generateOffice from "./api/generate-office.js";
import models from "./api/models.js";
import moderate from "./api/moderate.js";
import pipeline from "./api/pipeline.js";
import productEvent from "./api/product-event.js";

dotenv.config();

type ApiHandler = (req: any, res: any) => unknown | Promise<unknown>;

async function fetchApiGatewayKey(providerName: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    
    const res = await fetch(`${supabaseUrl}/rest/v1/api_gateway_keys?provider=eq.${providerName}&select=api_key`, {
       headers: {
         'apikey': supabaseKey,
         'Authorization': `Bearer ${supabaseKey}`
       }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) return data[0].api_key;
    return null;
  } catch(e) {
    console.error("Failed to fetch API key from Supabase Gateway:", e);
    return null;
  }
}

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
    
    // Connect to Google Gemini Multimodal Live API
    const geminiWs = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiKey}`);
    
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

  route("all", "/api/auth/verify", authVerify);
  route("all", "/api/auth/session", authSession);
  route("all", "/api/auth/logout", authLogout);
  route("all", "/api/chat", async (req, res) => {
    if (await handleAffordabilityDecision(req, res)) return;
    return chat(req, res);
  });
  route("all", "/api/autocomplete", autocomplete);
  route("all", "/api/enhance", enhance);
  route("all", "/api/generate-office", generateOffice);
  route("all", "/api/domains", domains);
  route("all", "/api/deploy", deploy);
  route("all", "/api/pipeline", pipeline);
  route("all", "/api/moderate", moderate);
  route("all", "/api/models", models);
  route("all", "/api/admin/models", adminModels);
  route("all", "/api/admin/metrics", adminMetrics);
  route("all", "/api/product-event", productEvent);
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
