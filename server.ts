import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

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

  // Endpoint to download full codebase zip archive directly
  app.get("/api/download-zip", (req, res) => {
    const zipPath = path.join(process.cwd(), "public", "quantora-codebase.zip");
    res.download(zipPath, "quantora-codebase.zip", (err) => {
      if (err) {
        console.error("Download failed:", err);
        if (!res.headersSent) {
          res.status(500).send("Error downloading file");
        }
      }
    });
  });

  // API route for real AI chat using Gemini API or OpenRouter API with SSE Streaming
  app.post("/api/chat", async (req, res) => {
    const startTime = Date.now();
    try {
      const { message, modelId, modelName, history, userKey, openRouterKey } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Message string is required" });
      }

      const effectiveOpenRouterKey = openRouterKey || process.env.OPENROUTER_API_KEY;
      const effectiveGeminiKey = userKey || process.env.GEMINI_API_KEY;

      // 1. If OpenRouter Key is available and non-Gemini model requested, call OpenRouter directly
      if (modelId && !modelId.startsWith("gemini") && effectiveOpenRouterKey) {
        try {
          const formattedHistory = (history || []).map((m: any) => ({
            role: m.role === "model" || m.role === "assistant" || m.sender === "ai" ? "assistant" : "user",
            content: m.text || m.content || "",
          }));
          formattedHistory.push({ role: "user", content: message });

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${effectiveOpenRouterKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelId,
              messages: formattedHistory,
              stream: true,
            }),
          });

          if (response.ok && response.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ") && !line.includes("[DONE]")) {
                  try {
                    const parsed = JSON.parse(line.slice(6));
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                    }
                  } catch (e) {}
                }
              }
            }
            
            const latencyMs = Date.now() - startTime;
            const payload = { done: true, provider: `OpenRouter ${modelName || modelId}`, latencyMs };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            return res.end();
          } else {
            const errText = await response.text();
            console.warn("OpenRouter API returned error:", response.status, errText);
          }
        } catch (orErr) {
          console.warn("OpenRouter request failed, falling back to Quantora AI Engine:", orErr);
        }
      }

      // 2. Process via Quantora's High-Performance Gemini Engine (with multi-model fallback chain)
      if (effectiveGeminiKey) {
        try {
          const contents = buildGeminiContents(history, message);
          const isCustomModel = modelId && !modelId.startsWith("gemini");
          const personaString = "You are Quantora AI, an elite Technical Architect and helpful assistant powering Quantora.app. Your goal is to make complex topics easy to understand. Always structure your responses with clear headings, bullet points, and short paragraphs. Avoid dense, intimidating academic jargon unless specifically requested. Present information like a polished, professional technical writer using rich GitHub-flavored Markdown.";
          const systemInstruction = isCustomModel
            ? `${personaString} You are currently functioning as "${modelName || modelId}". Preserving the expertise of ${modelName || modelId}, format everything beautifully.`
            : `${personaString} You are currently functioning as "${modelName || "Gemini 3.6 Flash"}".`;

          const client = new GoogleGenAI({ apiKey: effectiveGeminiKey });
          const fallbackModels = [
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3-flash-preview",
            "gemini-flash-latest",
            "gemma-4-26b-a4b-it",
            "gemma-4-31b-it"
          ];
          
          let responseStream;
          let usedModel;
          let lastError;
          
          for (const m of fallbackModels) {
            try {
              responseStream = await client.models.generateContentStream({
                model: m,
                contents: contents,
                config: {
                  systemInstruction: systemInstruction,
                  temperature: 0.7,
                },
              });
              usedModel = m;
              break;
            } catch (err: any) {
              console.warn(`Gemini model ${m} failed to connect stream:`, err.message || err);
              lastError = err;
            }
          }
          
          if (!responseStream) {
            throw lastError || new Error("All Gemini fallback models failed.");
          }

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          for await (const chunk of responseStream) {
            if (chunk.text) {
              res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            }
          }

          const latencyMs = Date.now() - startTime;
          const payload = { done: true, provider: isCustomModel ? `Quantora AI Engine (${modelName || modelId})` : `Google Gemini (${usedModel})`, latencyMs };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          return res.end();
          
        } catch (geminiErr: any) {
          console.error("All Gemini API calls failed:", geminiErr);
          return res.status(500).json({ error: geminiErr.message || "Failed to communicate with AI model." });
        }
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
