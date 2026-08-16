import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { isStoreConfigured, readOutcomeState, recordModelQualityEvent, recordUsage } from "./_lib/store.js";
import { requireActiveSession } from "./_lib/authz.js";
import { getRequestGeo } from "./_lib/geo.js";
import { fetchApiGatewayKey } from "./autocomplete.js";
import { buildConversationSystemPrompt } from "./_lib/conversation-policy.js";
import { normalizeSessionContext } from "./_lib/session-context.js";
import { normalizeOutcomeSessionId } from "./_lib/outcome-state.js";
import { repairArtifact } from "./_lib/repair.js";
import { verifyBuild } from "./_lib/verify-build.js";
import { evaluateSafetyText } from "./_lib/safety-policy.js";
import { readModelRegistryCached } from "./_lib/model-store.js";
import {
  buildConversationSnapshot,
  chooseNextConversationMove,
  formatConversationDecisionForPrompt,
  publicConversationMetadata,
  verifyConversationResponse,
} from "./_lib/conversation-engine.js";
import { normalizeCommunicationRequest } from "./_lib/communication/request-normalizer.js";
import { buildResponseContract } from "../src/lib/communication/policy/conversation-policy.js";
import { evaluationFromVerification } from "../src/lib/communication/evaluation/from-verification.js";
import { selectModelsForTurn } from "../src/lib/communication/routing/select-models.js";

// Generous ceilings: bound worst-case cost/abuse without rejecting any
// realistic legitimate use (long chats, pasted code files). History is
// truncated to the most recent items rather than rejected outright, so an
// existing long-running session never breaks — it just loses very old
// context, the same tradeoff every chat app with a context window makes.
//
// Refining a built site sends the WHOLE HTML document back for editing, which
// legitimately runs well past a typed-message size — so the ceiling has to fit
// a full self-contained page, not just a chat line. Rate limiting bounds abuse.
const MAX_MESSAGE_LENGTH = 200_000;
const MAX_HISTORY_ITEMS = 100;
const RATE_LIMIT_PER_MINUTE = 25;
const TASK_CATEGORIES = new Set(["coding", "vision", "research", "writing", "quick", "general"]);
const FEATURED_SERVER_MODELS = new Set([
  "gemini-flash-latest",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-coder-32b-instruct",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemma-2-9b-it",
  "openai/gpt-4o-mini",
]);

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

async function isApprovedServerModel(modelId: string): Promise<boolean> {
  if (!modelId || typeof modelId !== "string") return false;
  if (modelId.startsWith("gemini")) return true;
  if (FEATURED_SERVER_MODELS.has(modelId)) return true;

  const rows = await readModelRegistryCached();
  return rows.some((row: any) => row?.id === modelId && row?.approved === true && row?.lifecycle === "available");
}

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

function buildGeminiContents(history: any[], currentMessage: string, attachedImages: string[] = []) {
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];

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
          const textPart = contents[lastIndex].parts.find((p): p is { text: string } => "text" in p);
          if (textPart) textPart.text += `\n\n${msg.text}`;
        } else {
          contents.push({ role, parts: [{ text: msg.text }] });
        }
      }
    }
  }

  const imageParts: GeminiPart[] = attachedImages
    .slice(0, 4)
    .map((dataUrl) => {
      const match = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
      if (!match) return null;
      return { inlineData: { mimeType: match[1], data: match[2] } };
    })
    .filter((part): part is { inlineData: { mimeType: string; data: string } } => Boolean(part));

  const userParts: GeminiPart[] = [...imageParts, { text: currentMessage }];

  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    const last = contents[contents.length - 1];
    last.parts.push(...imageParts);
    const textPart = last.parts.find((p): p is { text: string } => "text" in p);
    if (textPart) {
      textPart.text += `\n\n${currentMessage}`;
    } else {
      last.parts.push({ text: currentMessage });
    }
  } else {
    contents.push({ role: "user", parts: userParts });
  }

  return contents;
}

async function generateGeminiContentStream(apiKey: string, contents: any[], systemInstruction: string, temperature: number = 0.7, grounding: boolean = false) {
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
          // Real web grounding: when on, the model runs an actual Google
          // Search and answers from live results, returning citations in
          // groundingMetadata. Off for builds. Supported on modern Gemini.
          ...(grounding ? { tools: [{ googleSearch: {} }] } : {}),
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
  context: { studioMode?: string | null; studioDomain?: string | null; choiceSelected?: boolean } = {},
  req: any = null,
) {
  const geo = getRequestGeo(req);
  recordUsage({
    userSub,
    provider,
    modelId,
    latencyMs,
    tokensEst: Math.ceil(textLength / 4),
    usedServerKey,
    studioMode: context.studioMode ?? null,
    studioDomain: context.studioDomain ?? null,
    choiceSelected: context.choiceSelected === true,
    countryCode: geo?.countryCode ?? null,
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
    const { modelId, modelName, history, userKey, openRouterKey, cognitiveLevel, task, fallbackFrom } = req.body || {};
    const communicationRequest = normalizeCommunicationRequest(req.body);
    const {
      message,
      sessionId,
      studioMode: mode,
      studioDomain: normalizedStudioDomain,
      memoryConsented,
      sessionContext: normalizedSessionContext,
      listeningSignals: normalizedListeningSignals,
      attachedImages: visionImages,
      choiceSelected,
      buildMode,
      guidedBuild,
      featureSuggest,
      isRefine,
      hasPreviewCode,
    } = communicationRequest;

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

    const explicitBuild = mode === "build";
    const explicitAsk = mode === "ask";
    const planMode = mode === "plan";
    const effectiveBuildMode = explicitAsk ? false : explicitBuild ? true : Boolean(buildMode);

    /*
     * Web grounding. When the user turns on "Grounded", the model answers from
     * a live web search instead of memory — this is what makes Quantora more
     * than a static chatbot. Deliberately OFF while building a site (a build
     * wants deterministic code, not search noise) and off for the repair task.
     */
    const grounding = Boolean(req.body?.webSearch) && !effectiveBuildMode && !guidedBuild && task !== "repair";

    let dynamicTemperature = 0.7;
    if (cognitiveLevel === 'Lightning') {
      dynamicTemperature = 0.3;
    } else if (cognitiveLevel === 'Deep Think') {
      dynamicTemperature = 0.2;
    }
    // Build requests want deterministic, runnable code over prose variety. A
    // guided intake is conversational until it builds, so keep it a bit warmer.
    if (effectiveBuildMode && !guidedBuild) dynamicTemperature = Math.min(dynamicTemperature, 0.3);
    if (planMode) dynamicTemperature = Math.min(dynamicTemperature, 0.3);

    const telemetryContext = {
      studioMode: mode,
      studioDomain: normalizedStudioDomain,
      choiceSelected: choiceSelected === true,
    };

    // The self-heal endpoint reuses this handler (via task: "repair") so it
    // adds no serverless function. It carries code+error instead of a message.
    const isRepairTask = task === "repair";
    // Build verification reuses this handler (task: "verify-build"); like repair
    // it carries code (not a chat message) and must bypass the message guards.
    const isVerifyTask = task === "verify-build";
    const isArtifactTask = isRepairTask || isVerifyTask;

    if (!isArtifactTask && (!message || typeof message !== "string" || !message.trim())) {
      return res.status(400).json({ error: "Message string is required" });
    }
    if (!isArtifactTask && message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH.toLocaleString()} characters). Please shorten it and try again.` });
    }
    const normalizedSessionId = sessionId == null ? null : normalizeOutcomeSessionId(sessionId);
    if (!isArtifactTask && sessionId != null && !normalizedSessionId) {
      return res.status(400).json({ error: "A valid sessionId is required when conversation state is supplied." });
    }
    if (!isArtifactTask) {
      const requestGeo = getRequestGeo(req);
      const safety = evaluateSafetyText(message, requestGeo?.countryCode);
      if (safety.action !== "allow") {
        return res.status(422).json({
          error: safety.userMessage,
          safety: {
            action: safety.action,
            category: safety.category,
            severity: safety.severity,
            reasonCode: safety.reasonCode,
            policyVersion: safety.policyVersion,
            crisisResource: safety.crisisResource,
          },
          requestId,
        });
      }
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
    const auth = sessionUser ? await requireActiveSession(req, res) : null;
    if (auth && !auth.ok) return;
    const activeSessionUser = auth?.ok ? auth.value.sessionUser : sessionUser;
    const mayUseServerKeys = Boolean(activeSessionUser);
    const effectiveOpenRouterKey =
      openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') : undefined);
    const effectiveGeminiKey =
      userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI') : undefined);

    const usingServerOwnedModelAccess = !userKey && !openRouterKey && mayUseServerKeys;
    if (usingServerOwnedModelAccess) {
      const approved = await isApprovedServerModel(modelId);
      if (!approved) {
        return res.status(403).json({
          error: `The model "${modelName || modelId}" is not approved for Quantora-managed usage yet.`,
          requiresApprovedModel: true,
        });
      }
    }

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

    // Build verification: score a generated artifact against quality + brief and
    // return a structured report (score, checklist, fixable issues). Reuses the
    // resolved keys; adds no serverless function.
    if (isVerifyTask) {
      const { code, brief } = req.body || {};
      if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ error: "No code provided to verify." });
      }
      try {
        const report = await verifyBuild({
          code,
          brief: typeof brief === "string" ? brief : "",
          openRouterKey: effectiveOpenRouterKey,
          geminiKey: effectiveGeminiKey,
        });
        return res.status(200).json(report);
      } catch (err: any) {
        console.error("Error in /api/chat verify-build task:", err);
        return res.status(500).json({ error: err?.message || "Verification failed." });
      }
    }

    const authoritativeOutcome = activeSessionUser && memoryConsented === true && normalizedSessionId && isStoreConfigured()
      ? await readOutcomeState(activeSessionUser.sub, normalizedSessionId)
      : null;
    const registryModels = await readModelRegistryCached();
    const modelRouting = selectModelsForTurn({
      models: registryModels.length ? registryModels : [],
      message,
      explicitModelId: typeof modelId === "string" ? modelId : null,
      hasImages: visionImages.length > 0,
      studioMode: mode,
      guidedBuild: Boolean(guidedBuild) && !explicitBuild && !planMode,
      refineMode: isRefine,
    });
    const conversationSnapshot = buildConversationSnapshot({
      outcomeRecord: authoritativeOutcome,
      sessionContext: normalizedSessionContext,
      listeningSignals: normalizedListeningSignals,
      message,
      taskCategory,
      studioMode: mode,
      studioDomain: normalizedStudioDomain,
      guidedBuild: Boolean(guidedBuild) && !explicitBuild && !planMode,
      refineMode: isRefine,
      choiceSelected: choiceSelected === true,
    });
    const conversationDecision = chooseNextConversationMove(conversationSnapshot);
    const responseContract = buildResponseContract(conversationSnapshot, conversationDecision);
    const navigatorDirective = formatConversationDecisionForPrompt(conversationSnapshot, conversationDecision);
    const promptSessionContext = authoritativeOutcome
      ? {
          ...(conversationSnapshot.goal ? { goal: conversationSnapshot.goal.statement } : {}),
          ...(conversationSnapshot.inferredFacts[0] ? { understanding: conversationSnapshot.inferredFacts[0] } : {}),
          facts: conversationSnapshot.confirmedFacts,
        }
      : normalizedSessionContext;
    const finalSystemPrompt = buildConversationSystemPrompt({
      cognitiveLevel,
      modelName: modelName || modelId,
      buildMode: effectiveBuildMode,
      guided: Boolean(guidedBuild) && !explicitBuild && !planMode,
      refineMode: isRefine,
      featureSuggest: Boolean(featureSuggest) && !effectiveBuildMode,
      planMode,
      sessionContext: promptSessionContext,
      listeningSignals: normalizedListeningSignals,
      studioDomain: normalizedStudioDomain,
      userFirstName: activeSessionUser?.name?.split(/\s+/)[0] || null,
      lastMessage: message,
      history: boundedHistory
    }) + navigatorDirective + (visionImages.length
      ? `\n\nVISION MODE\nThe user attached one or more image(s) in this request. You CAN see them — analyze what is visible and answer directly. Never say you cannot see or access the image.`
      : "");

    const conversationMetadata = (response: string) => {
      const verification = verifyConversationResponse({
        snapshot: conversationSnapshot,
        decision: conversationDecision,
        response,
      });
      return publicConversationMetadata(
        conversationSnapshot,
        conversationDecision,
        verification,
        {
          responseContract,
          evaluation: evaluationFromVerification({
            verification,
            latencyMs: Date.now() - startTime,
            usedFallback: Boolean(fallbackFrom),
          }),
          routing: modelRouting,
          communicationRequest: {
            studioMode: communicationRequest.studioMode,
            studioDomain: communicationRequest.studioDomain,
            hasPreviewCode,
          },
        },
      );
    };

    const isGeminiModel = modelId && modelId.startsWith("gemini");

    if (isGeminiModel) {
      if (!effectiveGeminiKey) {
        return res.status(401).json({
          error: "No Google Gemini API key configured. Please enter an API key in the Privacy Vault.",
          requiresKey: "gemini"
        });
      }

      try {
        const contents = buildGeminiContents(boundedHistory, message, visionImages);
        // Try grounded first; if this key's models don't support the search
        // tool, fall back to an ungrounded stream rather than failing the turn.
        let responseStream, usedModel;
        try {
          ({ stream: responseStream, usedModel } = await generateGeminiContentStream(effectiveGeminiKey, contents, finalSystemPrompt, dynamicTemperature, grounding));
        } catch (groundErr: any) {
          if (!grounding) throw groundErr;
          console.warn("Grounded Gemini call failed; retrying without grounding:", groundErr?.message || groundErr);
          ({ stream: responseStream, usedModel } = await generateGeminiContentStream(effectiveGeminiKey, contents, finalSystemPrompt, dynamicTemperature, false));
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        let fullReply = "";
        const sources: Array<{ uri: string; title: string }> = [];
        const seenSources = new Set<string>();
        for await (const chunk of responseStream) {
          if (chunk.text) {
            fullReply += chunk.text;
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
            if (res.flush) res.flush();
          }
          // Collect real citations from grounding metadata as they arrive.
          const gcs = (chunk as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(gcs)) {
            for (const gc of gcs) {
              const uri = gc?.web?.uri;
              if (uri && !seenSources.has(uri)) {
                seenSources.add(uri);
                sources.push({ uri, title: gc?.web?.title || uri });
              }
            }
          }
        }

        // Surface the sources so a grounded answer is visibly backed by the web.
        if (grounding && sources.length) {
          let block = `\n\n---\n**Sources**\n`;
          sources.slice(0, 5).forEach((s, i) => { block += `${i + 1}. [${s.title}](${s.uri})\n`; });
          fullReply += block;
          res.write(`data: ${JSON.stringify({ text: block })}\n\n`);
          if (res.flush) res.flush();
        }

        const latencyMs = Date.now() - startTime;
        logTelemetry(usedModel, latencyMs, fullReply.length, "Gemini", activeSessionUser?.sub ?? null, !userKey && mayUseServerKeys, telemetryContext, req);
        recordModelQualityEvent({ requestId, modelId: usedModel, taskCategory, outcome: "success", latencyMs, fallbackFrom });

        res.write(`data: ${JSON.stringify({ provider: `Google Gemini (${modelName || usedModel})`, latencyMs, modelId: usedModel, requestId, liveConnected: true, grounded: grounding && sources.length > 0, conversation: conversationMetadata(fullReply) })}\n\n`);
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
      formattedHistory.push({
        role: "user",
        content: visionImages.length
          ? [
              ...visionImages.map((url: string) => ({ type: "image_url", image_url: { url } })),
              { type: "text", text: message },
            ]
          : message,
      });

      // Bound the time to establish the stream. A hung/unreachable upstream
      // must not pin this serverless function until Vercel's max duration. The
      // timer is cleared the moment response headers arrive, so a long but
      // healthy stream is never cut off mid-flight.
      const orAbort = new AbortController();
      const orConnectTimeout = setTimeout(() => orAbort.abort(), 25_000);
      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: orAbort.signal,
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
            stream: true,
            // OpenRouter's web plugin performs a real search and injects results
            // (with citations) into the model's context. Only when grounding is on.
            ...(grounding ? { plugins: [{ id: "web", max_results: 3 }] } : {}),
            // JSON mode enforcement for Office files
            ...(finalSystemPrompt.includes("JSON DECK SPEC") ? { response_format: { type: "json_object" } } : {})
          }),
        });
      } catch (fetchErr: any) {
        if (orAbort.signal.aborted) {
          throw new Error(`OpenRouter request for "${modelName || openRouterModelId}" timed out before responding.`);
        }
        throw fetchErr;
      } finally {
        clearTimeout(orConnectTimeout);
      }

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

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
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
        activeSessionUser?.sub ?? null, !openRouterKey && mayUseServerKeys, telemetryContext, req);
      recordModelQualityEvent({ requestId, modelId: openRouterModelId, taskCategory, outcome: "success", latencyMs, fallbackFrom });

      res.write(`data: ${JSON.stringify({ provider: `OpenRouter (${modelName || openRouterModelId})`, latencyMs, modelId: openRouterModelId, requestId, liveConnected: true, conversation: conversationMetadata(fullReply) })}\n\n`);
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
