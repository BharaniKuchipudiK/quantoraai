import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { authenticateAdmin } from "./api/_lib/admin-auth.js";
import { getSessionUser, createSessionToken, setSessionCookie, clearSessionCookie, isSessionConfigured } from "./api/_lib/session.js";
import { OAuth2Client } from "google-auth-library";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

dotenv.config();

function buildGeminiContents(history: any[], currentMessage: string) {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || !msg.text || typeof msg.text !== "string" || !msg.text.trim()) continue;

      const role: "user" | "model" =
        msg.sender === "ai" || msg.role === "model" || msg.role === "assistant" ? "model" : "user";

      if (contents.length === 0) {
        if (role === "user") {
          contents.push({ role: "user", parts: [{ text: msg.text }] });
        }
      } else {
        const lastIndex = contents.length - 1;
        if (contents[lastIndex].role === role) {
          contents[lastIndex].parts[0].text += `\n\n${msg.text}`;
        } else {
          contents.push({ role, parts: [{ text: msg.text }] });
        }
      }
    }
  }

  // Append current message
  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    contents[contents.length - 1].parts[0].text += `\n\n${currentMessage}`;
  } else {
    contents.push({ role: "user", parts: [{ text: currentMessage }] });
  }

  return contents;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);

  // Pillar 3: Continuous Voice / Gemini Live WebSocket Bridge
  const wss = new WebSocketServer({ server: httpServer, path: "/api/live" });
  wss.on('connection', (ws, req) => {
    console.log("Client connected to /api/live WebSocket");
    
    // Connect to Google Gemini Multimodal Live API
    // Need a real key here. We fallback to process.env.GEMINI_API_KEY
    const geminiWs = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`);
    
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

  // Security: In-memory Rate Limiter
  const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
  app.use((req, res, next) => {
    if (req.path === '/api/chat') {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      let record = rateLimitMap.get(ip);
      
      if (!record || record.resetTime < now) {
        record = { count: 1, resetTime: now + 60000 }; // 60 seconds
      } else {
        record.count++;
      }
      
      rateLimitMap.set(ip, record);
      
      if (record.count > 25) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
      }
    }
    next();
  });

  app.use(express.json({ limit: "500kb" }));

  // Helper function to execute Gemini with multi-model fallback chain
  async function generateGeminiContent(apiKey: string, contents: any[], systemInstruction: string) {
    const client = new GoogleGenAI({ apiKey });
    const fallbackModels = [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-flash-latest",
      "gemma-4-26b-a4b-it",
      "gemma-4-31b-it"
    ];

    let lastError: any = null;
    for (const m of fallbackModels) {
      try {
        const response = await client.models.generateContent({
          model: m,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7,
          },
        });
        if (response && response.text) {
          return { text: response.text, usedModel: m };
        }
      } catch (err: any) {
        console.warn(`Gemini model ${m} failed:`, err.message || err);
        lastError = err;
      }
    }
    throw lastError || new Error("All Gemini fallback models failed.");
  }

  // Global In-Memory Metrics Store
  const globalMetrics = {
    totalRequests: 0,
    activeConnections: 0,
    peakConcurrentConnections: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalLatencyMs: 0,
    latencyHistory: [] as number[],
    modelUsage: {} as Record<string, number>,
    hourlyTraffic: new Array(24).fill(0)
  };

  // Helper to record metrics
  const recordMetric = (latency: number, model: string, success: boolean) => {
    if (success) {
      globalMetrics.successfulRequests++;
      globalMetrics.totalLatencyMs += latency;
      globalMetrics.latencyHistory.push(latency);
      if (globalMetrics.latencyHistory.length > 100) globalMetrics.latencyHistory.shift();
    } else {
      globalMetrics.failedRequests++;
    }
    
    globalMetrics.modelUsage[model] = (globalMetrics.modelUsage[model] || 0) + 1;
    const hour = new Date().getHours();
    globalMetrics.hourlyTraffic[hour]++;
  };

  // Admin Analytics Endpoint
  app.get("/api/admin/metrics", (req, res) => {
    // Same auth as the deployed serverless function: an ADMIN_API_KEY read
    // from the environment, presented in a header, compared in constant time.
    // Fails closed when unset. See api/_lib/admin-auth.ts.
    const authFailure = authenticateAdmin(req);
    if (authFailure) {
      return res.status(authFailure.status).json({ error: authFailure.error });
    }
    
    const avgLatency = globalMetrics.successfulRequests > 0 
      ? Math.round(globalMetrics.totalLatencyMs / globalMetrics.successfulRequests) 
      : 0;
      
    res.json({
      ...globalMetrics,
      avgLatency,
      timestamp: new Date().toISOString()
    });
  });
  /*
   * Auth routes, mirroring api/auth/*.ts so the dev server and the deployed
   * serverless functions cannot drift apart on who counts as signed in.
   */
  const devClientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const devOAuth = devClientId ? new OAuth2Client(devClientId) : null;

  app.post("/api/auth/verify", async (req, res) => {
    if (!devOAuth || !isSessionConfigured()) {
      return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
    }
    const credential = req.body?.credential;
    if (!credential || typeof credential !== "string") {
      return res.status(400).json({ error: "Missing credential token" });
    }
    try {
      const ticket = await devOAuth.verifyIdToken({ idToken: credential, audience: devClientId });
      const payload = ticket.getPayload();
      if (!payload?.sub) return res.status(401).json({ error: "Invalid token payload" });
      if (!payload.email || payload.email_verified === false) {
        return res.status(401).json({ error: "This Google account has no verified email address." });
      }
      const token = createSessionToken({
        sub: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split("@")[0],
        picture: payload.picture || "",
      });
      if (!token) return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
      setSessionCookie(res, token);
      return res.status(200).json({
        name: payload.name || "Creator",
        email: payload.email,
        avatar: payload.picture || "",
        authProvider: "Google OAuth 2.0 (Verified)",
        tier: "Indie Creator ($0 / mo)",
        joinedDate: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      });
    } catch (err: any) {
      console.warn("Google credential verification failed:", err?.message || err);
      return res.status(401).json({ error: "Authentication failed or token expired." });
    }
  });

  app.get("/api/auth/session", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ user: getSessionUser(req) ?? null });
  });

  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  });

  // API route for real AI chat using Gemini API or OpenRouter API with SSE Streaming
  app.post("/api/chat", async (req, res) => {
    globalMetrics.totalRequests++;
    globalMetrics.activeConnections++;
    if (globalMetrics.activeConnections > globalMetrics.peakConcurrentConnections) {
      globalMetrics.peakConcurrentConnections = globalMetrics.activeConnections;
    }
    
    const startTime = Date.now();
    let isTracked = false;
    
    res.on('close', () => {
      globalMetrics.activeConnections = Math.max(0, globalMetrics.activeConnections - 1);
      if (!isTracked) {
        recordMetric(Date.now() - startTime, req.body.modelName || req.body.modelId || "unknown", false);
      }
    });

    try {
      const { message, modelId, modelName, history, userKey, openRouterKey } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message string is required" });
      }

      const personaString = `You are Quantora AI, an empathetic Technical Project Manager, Elite Architect, and Human-Centric Guide powering Quantora.app. 
Your core directive is to forge a human connection and never assume the user is highly technical. 
CRITICAL RULES:
1. EMPATHY FIRST: Validate the user's ideas with enthusiasm. Speak like a supportive, expert human mentor, not a robotic terminal.
2. NO CODE DUMPING: Never output raw codebase files, massive JSON structures, or dense code blocks immediately when a user pitches an idea.
3. THE JOURNEY FRAMEWORK: Break every new project down into a step-by-step roadmap:
   - Step 1: Hosting & Infrastructure (e.g., Vercel, GoDaddy, Firebase)
   - Step 2: Domain Names
   - Step 3: Version Control (GitHub)
   - Step 4: Tech Stack Decisions
   - Step 5: Implementation (Writing the code)
4. INTERACTIVE CONSULTATION: When a user shares an idea, briefly outline the journey above, explain ONLY Step 1, ask clarifying questions, and explicitly ask them if they are ready to proceed before moving on or writing code.
Make complex topics easy to understand. Structure responses with clear headings, bullet points, and short paragraphs using rich GitHub-flavored Markdown.`;

      // Server-held keys are for signed-in users only; BYOK still works signed out.
      const sessionUser = getSessionUser(req);
      const mayUseServerKeys = Boolean(sessionUser);
      const effectiveOpenRouterKey =
        openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY : undefined);
      const effectiveGeminiKey =
        userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY : undefined);

      if (!effectiveGeminiKey && !effectiveOpenRouterKey && !sessionUser) {
        return res.status(401).json({
          error: "Please sign in to use Quantora's built-in AI, or add your own API key.",
          requiresAuth: true,
        });
      }

      // 1. Initialize Tools
      // Reverted back to DuckDuckGo to remove API key overhead
      const { DuckDuckGoSearch } = await import("@langchain/community/tools/duckduckgo_search");
      const searchTool = new DuckDuckGoSearch({ maxResults: 3 });
      
      const githubReaderTool = new DynamicStructuredTool({
        name: "read_github_repo",
        description: "Fetches and reads the contents of a GitHub repository. Use this to analyze a codebase.",
        schema: z.object({
          owner: z.string().describe("The owner of the repository (e.g., 'facebook')."),
          repo: z.string().describe("The name of the repository (e.g., 'react').")
        }),
        func: async ({ owner, repo }) => {
          try {
            const res = await fetch(`http://localhost:3000/api/github/fetch-repo?owner=${owner}&repo=${repo}`);
            if (!res.ok) return `Failed to fetch repo ${owner}/${repo}`;
            const data = await res.json();
            return data.content;
          } catch (e: any) {
            return `Error reading GitHub repo: ${e.message}`;
          }
        }
      });

      const tools = [searchTool, githubReaderTool];

      // 2. Initialize LLM (Gemini or OpenRouter)
      let llm;
      if (modelId && !modelId.startsWith("gemini") && effectiveOpenRouterKey) {
        llm = new ChatOpenAI({
          modelName: modelId,
          openAIApiKey: effectiveOpenRouterKey,
          configuration: {
            baseURL: "https://openrouter.ai/api/v1"
          },
          streaming: true
        });
      } else if (effectiveGeminiKey) {
        llm = new ChatGoogleGenerativeAI({
          modelName: modelName || "gemini-1.5-flash",
          apiKey: effectiveGeminiKey,
          streaming: true
        });
      } else {
        return res.status(401).json({ error: "No API key available." });
      }

      // 3. Format History for LangChain
      const lcHistory = (history || []).map((m: any) => {
         const content = m.text || m.content || "";
         if (m.role === "model" || m.role === "assistant" || m.sender === "ai") {
           return new AIMessage(content);
         }
         return new HumanMessage(content);
      });

      // 4. Build Agent Prompt
      const systemInstruction = modelId && !modelId.startsWith("gemini") 
        ? `${personaString}\nYou are currently functioning as "${modelName || modelId}". Preserving your underlying expertise, always follow the Quantora Guidelines above.`
        : personaString;

      const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemInstruction],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"],
        new MessagesPlaceholder("agent_scratchpad"),
      ]);

      // 5. Create and Execute Agent
      const agent = createToolCallingAgent({
        llm,
        tools,
        prompt,
      });

      const agentExecutor = new AgentExecutor({
        agent,
        tools,
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const eventStream = await agentExecutor.streamEvents(
          {
            input: message,
            chat_history: lcHistory
          },
          { version: "v2" }
        );

        for await (const event of eventStream) {
          if (event.event === "on_chat_model_stream") {
            const content = event.data.chunk?.content;
            if (content && typeof content === "string") {
              res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
            }
          } else if (event.event === "on_tool_start") {
             const toolName = event.name;
             res.write(`data: ${JSON.stringify({ text: `\n\n> [!NOTE]\n> *Quantora is using a tool: **${toolName}***\n\n` })}\n\n`);
          }
        }

        const latencyMs = Date.now() - startTime;
        const payload = { done: true, provider: `LangChain ${modelName || modelId}`, latencyMs };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        recordMetric(latencyMs, modelName || modelId, true);
        isTracked = true;
        return res.end();
      } catch (err: any) {
        console.warn("Agent Executor failed:", err);
        return res.status(500).json({ error: "Agent Executor failed", details: err.message });
      }

      return res.status(400).json({
        error: "No AI service key configured. Please enter an API key in the Privacy Vault.",
        requiresKey: "gemini"
      });

    } catch (err: any) {
      console.error("Error in /api/chat:", err);
      if (!res.headersSent) {
        return res.status(500).json({
          error: err.message || "Failed to communicate with AI model.",
          modelName: req.body.modelName || req.body.modelId
        });
      } else {
        res.end();
      }
    }
  });

  // API route for GitHub Context Fetching
  app.post("/api/github/fetch-repo", async (req, res) => {
    try {
      const { repoUrl } = req.body;
      if (!repoUrl) return res.status(400).json({ error: "repoUrl is required" });

      // Extract owner and repo from URL (e.g. https://github.com/facebook/react)
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return res.status(400).json({ error: "Invalid GitHub URL format" });
      
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");
      const githubToken = process.env.GITHUB_TOKEN;

      const headers: Record<string, string> = {
        "User-Agent": "Quantora-API-Gateway",
        "Accept": "application/vnd.github.v3+json"
      };
      if (githubToken) {
        headers["Authorization"] = `Bearer ${githubToken}`;
      }

      // 1. Get Repo Metadata (to find default branch)
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!repoRes.ok) {
        if (repoRes.status === 404) return res.status(404).json({ error: "Repository not found or is private." });
        if (repoRes.status === 403) return res.status(403).json({ error: "GitHub API rate limit exceeded. Please add GITHUB_TOKEN to server env." });
        return res.status(repoRes.status).json({ error: "Failed to fetch repository metadata" });
      }
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch || "main";

      // 2. Get File Tree
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
      if (!treeRes.ok) return res.status(treeRes.status).json({ error: "Failed to fetch repository tree" });
      const treeData = await treeRes.json();

      // 3. Filter Files
      const ignorePatterns = [
        /node_modules\//, /\.git\//, /dist\//, /build\//, /\.vscode\//, /\.idea\//, /__pycache__\//,
        /\.jpg$/, /\.jpeg$/, /\.png$/, /\.gif$/, /\.ico$/, /\.svg$/, /\.mp4$/, /\.webm$/, /\.mp3$/, /\.wav$/,
        /\.pdf$/, /\.zip$/, /\.tar\.gz$/, /\.woff$/, /\.woff2$/, /\.ttf$/, /\.eot$/, /\.DS_Store$/, /\.lock$/
      ];
      
      const MAX_FILES = 50; // Safety limit
      const sourceFiles = treeData.tree.filter((file: any) => {
        if (file.type !== "blob") return false;
        if (ignorePatterns.some(pattern => pattern.test(file.path))) return false;
        return true;
      }).slice(0, MAX_FILES);

      if (sourceFiles.length === 0) {
        return res.status(400).json({ error: "No relevant source files found or repository is empty." });
      }

      // 4. Fetch File Contents Concurrently (Batched)
      const results: string[] = [];
      const batchSize = 10;
      for (let i = 0; i < sourceFiles.length; i += batchSize) {
        const batch = sourceFiles.slice(i, i + batchSize);
        const fetches = batch.map(async (file: any) => {
          const contentRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`, {
            headers: githubToken ? { "Authorization": `Bearer ${githubToken}` } : {}
          });
          if (contentRes.ok) {
            const content = await contentRes.text();
            return `\n\n--- File: ${file.path} ---\n\n${content}`;
          }
          return `\n\n--- File: ${file.path} ---\n\n[Failed to fetch content]`;
        });
        const batchResults = await Promise.all(fetches);
        results.push(...batchResults);
      }

      const finalContent = `# GitHub Repository: ${owner}/${repo}\nBranch: ${defaultBranch}\n${results.join("")}`;
      
      // Safety limit on total length (approx 250k chars / 50k tokens)
      const truncatedContent = finalContent.length > 250000 
        ? finalContent.slice(0, 250000) + "\n\n...[CONTENT TRUNCATED DUE TO SIZE LIMIT]..."
        : finalContent;

      return res.json({ name: `${owner}/${repo}`, content: truncatedContent });

    } catch (err: any) {
      console.error("Error in /api/github/fetch-repo:", err);
      return res.status(500).json({ error: err.message || "Failed to process GitHub repository" });
    }
  });

  // Pillar 4: Predictive Code Assist API
  app.post("/api/autocomplete", async (req, res) => {
    try {
       const { prefix, suffix, modelId } = req.body;
       const apiKey = process.env.GEMINI_API_KEY;
       if (!apiKey) return res.status(401).json({ error: "No API key" });
       
       const client = new GoogleGenAI({ apiKey });
       const prompt = `You are an elite autocomplete engine. The user is writing code. You must output ONLY the exact text that should be inserted between the prefix and suffix. No markdown formatting, no explanations, no backticks.
PREFIX:
${prefix}
SUFFIX:
${suffix}`;

       const response = await client.models.generateContent({
          model: "gemini-1.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }]
       });
       
       return res.json({ completion: response.text });
    } catch (e: any) {
       console.error("Autocomplete failed:", e);
       return res.status(500).json({ error: "Autocomplete failed" });
    }
  });

  // Vite middleware for development vs production static serve
  const isExplicitProductionServe = process.env.NODE_ENV === "production" && process.env.SERVE_STATIC === "true";
  if (!isExplicitProductionServe) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
