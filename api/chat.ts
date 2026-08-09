import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";

// Generous ceilings: bound worst-case cost/abuse without rejecting any
// realistic legitimate use (long chats, pasted code files). History is
// truncated to the most recent items rather than rejected outright, so an
// existing long-running session never breaks — it just loses very old
// context, the same tradeoff every chat app with a context window makes.
const MAX_MESSAGE_LENGTH = 50_000;
const MAX_HISTORY_ITEMS = 100;
const RATE_LIMIT_PER_MINUTE = 25;

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

  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    contents[contents.length - 1].parts[0].text += `\n\n${currentMessage}`;
  } else {
    contents.push({ role: "user", parts: [{ text: currentMessage }] });
  }

  return contents;
}

async function generateGeminiContent(apiKey: string, contents: any[], systemInstruction: string) {
  const client = new GoogleGenAI({ apiKey });
  
  let selectedModel = "";
  let availableModels: string[] = [];
  
  // 1. Dynamically ask Google exactly which models this specific API key is allowed to use
  try {
    const modelsResponse = await client.models.list();
    for await (const m of modelsResponse) {
      if (m && m.name) {
        const modelName = m.name.replace(/^models\//, "");
        availableModels.push(modelName);
      }
    }
  } catch (err: any) {
    console.warn("Failed to dynamically list models:", err.message);
    throw new Error(`CRITICAL GOOGLE API ERROR: Your API key was rejected before we could ask Google for a list of models. Error from Google: ${err.message || err}. Ensure you enabled the 'Generative Language API' in your Google Cloud Project.`);
  }
  
  const availableModelsStr = availableModels.join(", ");
  
  // 2. Pick the most modern Flash model by dynamically parsing version numbers
  const flashModels = availableModels.filter(m => m.includes("gemini") && m.includes("flash"));
  
  flashModels.sort((a, b) => {
    const matchA = a.match(/(\d+\.\d+)/);
    const matchB = b.match(/(\d+\.\d+)/);
    const valA = matchA ? parseFloat(matchA[1]) : 0;
    const valB = matchB ? parseFloat(matchB[1]) : 0;
    return valB - valA;
  });

  const modelsToTry = flashModels.length > 0 ? flashModels : availableModels;
  
  if (modelsToTry.length === 0) {
    throw new Error(`CRITICAL GOOGLE API ERROR: Your API key successfully connected, but Google returned ZERO models. (Google returned: ${availableModelsStr || "nothing"}). This usually means your Google Cloud project has no quota or is region-blocked.`);
  }

  let lastError = null;
  
  // 3. Generate content using the strictly validated dynamic models, falling back gracefully if Google rejects one
  for (const m of modelsToTry) {
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
      lastError = err;
      console.warn(`Google API rejected model '${m}':`, err.message || err);
      // Loop gracefully to the next dynamically discovered model
    }
  }
  
  throw new Error(`Google API generated an error for all available dynamic models. Last error from model '${modelsToTry[modelsToTry.length - 1]}': ${lastError?.message || lastError}`);
}


// Background telemetry logging to Supabase
function logTelemetry(modelId: string, latencyMs: number, textLength: number, provider: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  
  // Estimate tokens (roughly 4 chars per token)
  const tokens = Math.ceil(textLength / 4);
  
  fetch(`${supabaseUrl}/rest/v1/telemetry`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      model_id: modelId,
      latency_ms: latencyMs,
      tokens_generated: tokens,
      provider: provider
    })
  }).catch(err => console.error("Telemetry error:", err));
}

export default async function handler(req: any, res: any) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Best-effort per-IP limit — see api/_lib/rate-limit.ts for caveats under
  // Vercel's serverless model. Still closes the "unlimited free requests"
  // gap that existed with no limiter at all.
  const sessionUser = getSessionUser(req);

  /*
   * Keyed per account when signed in, falling back to IP. Several people
   * behind one office NAT share an IP and should not exhaust each other.
   */
  const limitKey = sessionUser ? `chat:user:${sessionUser.sub}` : `chat:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const startTime = Date.now();

  try {
    const { message, modelId, modelName, history, userKey, openRouterKey } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message string is required" });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH.toLocaleString()} characters). Please shorten it and try again.` });
    }
    // Bound, never reject: an over-long history just loses its oldest turns.
    const boundedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS) : history;

    /*
     * The deployment's own API keys are for signed-in users only.
     *
     * Verifying a Google token at login does not protect this endpoint: this
     * is a separate request, and without a session check anyone can POST here
     * directly and bill this deployment's keys. Bring-your-own-key callers are
     * unaffected — their requests cost the deployment nothing.
     */
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

    const isGeminiModel = modelId && modelId.startsWith("gemini");

    if (isGeminiModel) {
      if (!effectiveGeminiKey) {
        return res.status(401).json({
          error: "No Google Gemini API key configured. Please enter an API key in the Privacy Vault.",
          requiresKey: "gemini"
        });
      }

      try {
        const contents = buildGeminiContents(boundedHistory, message);
        const systemInstruction = `You are Quantora AI, an elite Senior Developer and Technical Architect pair-programming with the user.
Rules:
1. Speak like a human peer engineer. Never use robotic intros like "As an AI..." or "Here is the code". Jump straight into the solution.
2. Be concise, authoritative, and highly analytical.
3. Provide clean, production-ready code with no fluff.
4. When discussing architecture, speak casually but brilliantly about tradeoffs.`;
        const result = await generateGeminiContent(effectiveGeminiKey, contents, systemInstruction);
        
        const latencyMs = Date.now() - startTime;
        logTelemetry(result.usedModel, latencyMs, result.text.length, "Gemini");

        return res.status(200).json({
          text: result.text,
          provider: `Google Gemini (${modelName || result.usedModel})`,
          latencyMs,
          modelId: result.usedModel,
          liveConnected: true
        });
      } catch (geminiErr: any) {
        console.error("Gemini API call failed:", geminiErr);
        throw geminiErr;
      }
    } else {
      if (!effectiveOpenRouterKey) {
        return res.status(401).json({
          error: `No OpenRouter API key configured. You need an OpenRouter key to use ${modelName || modelId}.`,
          requiresKey: "openrouter"
        });
      }

      const formattedHistory = [
        { 
          role: "system", 
          content: `You are Quantora AI, an elite Senior Developer and Technical Architect pair-programming with the user.
Rules:
1. Speak like a human peer engineer. Never use robotic intros like "As an AI..." or "Here is the code". Jump straight into the solution.
2. Be concise, authoritative, and highly analytical.
3. Provide clean, production-ready code with no fluff.
4. When discussing architecture, speak casually but brilliantly about tradeoffs.` 
        },
        ...(boundedHistory || []).map((m: any) => ({
          role: m.role === "model" || m.role === "assistant" || m.sender === "ai" ? "assistant" : "user",
          content: m.text || m.content || "",
        }))
      ];
      formattedHistory.push({ role: "user", content: message });

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveOpenRouterKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
          "X-Title": "Quantora AI",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: formattedHistory,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("OpenRouter API error:", errText);
        throw new Error(`OpenRouter API failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content;
      
      if (!reply) {
        console.error("OpenRouter empty response data:", JSON.stringify(data));
        const errMsg = data.error?.message || "OpenRouter API returned an empty response.";
        throw new Error(`OpenRouter Error: ${errMsg}`);
      }

      const latencyMs = Date.now() - startTime;
      logTelemetry(modelId, latencyMs, reply.length, "OpenRouter");
      
      return res.status(200).json({
        text: reply,
        provider: `OpenRouter (${modelName || modelId})`,
        latencyMs,
        modelId: modelId,
        liveConnected: true
      });
    }

  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    return res.status(500).json({
      error: err.message || "Failed to communicate with AI model.",
      modelName: req.body?.modelName || req.body?.modelId
    });
  }
}
