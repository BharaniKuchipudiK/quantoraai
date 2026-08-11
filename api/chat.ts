import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { recordModelQualityEvent, recordUsage } from "./_lib/store.js";
import { fetchApiGatewayKey } from "./autocomplete.js";
import { buildConversationSystemPrompt } from "./_lib/conversation-policy.js";
import { repairArtifact } from "./_lib/repair.js";

// Generous ceilings: bound worst-case cost/abuse without rejecting any
// realistic legitimate use (long chats, pasted code files). History is
// truncated to the most recent items rather than rejected outright, so an
// existing long-running session never breaks — it just loses very old
// context, the same tradeoff every chat app with a context window makes.
const MAX_MESSAGE_LENGTH = 50_000;
const MAX_HISTORY_ITEMS = 100;
const RATE_LIMIT_PER_MINUTE = 25;
const TASK_CATEGORIES = new Set(["coding", "vision", "research", "writing", "quick", "general"]);

function normaliseTaskCategory(value: unknown): string {
  return typeof value === "string" && TASK_CATEGORIES.has(value) ? value : "general";
}

/*
 * OpenRouter requires every model id to be a fully namespaced `vendor/model`
 * slug. A bare id such as "deepseek-coder-v2" is rejected with a 400 Bad
 * Request. Older registry data and any cached frontend bundle can still send
 * those legacy bare ids, so we self-heal here: map the known legacy names onto
 * their correct slugs, and reject anything that still isn't namespaced with a
 * clear, actionable message instead of forwarding a doomed request to
 * OpenRouter and surfacing an opaque "400 Bad Request".
 */
const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4": "openai/gpt-4o",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
  "deepseek-coder-v2": "deepseek/deepseek-chat",
  "deepseek-coder": "deepseek/deepseek-chat",
  "deepseek-chat": "deepseek/deepseek-chat",
  "deepseek-v3": "deepseek/deepseek-chat",
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
  "gemma-2-9b": "google/gemma-2-9b-it",
  "gemma-2-9b-it": "google/gemma-2-9b-it",
  "qwen-2.5-coder-32b": "qwen/qwen-2.5-coder-32b-instruct",
  "qwen-2.5-coder-32b-instruct": "qwen/qwen-2.5-coder-32b-instruct",
};

function resolveOpenRouterModelId(modelId: string): { slug?: string; error?: string } {
  if (!modelId || typeof modelId !== "string" || !modelId.trim()) {
    return { error: "No model was selected. Please pick a model and try again." };
  }

  const trimmed = modelId.trim();

  // Already a valid namespaced slug (e.g. "deepseek/deepseek-chat").
  if (trimmed.includes("/")) return { slug: trimmed };

  // Known legacy bare id -> correct slug.
  const alias = OPENROUTER_MODEL_ALIASES[trimmed.toLowerCase()];
  if (alias) return { slug: alias };

  // Unknown bare id: fail loudly and usefully rather than 400-ing at OpenRouter.
  return {
    error: `"${modelId}" is not a valid OpenRouter model id. Model ids must be namespaced (e.g. "deepseek/deepseek-chat"). Please select a different model.`,
  };
}

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

async function generateGeminiContentStream(apiKey: string, contents: any[], systemInstruction: string, temperature: number = 0.7) {
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
  
  // 3. Generate content stream using the strictly validated dynamic models
  for (const m of modelsToTry) {
    try {
      const responseStream = await client.models.generateContentStream({
        model: m,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: temperature,
        },
      });
      return { stream: responseStream, usedModel: m };
    } catch (err: any) {
      lastError = err;
      console.warn(`Google API rejected model '${m}':`, err.message || err);
      // Loop gracefully to the next dynamically discovered model
    }
  }
  
  throw new Error(`Google API generated an error for all available dynamic models. Last error from model '${modelsToTry[modelsToTry.length - 1]}': ${lastError?.message || lastError}`);
}


// Background telemetry logging to Supabase
function logTelemetry(
  modelId: string,
  latencyMs: number,
  textLength: number,
  provider: string,
  userSub: string | null = null,
  usedServerKey: boolean = false,
) {
  /*
   * Per-user usage, alongside the existing anonymous telemetry.
   *
   * usedServerKey is the column that matters: it separates requests this
   * deployment paid for from requests a user funded with their own key.
   * Without that split, "what is this costing me" cannot be answered, and
   * that is the number that decides whether free stays free.
   */
  recordUsage({
    userSub,
    provider,
    modelId,
    latencyMs,
    tokensEst: Math.ceil(textLength / 4),
    usedServerKey,
  });

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

  /*
   * Two layers, on purpose.
   *
   * The in-memory check is free and catches a hot loop on this instance
   * immediately, without a network round trip. The durable check is shared
   * across every instance and survives cold starts, which is what actually
   * bounds a determined caller. Cheapest first.
   */
  if (isRateLimited(limitKey, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const durable = await isRateLimitedDurable(limitKey, RATE_LIMIT_PER_MINUTE, 60);
  if (durable.limited) {
    if (durable.resetsAt) res.setHeader('Retry-After', Math.max(1, Math.ceil((new Date(durable.resetsAt).getTime() - Date.now()) / 1000)));
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute and try again.',
      resetsAt: durable.resetsAt,
    });
  }

  const startTime = Date.now();
  const requestId = randomUUID();
  const taskCategory = normaliseTaskCategory(req.body?.taskCategory);

  try {
    const { message, modelId, modelName, history, userKey, openRouterKey, cognitiveLevel, buildMode, task, fallbackFrom } = req.body || {};

    if (task === "feedback") {
      const feedbackRequestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
      const outcome = req.body?.outcome;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(feedbackRequestId)
          || typeof modelId !== "string"
          || !["helpful", "not_helpful"].includes(outcome)) {
        return res.status(400).json({ error: "Invalid anonymous feedback signal." });
      }
      recordModelQualityEvent({
        requestId: feedbackRequestId,
        modelId,
        taskCategory,
        outcome,
      });
      return res.status(202).json({ recorded: true });
    }

    let dynamicTemperature = 0.7;
    if (cognitiveLevel === 'Lightning') {
      dynamicTemperature = 0.3;
    } else if (cognitiveLevel === 'Deep Think') {
      dynamicTemperature = 0.2;
    }
    // Build requests want deterministic, runnable code over prose variety.
    if (buildMode) dynamicTemperature = Math.min(dynamicTemperature, 0.3);

    const finalSystemPrompt = buildConversationSystemPrompt({
      cognitiveLevel,
      modelName: modelName || modelId,
      buildMode: Boolean(buildMode),
    });

    // The self-heal endpoint reuses this handler (via task: "repair") so it
    // adds no serverless function. It carries code+error instead of a message.
    const isRepairTask = task === "repair";

    if (!isRepairTask && (!message || typeof message !== "string" || !message.trim())) {
      return res.status(400).json({ error: "Message string is required" });
    }
    if (!isRepairTask && message.length > MAX_MESSAGE_LENGTH) {
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
      openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') : undefined);
    const effectiveGeminiKey =
      userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI') : undefined);

    if (!effectiveGeminiKey && !effectiveOpenRouterKey && !sessionUser) {
      return res.status(401).json({
        error: "Please sign in to use Quantora's built-in AI, or add your own API key.",
        requiresAuth: true,
      });
    }

    // Self-heal branch: fix a broken generated artifact and return the corrected
    // code as JSON. Reuses the keys resolved above; adds no serverless function.
    if (isRepairTask) {
      const { code, error, framework } = req.body || {};
      if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ error: "No code provided to repair." });
      }
      try {
        const result = await repairArtifact({
          code,
          error: typeof error === "string" ? error : "",
          framework: framework === "react" ? "react" : "html",
          openRouterKey: effectiveOpenRouterKey,
          geminiKey: effectiveGeminiKey,
        });
        return res.status(200).json(result);
      } catch (err: any) {
        console.error("Error in /api/chat repair task:", err);
        return res.status(500).json({ error: err?.message || "Auto-repair failed." });
      }
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
        const { stream: responseStream, usedModel } = await generateGeminiContentStream(effectiveGeminiKey, contents, finalSystemPrompt, dynamicTemperature);
        
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        let fullReply = "";
        for await (const chunk of responseStream) {
          if (chunk.text) {
            fullReply += chunk.text;
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            if (res.flush) res.flush();
          }
        }
        
        const latencyMs = Date.now() - startTime;
        logTelemetry(usedModel, latencyMs, fullReply.length, "Gemini", sessionUser?.sub ?? null, !userKey && mayUseServerKeys);
        recordModelQualityEvent({ requestId, modelId: usedModel, taskCategory, outcome: "success", latencyMs, fallbackFrom });

        res.write(`data: ${JSON.stringify({ provider: `Google Gemini (${modelName || usedModel})`, latencyMs, modelId: usedModel, requestId, liveConnected: true })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
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

      // Guard the model id BEFORE spending a network round trip. This turns the
      // old opaque "OpenRouter API failed: 400 Bad Request" into either a
      // corrected slug (legacy ids self-heal) or a clear, actionable message.
      const resolved = resolveOpenRouterModelId(modelId);
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error, modelName: modelName || modelId });
      }
      const openRouterModelId = resolved.slug as string;

      const formattedHistory = [
        {
          role: "system",
          content: finalSystemPrompt
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
          model: openRouterModelId,
          messages: formattedHistory,
          temperature: dynamicTemperature,
          stream: true
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`OpenRouter API error (${response.status}) for model '${openRouterModelId}':`, errText);

        // Surface OpenRouter's own explanation so failures are diagnosable
        // instead of a bare status. OpenRouter returns JSON like
        // { error: { message, code } } — pull that message out when present.
        let detail = "";
        try {
          const parsed = JSON.parse(errText);
          detail = parsed?.error?.message || parsed?.message || "";
        } catch {
          detail = errText?.slice(0, 300) || "";
        }
        const suffix = detail ? `: ${detail}` : "";
        throw new Error(`OpenRouter request for "${modelName || openRouterModelId}" failed (${response.status})${suffix}`);
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      if (!response.body) {
        throw new Error("OpenRouter API returned no body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n');
        for (const line of lines) {
           if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const parsed = JSON.parse(line.slice(6));
                const token = parsed.choices?.[0]?.delta?.content || "";
                if (token) {
                   fullReply += token;
                   res.write(`data: ${JSON.stringify({ text: token })}\n\n`);
                   if (res.flush) res.flush();
                }
              } catch(e) {}
           }
        }
      }

      const latencyMs = Date.now() - startTime;
      logTelemetry(openRouterModelId, latencyMs, fullReply.length, "OpenRouter",
        sessionUser?.sub ?? null, !openRouterKey && mayUseServerKeys);
      recordModelQualityEvent({ requestId, modelId: openRouterModelId, taskCategory, outcome: "success", latencyMs, fallbackFrom });

      res.write(`data: ${JSON.stringify({ provider: `OpenRouter (${modelName || openRouterModelId})`, latencyMs, modelId: openRouterModelId, requestId, liveConnected: true })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    if (req.body?.task !== "repair" && req.body?.task !== "feedback" && typeof req.body?.modelId === "string") {
      recordModelQualityEvent({
        requestId,
        modelId: req.body.modelId,
        taskCategory,
        outcome: "failure",
        latencyMs: Date.now() - startTime,
        fallbackFrom: req.body?.fallbackFrom,
      });
    }
    return res.status(500).json({
      error: err.message || "Failed to communicate with AI model.",
      modelName: req.body?.modelName || req.body?.modelId,
      requestId,
    });
  }
}
