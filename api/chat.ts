import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { isStoreConfigured, readOutcomeState, recordModelQualityEvent, recordUsage } from "./_lib/store.js";
import { isProjectStoreConfigured, readProjectContext } from "./_lib/project-store.js";
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
import { travelFunctionDeclarations, executeToolCall, shouldEnableTravelTools } from './_lib/agent-tools.js';
import { appendFunctionResponse, extractSignedFunctionTurn } from './_lib/gemini-tool-turn.js';
import { modelAttemptsForTurn, shouldFallbackBeforeStreaming } from './_lib/model-execution-policy.js';
import { SseWriter, assertBudget, readWithIdleTimeout } from './_lib/sse-writer.js';
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

const MAX_MESSAGE_LENGTH = 200_000;
const MAX_HISTORY_ITEMS = 100;
const RATE_LIMIT_PER_MINUTE = 25;
const TOTAL_CHAT_BUDGET_MS = 90_000;
const PROVIDER_STREAM_IDLE_MS = 20_000;
const MAX_AGENT_STEPS = 5;
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
  if (trimmed.includes("/")) return { slug: trimmed };
  const alias = OPENROUTER_MODEL_ALIASES[trimmed.toLowerCase()];
  if (alias) return { slug: alias };
  return {
    error: `"${modelId}" is not a valid OpenRouter model id. Model ids must be namespaced (e.g. "deepseek/deepseek-chat"). Please select a different model.`,
  };
}

function buildGeminiContents(history: any[], currentMessage: string, attachedImages: string[] = []) {
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { functionCall: any } | { functionResponse: any } | Record<string, any>;
  const contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || !msg.text || typeof msg.text !== "string" || !msg.text.trim()) continue;
      const role: "user" | "model" =
        msg.sender === "ai" || msg.role === "model" || msg.role === "assistant" ? "model" : "user";
      if (contents.length === 0) {
        if (role === "user") contents.push({ role: "user", parts: [{ text: msg.text }] });
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
    if (textPart) textPart.text += `\n\n${currentMessage}`;
    else last.parts.push({ text: currentMessage });
  } else {
    contents.push({ role: "user", parts: userParts });
  }
  return contents;
}

async function openGeminiStream(input: {
  apiKey: string;
  model: string;
  contents: any[];
  systemInstruction: string;
  temperature: number;
  grounding: boolean;
  travelToolsEnabled: boolean;
}) {
  const client = new GoogleGenAI({ apiKey: input.apiKey });
  const enabledTools: any[] = [];
  if (input.grounding) enabledTools.push({ googleSearch: {} });
  if (input.travelToolsEnabled && travelFunctionDeclarations.length > 0) {
    enabledTools.push({ functionDeclarations: travelFunctionDeclarations });
  }

  const stream = await client.models.generateContentStream({
    model: input.model,
    contents: input.contents,
    config: {
      systemInstruction: input.systemInstruction,
      temperature: input.temperature,
      ...(enabledTools.length ? { tools: enabledTools } : {}),
      ...(input.systemInstruction?.includes("JSON DECK SPEC") ? { responseMimeType: "application/json" } : {})
    },
  });
  return stream;
}

async function nextAsyncIteratorWithIdleTimeout(iterator: AsyncIterator<any>, idleMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} was idle for more than ${idleMs}ms.`)), idleMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  // No second anonymous telemetry write here. Usage bookkeeping already fails
  // soft in store.ts; duplicate network telemetry was generating avoidable
  // socket errors without adding user value.
}

async function openOpenRouterResponse(input: {
  key: string;
  modelId: string;
  modelName: string;
  messages: any[];
  temperature: number;
  grounding: boolean;
  jsonMode: boolean;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.key}`,
        "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
        "X-Title": "Quantora AI",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: input.messages,
        temperature: input.temperature,
        stream: true,
        ...(input.grounding ? { plugins: [{ id: "web", max_results: 3 }] } : {}),
        ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      let detail = "";
      try {
        const parsed = JSON.parse(errText);
        detail = parsed?.error?.message || parsed?.message || "";
      } catch {
        detail = errText?.slice(0, 300) || "";
      }
      const error: any = new Error(`OpenRouter request for "${input.modelName}" failed (${response.status})${detail ? `: ${detail}` : ""}`);
      error.status = response.status;
      throw error;
    }
    return response;
  } catch (error: any) {
    if (controller.signal.aborted) {
      const timeoutError: any = new Error(`OpenRouter request for "${input.modelName}" timed out before responding.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionUser = getSessionUser(req);
  const limitKey = sessionUser ? `chat:user:${sessionUser.sub}` : `chat:ip:${clientIp(req)}`;
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
  const sse = new SseWriter(res);

  try {
    const { modelId, modelName, history, userKey, openRouterKey, cognitiveLevel, task, fallbackFrom } = req.body || {};
    const communicationRequest = normalizeCommunicationRequest(req.body);
    const {
      message,
      sessionId,
      projectId,
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
      recordModelQualityEvent({ requestId: feedbackRequestId, modelId, taskCategory, outcome });
      return res.status(202).json({ recorded: true });
    }

    const explicitBuild = mode === "build";
    const explicitAsk = mode === "ask";
    const planMode = mode === "plan";
    const effectiveBuildMode = explicitAsk ? false : explicitBuild ? true : Boolean(buildMode);
    const grounding = Boolean(req.body?.webSearch) && !effectiveBuildMode && !guidedBuild && task !== "repair";

    let dynamicTemperature = 0.7;
    if (cognitiveLevel === 'Lightning') dynamicTemperature = 0.3;
    else if (cognitiveLevel === 'Deep Think') dynamicTemperature = 0.2;
    if (effectiveBuildMode && !guidedBuild) dynamicTemperature = Math.min(dynamicTemperature, 0.3);
    if (planMode) dynamicTemperature = Math.min(dynamicTemperature, 0.3);

    const telemetryContext = {
      studioMode: mode,
      studioDomain: normalizedStudioDomain,
      choiceSelected: choiceSelected === true,
    };

    const isRepairTask = task === "repair";
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
    const boundedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS) : history;

    const auth = sessionUser ? await requireActiveSession(req, res) : null;
    if (auth && !auth.ok) return;
    const activeSessionUser = auth?.ok ? auth.value.sessionUser : sessionUser;
    const mayUseServerKeys = Boolean(activeSessionUser);
    const effectiveOpenRouterKey = openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') : undefined);
    const effectiveGeminiKey = userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI') : undefined);

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
      return res.status(401).json({ error: "Please sign in to use Quantora's built-in AI, or add your own API key.", requiresAuth: true });
    }

    if (isRepairTask) {
      const { code, error, framework } = req.body || {};
      if (!code || typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "No code provided to repair." });
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

    if (isVerifyTask) {
      const { code, brief } = req.body || {};
      if (!code || typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "No code provided to verify." });
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

    const [authoritativeOutcome, authoritativeProjectContext] = await Promise.all([
      activeSessionUser && memoryConsented === true && normalizedSessionId && isStoreConfigured()
        ? readOutcomeState(activeSessionUser.sub, normalizedSessionId)
        : Promise.resolve(null),
      activeSessionUser && projectId && isProjectStoreConfigured()
        ? readProjectContext(activeSessionUser.sub, projectId)
        : Promise.resolve(null),
    ]);
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
      projectContext: authoritativeProjectContext,
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
    const promptSessionContext = conversationSnapshot.stateSource === "authoritative"
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
      const verification = verifyConversationResponse({ snapshot: conversationSnapshot, decision: conversationDecision, response });
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
            projectId: communicationRequest.projectId,
            hasPreviewCode,
          },
        },
      );
    };

    const travelToolsEnabled = shouldEnableTravelTools(normalizedStudioDomain);
    const attempts = modelAttemptsForTurn({
      primaryModelId: modelId,
      fallbackModelIds: modelRouting?.fallbackModelIds || [],
      travelToolsEnabled,
    });
    if (!attempts.length) return res.status(400).json({ error: 'No executable model was selected.' });

    if (attempts[0].provider === 'gemini') {
      if (!effectiveGeminiKey) {
        return res.status(401).json({ error: "No Google Gemini API key configured.", requiresKey: "gemini" });
      }

      const travelPersona = travelToolsEnabled ? `\n\nTRAVEL TOOL SAFETY DIRECTIVE:
- Use connected travel tools only for the current travel-domain request.
- Live flight search may be available through Duffel. If any provider reports unavailable or errors, say so plainly and do not substitute invented results.
- Google Places may provide hotel/place identity and ratings, not date-specific room inventory or nightly rates.
- Transactional booking, ticketing, and background price-alert creation are disabled in this production build. Never claim a booking, ticket, PNR, confirmation code, purchase, alert, or background monitor exists unless a connected provider has actually confirmed it.
- Ask one material clarifying question instead of guessing missing dates, budget, group, or preferences.
- Any future transaction must require explicit human confirmation immediately before execution.
` : '';
      const injectedSystemPrompt = finalSystemPrompt + travelPersona;
      const contents = buildGeminiContents(boundedHistory, message, visionImages);
      let fullReply = '';
      const sources: Array<{ uri: string; title: string }> = [];
      const seenSources = new Set<string>();
      let usedModel = attempts[0].id;
      let currentModel = attempts[0].id;
      let modelFallbackUsed = false;
      let loopCount = 0;
      let continueAgent = true;

      while (continueAgent && loopCount < MAX_AGENT_STEPS) {
        assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
        loopCount += 1;
        continueAgent = false;

        let stream: any = null;
        let lastOpenError: any = null;
        const candidateAttempts = loopCount === 1 && !sse.isStarted
          ? attempts.filter((attempt) => attempt.provider === 'gemini')
          : [{ id: currentModel, provider: 'gemini', reason: 'primary' as const }];

        for (let index = 0; index < candidateAttempts.length; index += 1) {
          const attempt = candidateAttempts[index];
          try {
            try {
              stream = await openGeminiStream({
                apiKey: effectiveGeminiKey,
                model: attempt.id,
                contents,
                systemInstruction: injectedSystemPrompt,
                temperature: dynamicTemperature,
                grounding,
                travelToolsEnabled,
              });
            } catch (groundError) {
              if (!grounding) throw groundError;
              stream = await openGeminiStream({
                apiKey: effectiveGeminiKey,
                model: attempt.id,
                contents,
                systemInstruction: injectedSystemPrompt,
                temperature: dynamicTemperature,
                grounding: false,
                travelToolsEnabled,
              });
            }
            currentModel = attempt.id;
            usedModel = attempt.id;
            modelFallbackUsed = index > 0;
            break;
          } catch (error) {
            lastOpenError = error;
            if (sse.isStarted || index >= candidateAttempts.length - 1 || !shouldFallbackBeforeStreaming(error)) throw error;
          }
        }
        if (!stream) throw lastOpenError || new Error('Gemini did not return a stream.');

        const iterator = stream[Symbol.asyncIterator]();
        let signedFunctionTurn: ReturnType<typeof extractSignedFunctionTurn> = null;

        while (true) {
          assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
          const next = await nextAsyncIteratorWithIdleTimeout(iterator, PROVIDER_STREAM_IDLE_MS, 'Gemini stream');
          if (next.done) break;
          const chunk = next.value;
          const toolTurn = extractSignedFunctionTurn(chunk);
          if (toolTurn) {
            signedFunctionTurn = toolTurn;
            break;
          }

          if (chunk?.text) {
            fullReply += chunk.text;
            sse.text(chunk.text);
          }
          const gcs = chunk?.candidates?.[0]?.groundingMetadata?.groundingChunks;
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

        if (signedFunctionTurn) {
          if (!travelToolsEnabled) {
            throw new Error(`Blocked unexpected travel tool call outside travel domain: ${signedFunctionTurn.call.name || 'unknown'}`);
          }
          sse.status({ phase: 'tool', state: 'running', tool: signedFunctionTurn.call.name });
          const toolResult = await executeToolCall(signedFunctionTurn.call.name, signedFunctionTurn.call.args);

          if (toolResult?.action === 'PAUSE_AND_ASK') {
            sse.status({
              phase: 'tool',
              state: toolResult?.status === 'unavailable' ? 'unavailable' : 'waiting_for_user',
              tool: signedFunctionTurn.call.name,
            });
            const askMsg = toolResult?.status === 'unavailable'
              ? `\n\n${toolResult.message}\n\n`
              : `\n\n**Clarifying Question:** ${toolResult.message}\n\n`;
            fullReply += askMsg;
            sse.text(askMsg);
            break;
          }

          appendFunctionResponse(contents, signedFunctionTurn.modelTurn, signedFunctionTurn.call, toolResult);
          sse.status({ phase: 'tool', state: 'completed', tool: signedFunctionTurn.call.name });
          continueAgent = true;
        }
      }

      if (continueAgent && loopCount >= MAX_AGENT_STEPS) {
        throw new Error(`Agent execution exceeded the ${MAX_AGENT_STEPS}-step safety limit.`);
      }

      if (grounding && sources.length) {
        let block = `\n\n---\n**Sources**\n`;
        sources.slice(0, 5).forEach((source, index) => { block += `${index + 1}. [${source.title}](${source.uri})\n`; });
        fullReply += block;
        sse.text(block);
      }

      const latencyMs = Date.now() - startTime;
      logTelemetry(usedModel, latencyMs, fullReply.length, "Gemini", activeSessionUser?.sub ?? null, !userKey && mayUseServerKeys, telemetryContext, req);
      recordModelQualityEvent({ requestId, modelId: usedModel, taskCategory, outcome: "success", latencyMs, fallbackFrom: modelFallbackUsed ? modelId : fallbackFrom });
      sse.done({
        provider: `Google Gemini (${modelName || usedModel})`,
        latencyMs,
        modelId: usedModel,
        requestId,
        liveConnected: true,
        grounded: grounding && sources.length > 0,
        fallbackUsed: modelFallbackUsed,
        conversation: conversationMetadata(fullReply),
      });
      return;
    }

    if (!effectiveOpenRouterKey) {
      return res.status(401).json({ error: `No OpenRouter API key configured.`, requiresKey: "openrouter" });
    }

    const formattedHistory = [
      { role: "system", content: finalSystemPrompt },
      ...(boundedHistory || []).map((item: any) => ({
        role: item.role === "model" || item.role === "assistant" || item.sender === "ai" ? "assistant" : "user",
        content: item.text || item.content || "",
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

    const openRouterAttempts = attempts.filter((attempt) => attempt.provider === 'openrouter');
    let response: Response | null = null;
    let usedOpenRouterModel = '';
    let modelFallbackUsed = false;
    let lastError: any = null;

    for (let index = 0; index < openRouterAttempts.length; index += 1) {
      assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
      const attempt = openRouterAttempts[index];
      const resolved = resolveOpenRouterModelId(attempt.id);
      if (resolved.error) {
        lastError = new Error(resolved.error);
        continue;
      }
      try {
        response = await openOpenRouterResponse({
          key: effectiveOpenRouterKey,
          modelId: resolved.slug as string,
          modelName: attempt.id,
          messages: formattedHistory,
          temperature: dynamicTemperature,
          grounding,
          jsonMode: finalSystemPrompt.includes("JSON DECK SPEC"),
        });
        usedOpenRouterModel = resolved.slug as string;
        modelFallbackUsed = index > 0;
        break;
      } catch (error) {
        lastError = error;
        if (index >= openRouterAttempts.length - 1 || !shouldFallbackBeforeStreaming(error)) throw error;
      }
    }
    if (!response || !usedOpenRouterModel) throw lastError || new Error('OpenRouter did not return a response.');
    if (!response.body) throw new Error("OpenRouter API returned no body.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullReply = '';
    let buffer = '';
    while (true) {
      assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
      const { done, value } = await readWithIdleTimeout(reader, PROVIDER_STREAM_IDLE_MS, 'OpenRouter stream');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            fullReply += token;
            sse.text(token);
          }
        } catch { /* ignore malformed upstream event */ }
      }
    }

    const latencyMs = Date.now() - startTime;
    logTelemetry(usedOpenRouterModel, latencyMs, fullReply.length, "OpenRouter", activeSessionUser?.sub ?? null, !openRouterKey && mayUseServerKeys, telemetryContext, req);
    recordModelQualityEvent({ requestId, modelId: usedOpenRouterModel, taskCategory, outcome: "success", latencyMs, fallbackFrom: modelFallbackUsed ? modelId : fallbackFrom });
    sse.done({
      provider: `OpenRouter (${modelName || usedOpenRouterModel})`,
      latencyMs,
      modelId: usedOpenRouterModel,
      requestId,
      liveConnected: true,
      fallbackUsed: modelFallbackUsed,
      conversation: conversationMetadata(fullReply),
    });
    return;
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

    if (sse.isStarted) {
      sse.fail({
        message: err?.message || "Failed to communicate with AI model.",
        code: err?.code || 'CHAT_STREAM_FAILURE',
        retryable: shouldFallbackBeforeStreaming(err),
        provider: req.body?.modelId?.startsWith('gemini') ? 'gemini' : 'openrouter',
        requestId,
      });
      return;
    }

    return res.status(500).json({
      error: err?.message || "Failed to communicate with AI model.",
      modelName: req.body?.modelName || req.body?.modelId,
      requestId,
    });
  }
}
