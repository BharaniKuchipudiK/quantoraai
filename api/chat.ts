import { GoogleGenAI } from "@google/genai";
import { createHash, randomUUID } from "node:crypto";
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
import { DIRECT_MODELS, CURATED_MODELS } from "./_lib/model-catalog.js";
import { travelFunctionDeclarations, executeToolCall, shouldEnableTravelTools } from './_lib/agent-tools.js';
import { TRAVEL_FLIGHT_PROVIDER_CODE } from '../src/lib/travel-flight-resilience.js';
import { formatTravelPlaceShortlist } from '../src/lib/travel-place-shortlist.js';
import { appendFunctionResponse, extractSignedFunctionTurn } from './_lib/gemini-tool-turn.js';
import { shouldFallbackBeforeStreaming } from './_lib/model-execution-policy.js';
import {
  canonicalizeModelId,
  inferenceAttemptBudgetMs,
  planInferenceRoutes,
  recordInferenceRouteFailure,
  recordInferenceRouteSuccess,
  type InferenceRoute,
} from './_lib/inference-control-plane.js';
import { providerCircuitStore } from './_lib/provider-circuit-store.js';
import {
  attachCorrelationId,
  correlationIdForRequest,
  isGoldenCanaryRequest,
  traceBoundary,
} from './_lib/transaction-trace.js';
import { SseWriter, assertBudget, readWithIdleTimeout, remainingBudgetMs } from './_lib/sse-writer.js';
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
import { activeModelsForRouting } from "../src/lib/coding-desk-auto-model.js";
import { shouldHonorGuidedBuild, resolveEffectiveBuildMode, advisorBlocksPreviewBuild } from "../src/lib/build-intent.js";
import { shouldRefineRunningDesk } from "../src/lib/workspace-intent.js";
import { formatDeskContextForPrompt, sanitizeDeskContext } from "../src/lib/studio-desk-context.js";
import { buildArtifactContractError, validateBuildArtifactResponse } from './_lib/build-artifact-contract.js';

const PREVIEW_HTML_RECOVERY = `

PREVIEW RECOVERY
The previous attempt did not emit a runnable web page — either a chat-only plan or native iOS/Android/Python source. Quantora Live Preview can only run HTML/CSS/JS (or a React VFS). Output a short explanation, then EXACTLY one complete, self-contained HTML document in a single \`\`\`html fence that demonstrates the product in the browser. For macOS/native/agent asks, ship a glossy web dashboard mock of the workflow. Do not emit .swift, .kt, .py, or Xcode/Android project files as the only artifact.`;

const PREVIEW_REFINE_RECOVERY = `

PREVIEW RECOVERY
This turn must update the running page. The previous reply only talked. Output a short explanation, then EXACTLY one complete updated HTML document in a single \`\`\`html fence that implements the user's request. Do not claim the change unless those tags exist in the HTML.`;

const MAX_MESSAGE_LENGTH = 200_000;
const MAX_HISTORY_ITEMS = 100;
const RATE_LIMIT_PER_MINUTE = 25;
const TOTAL_CHAT_BUDGET_MS = 120_000;
const PROVIDER_STREAM_IDLE_MS = 20_000;
const MAX_AGENT_STEPS = 5;
const TASK_CATEGORIES = new Set(["coding", "vision", "research", "writing", "quick", "general"]);
const FEATURED_SERVER_MODELS = new Set([
  "gemini-flash-latest",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-super:free",
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-chat",
  "qwen/qwen-2.5-coder-32b-instruct",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemma-2-9b-it",
  "openai/gpt-4o-mini",
]);

function emitBuildProgress(sse: SseWriter, enabled: boolean, beat: { t: number }) {
  if (!enabled) return;
  const now = Date.now();
  if (beat.t && now - beat.t < 1600) return;
  beat.t = now;
  sse.status({ phase: 'build', state: 'generating', label: 'Building your preview…' });
}

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
  const canonical = canonicalizeModelId(modelId);
  if (canonical.startsWith("gemini") || modelId.startsWith("gemini")) return true;
  if (FEATURED_SERVER_MODELS.has(canonical) || FEATURED_SERVER_MODELS.has(modelId)) return true;
  const rows = await readModelRegistryCached();
  return rows.some((row: any) => (row?.id === canonical || row?.id === modelId) && row?.approved === true && row?.lifecycle === "available");
}

function resolveOpenRouterModelId(modelId: string): { slug?: string; error?: string } {
  if (!modelId || typeof modelId !== "string" || !modelId.trim()) {
    return { error: "No model was selected. Please pick a model and try again." };
  }
  const trimmed = canonicalizeModelId(modelId.trim());
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

function recentUserTextsFromChat(history: any[], currentMessage: string) {
  const texts: string[] = [];
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || (msg.sender === 'ai' || msg.role === 'model' || msg.role === 'assistant')) continue;
      const text = String(msg.text || msg.content || '').trim();
      if (text) texts.push(text);
    }
  }
  const current = String(currentMessage || '').trim();
  if (current) texts.push(current);
  return texts;
}

async function openGeminiStream(input: {
  apiKey: string;
  model: string;
  contents: any[];
  systemInstruction: string;
  temperature: number;
  grounding: boolean;
  travelToolsEnabled: boolean;
  signal?: AbortSignal;
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
      ...(input.signal ? { abortSignal: input.signal } : {}),
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

function inferenceAttemptTimeout(route: InferenceRoute, budgetMs: number) {
  const error: any = new Error(`${route.gateway} route "${route.id}" timed out after its ${budgetMs}ms attempt budget.`);
  error.status = 504;
  error.code = 'INFERENCE_ATTEMPT_TIMEOUT';
  return error;
}

function credentialCircuitPartition(secret: unknown) {
  const value = typeof secret === 'string' ? secret.trim() : '';
  return value ? `key-${createHash('sha256').update(value).digest('hex').slice(0, 16)}` : undefined;
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
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(15_000, Math.min(Number(input.timeoutMs) || 20_000, 55_000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

  const correlationId = correlationIdForRequest(req);
  attachCorrelationId(res, correlationId);
  const goldenCanary = isGoldenCanaryRequest(req);
  const transaction = typeof req.body?.goldenTransaction === 'string'
    ? req.body.goldenTransaction.slice(0, 80)
    : null;
  traceBoundary({ correlationId, boundary: 'api.chat', state: 'started', transaction, route: '/api/chat' });

  const sessionUser = getSessionUser(req);
  const limitKey = goldenCanary
    ? 'chat:golden-canary'
    : sessionUser ? `chat:user:${sessionUser.sub}` : `chat:ip:${clientIp(req)}`;
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
      isRefine: requestedRefine,
      hasPreviewCode,
    } = communicationRequest;
    const isRefine = !advisorBlocksPreviewBuild(normalizedStudioDomain)
      && (requestedRefine || (hasPreviewCode && shouldRefineRunningDesk({
        prompt: message,
        hasDeskFiles: true,
        studioDomain: normalizedStudioDomain,
      })));
    const advisorTurn = advisorBlocksPreviewBuild(normalizedStudioDomain);
    const previewCode = advisorTurn
      ? ""
      : (typeof req.body?.previewCode === "string" ? req.body.previewCode.trim().slice(0, 80_000) : "");
    const deskContext = advisorTurn ? null : sanitizeDeskContext(req.body?.deskContext);
    const deskBlock = formatDeskContextForPrompt(deskContext);
    const refineUserMessage = [
      message,
      deskBlock,
      previewCode
        ? `CURRENT RUNNING PREVIEW (source of truth — patch one existing file with filepath=, or return the full HTML document in a \`\`\`html block after a short explanation; do not claim a change unless the fenced file contains it):\n\`\`\`html\n${previewCode}\n\`\`\``
        : '',
    ].filter(Boolean).join('\n\n');

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

    const explicitBuild = communicationRequest.studioModeExplicit && mode === "build";
    const explicitAsk = communicationRequest.studioModeExplicit && mode === "ask";
    const planMode = mode === "plan";
    const honorGuided = shouldHonorGuidedBuild({
      guidedBuild: Boolean(guidedBuild),
      message,
      studioMode: mode,
    }) && !explicitBuild && !planMode;
    const effectiveBuildMode = resolveEffectiveBuildMode({
      message,
      studioDomain: normalizedStudioDomain,
      studioMode: mode,
      studioModeExplicit: communicationRequest.studioModeExplicit,
      buildMode: buildMode || isRefine,
    }) || isRefine;
    // Studio users should not toggle web search. Live search is off until a
    // product surface needs it (advisors are frozen; BUILD does not use it).
    const grounding = false;

    let dynamicTemperature = 0.7;
    if (cognitiveLevel === 'Lightning') dynamicTemperature = 0.3;
    else if (cognitiveLevel === 'Deep Think') dynamicTemperature = 0.2;
    if (effectiveBuildMode && !honorGuided) dynamicTemperature = Math.min(dynamicTemperature, 0.3);
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
    const mayUseServerKeys = Boolean(activeSessionUser) || goldenCanary;
    const effectiveOpenRouterKey = openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') : undefined);
    const effectiveGeminiKey = userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI') : undefined);

    const usingServerOwnedModelAccess = !userKey && !openRouterKey && mayUseServerKeys;
    const autoModelRequest = !modelId || modelId === 'auto';
    // Auto resolves after registry load; approval applies to the chosen route, not the sentinel.
    if (usingServerOwnedModelAccess && !autoModelRequest) {
      const approved = await isApprovedServerModel(modelId);
      if (!approved) {
        return res.status(403).json({
          error: `The model "${modelName || modelId}" is not approved for Quantora-managed usage yet.`,
          requiresApprovedModel: true,
        });
      }
    }

    if (!effectiveGeminiKey && !effectiveOpenRouterKey && !sessionUser && !goldenCanary) {
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
          job: req.body?.job && typeof req.body.job === "object" ? req.body.job : null,
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
          vfs: req.body?.vfs && typeof req.body.vfs === "object" ? req.body.vfs : {},
          brief: typeof brief === "string" ? brief : "",
          job: req.body?.job && typeof req.body.job === "object" ? req.body.job : null,
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
    const qualityHints = req.body?.qualityHints && typeof req.body.qualityHints === "object"
      ? {
          probeFailure: req.body.qualityHints.probeFailure === true,
          repair: req.body.qualityHints.repair === true || req.body?.task === "repair",
          fileCount: Number(req.body.qualityHints.fileCount) || 0,
        }
      : {
          probeFailure: req.body?.probeFailure === true,
          repair: req.body?.task === "repair",
          fileCount: 0,
        };
    const routingModels = activeModelsForRouting({
      registryRows: registryModels,
      featuredModels: [
        ...DIRECT_MODELS,
        ...CURATED_MODELS.map((model) => ({
          ...model,
          available: true,
          pricingKind: model.id.endsWith(':free') || String(model.id).startsWith('gemini') ? 'free' : 'paid',
        })),
      ],
    });
    const modelRouting = selectModelsForTurn({
      models: routingModels,
      message,
      explicitModelId: typeof modelId === "string" ? modelId : null,
      hasImages: visionImages.length > 0,
      studioMode: mode,
      guidedBuild: honorGuided,
      refineMode: isRefine,
      buildMode: effectiveBuildMode,
      taskCategory,
      hasVFS: Boolean(hasPreviewCode) || Boolean(req.body?.hasVFS),
      // Free Studio without BYOK must not Auto-pick paid-only OpenRouter routes.
      allowPaid: Boolean(openRouterKey),
      qualityHints,
    });
    if (usingServerOwnedModelAccess && autoModelRequest) {
      const approved = await isApprovedServerModel(modelRouting.primaryModelId);
      if (!approved) {
        return res.status(403).json({
          error: `The model "${modelRouting.primaryModelId}" is not approved for Quantora-managed usage yet.`,
          requiresApprovedModel: true,
        });
      }
    }
    const conversationSnapshot = buildConversationSnapshot({
      outcomeRecord: authoritativeOutcome,
      projectContext: authoritativeProjectContext,
      sessionContext: normalizedSessionContext,
      listeningSignals: normalizedListeningSignals,
      message,
      taskCategory,
      studioMode: mode,
      studioDomain: normalizedStudioDomain,
      guidedBuild: honorGuided,
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
      guided: honorGuided,
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
    const attempts = await planInferenceRoutes({
      primaryModelId: canonicalizeModelId(modelRouting?.primaryModelId || modelId),
      fallbackModelIds: modelRouting?.fallbackModelIds || [],
      models: registryModels,
      requiredCapabilities: travelToolsEnabled
        ? ['text', 'travel-tools']
        : visionImages.length ? ['text', 'vision'] : effectiveBuildMode ? ['text', 'code'] : ['text'],
      geminiAvailable: Boolean(effectiveGeminiKey),
      openRouterAvailable: Boolean(effectiveOpenRouterKey),
      geminiCredentialScope: userKey ? 'user' : 'server',
      openRouterCredentialScope: openRouterKey ? 'user' : 'server',
      geminiCredentialPartition: credentialCircuitPartition(userKey),
      openRouterCredentialPartition: credentialCircuitPartition(openRouterKey),
      requestPartition: correlationId,
      circuitStore: providerCircuitStore,
    });
    if (!attempts.length) {
      return res.status(503).json({
        error: 'Quantora could not reach a healthy AI route for this turn. Please retry in a moment.',
      });
    }
    traceBoundary({
      correlationId,
      boundary: 'inference.plan',
      state: 'selected',
      transaction,
      modelId: attempts[0].id,
      gateway: attempts[0].gateway,
      upstreamProvider: attempts[0].upstreamProvider,
      failureDomain: attempts[0].failureDomain,
      quotaDomain: attempts[0].quotaDomain,
      costClass: attempts[0].costClass,
      health: attempts[0].health,
      circuit: attempts[0].circuit,
    });

    // Provider-neutral text/build execution. The route is not committed until
    // the upstream produces a usable first token, so a dead endpoint, exhausted
    // quota domain, or empty stream can fail over before Quantora starts SSE.
    if (!travelToolsEnabled) {
      const formattedHistory = [
        { role: "system", content: finalSystemPrompt },
        ...(boundedHistory || []).map((item: any) => ({
          role: item.role === "model" || item.role === "assistant" || item.sender === "ai" ? "assistant" : "user",
          content: item.text || item.content || "",
        })),
      ];
      formattedHistory.push({
        role: "user",
        content: visionImages.length
          ? [
              ...visionImages.map((url: string) => ({ type: "image_url", image_url: { url } })),
              { type: "text", text: refineUserMessage },
            ]
          : refineUserMessage,
      });
      const geminiContents = buildGeminiContents(boundedHistory, refineUserMessage, visionImages);
      const sources: Array<{ uri: string; title: string }> = [];
      const seenSources = new Set<string>();
      let fullReply = '';
      let usedRoute: InferenceRoute | null = null;
      let lastRouteError: any = null;
      const failedQuotaDomains = new Set<string>();
      let recoverHtmlPreview = false;
      let htmlRecoveryTried = false;

      for (let index = 0; index < attempts.length; index += 1) {
        const route = attempts[index];
        if (failedQuotaDomains.has(route.quotaDomain)) {
          traceBoundary({
            correlationId,
            boundary: 'inference.provider',
            state: 'skipped',
            transaction,
            modelId: route.id,
            gateway: route.gateway,
            upstreamProvider: route.upstreamProvider,
            failureDomain: route.failureDomain,
            quotaDomain: route.quotaDomain,
            costClass: route.costClass,
            detailCode: 'quota-domain-failed-this-turn',
          });
          continue;
        }
        const attemptStartedAt = Date.now();
        const attemptBudgetMs = effectiveBuildMode
          ? inferenceAttemptBudgetMs(remainingBudgetMs(startTime, TOTAL_CHAT_BUDGET_MS), attempts.length - index)
          : remainingBudgetMs(startTime, TOTAL_CHAT_BUDGET_MS);
        traceBoundary({
          correlationId,
          boundary: 'inference.provider',
          state: 'attempting',
          transaction,
          modelId: route.id,
          gateway: route.gateway,
          upstreamProvider: route.upstreamProvider,
          failureDomain: route.failureDomain,
          quotaDomain: route.quotaDomain,
          costClass: route.costClass,
          health: route.health,
          circuit: route.circuit,
          budgetMs: attemptBudgetMs,
          detailCode: effectiveBuildMode ? 'build' : 'conversation',
        });

        try {
          let attemptReply = '';
          const buildBeat = { t: 0 };
          const attemptSystemPrompt = recoverHtmlPreview
            ? `${finalSystemPrompt}${isRefine ? PREVIEW_REFINE_RECOVERY : PREVIEW_HTML_RECOVERY}`
            : finalSystemPrompt;
          formattedHistory[0] = { role: 'system', content: attemptSystemPrompt };
          emitBuildProgress(sse, effectiveBuildMode, buildBeat);
          if (route.provider === 'gemini') {
            const openRemainingMs = attemptBudgetMs - (Date.now() - attemptStartedAt);
            if (openRemainingMs <= 0) throw inferenceAttemptTimeout(route, attemptBudgetMs);
            const openController = new AbortController();
            const openTimer = setTimeout(() => openController.abort(), openRemainingMs);
            let stream;
            try {
              stream = await openGeminiStream({
                apiKey: effectiveGeminiKey as string,
                model: route.id,
                contents: geminiContents,
                systemInstruction: attemptSystemPrompt,
                temperature: dynamicTemperature,
                grounding,
                travelToolsEnabled: false,
                signal: openController.signal,
              });
            } catch (error) {
              if (openController.signal.aborted) throw inferenceAttemptTimeout(route, attemptBudgetMs);
              throw error;
            } finally {
              clearTimeout(openTimer);
            }
            const iterator = stream[Symbol.asyncIterator]();
            while (true) {
              assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
              const attemptRemainingMs = attemptBudgetMs - (Date.now() - attemptStartedAt);
              if (attemptRemainingMs <= 0) {
                await iterator.return?.(undefined);
                throw inferenceAttemptTimeout(route, attemptBudgetMs);
              }
              let next;
              try {
                next = await nextAsyncIteratorWithIdleTimeout(iterator, Math.min(PROVIDER_STREAM_IDLE_MS, attemptRemainingMs), 'Gemini stream');
              } catch (error) {
                if (Date.now() - attemptStartedAt >= attemptBudgetMs) {
                  await iterator.return?.(undefined);
                  throw inferenceAttemptTimeout(route, attemptBudgetMs);
                }
                throw error;
              }
              if (next.done) break;
              const chunk = next.value;
              if (chunk?.text) {
                attemptReply += chunk.text;
                emitBuildProgress(sse, effectiveBuildMode, buildBeat);
                if (!effectiveBuildMode) sse.text(chunk.text);
              }
              const groundingChunks = chunk?.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (Array.isArray(groundingChunks)) {
                for (const groundingChunk of groundingChunks) {
                  const uri = groundingChunk?.web?.uri;
                  if (uri && !seenSources.has(uri)) {
                    seenSources.add(uri);
                    sources.push({ uri, title: groundingChunk?.web?.title || uri });
                  }
                }
              }
            }
          } else {
            const resolved = resolveOpenRouterModelId(route.id);
            if (resolved.error) throw new Error(resolved.error);
            const response = await openOpenRouterResponse({
              key: effectiveOpenRouterKey as string,
              modelId: resolved.slug as string,
              modelName: route.id,
              messages: formattedHistory,
              temperature: dynamicTemperature,
              grounding,
              jsonMode: finalSystemPrompt.includes('JSON DECK SPEC'),
              timeoutMs: attemptBudgetMs,
            });
            if (!response.body) throw Object.assign(new Error('OpenRouter API returned no body.'), { status: 502 });
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            while (true) {
              assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
              const attemptRemainingMs = attemptBudgetMs - (Date.now() - attemptStartedAt);
              if (attemptRemainingMs <= 0) {
                await reader.cancel().catch(() => {});
                throw inferenceAttemptTimeout(route, attemptBudgetMs);
              }
              let chunkResult;
              try {
                chunkResult = await readWithIdleTimeout(reader, Math.min(PROVIDER_STREAM_IDLE_MS, attemptRemainingMs), 'OpenRouter stream');
              } catch (error) {
                if (Date.now() - attemptStartedAt >= attemptBudgetMs) {
                  await reader.cancel().catch(() => {});
                  throw inferenceAttemptTimeout(route, attemptBudgetMs);
                }
                throw error;
              }
              const { done, value } = chunkResult;
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
                    attemptReply += token;
                    emitBuildProgress(sse, effectiveBuildMode, buildBeat);
                    if (!effectiveBuildMode) sse.text(token);
                  }
                } catch { /* malformed upstream events do not satisfy the route contract */ }
              }
            }
          }

          if (!attemptReply.trim()) {
            throw Object.assign(new Error(`${route.gateway} returned an empty response.`), { status: 502 });
          }
          if (effectiveBuildMode) {
            const artifactContract = validateBuildArtifactResponse(
              attemptReply,
              goldenCanary ? transaction : null,
            );
            if (!artifactContract.ok) throw buildArtifactContractError(artifactContract.detailCode);
          }
          fullReply = attemptReply;
          usedRoute = route;
          await recordInferenceRouteSuccess(providerCircuitStore, route);
          traceBoundary({
            correlationId,
            boundary: 'inference.provider',
            state: 'succeeded',
            transaction,
            modelId: route.id,
            gateway: route.gateway,
            upstreamProvider: route.upstreamProvider,
            failureDomain: route.failureDomain,
            quotaDomain: route.quotaDomain,
            costClass: route.costClass,
            durationMs: Date.now() - attemptStartedAt,
          });
          if (effectiveBuildMode) sse.text(attemptReply);
          break;
        } catch (error: any) {
          lastRouteError = error;
          const shouldRecoverHtml = error?.detailCode === 'browser-preview-missing'
            || error?.detailCode === 'code-fences-missing'
            || (isRefine && error?.detailCode === 'code-fences-missing');
          if (shouldRecoverHtml) recoverHtmlPreview = true;
          const status = Number(error?.status || (error?.name === 'AbortError' ? 504 : 500));
          if ([401, 402, 403, 429].includes(status)) failedQuotaDomains.add(route.quotaDomain);
          // A response-contract miss is specific to this prompt/output. It may
          // use this turn's independent fallback, but must not poison the
          // shared operational health circuit for unrelated users.
          if (error?.code !== 'BUILD_ARTIFACT_CONTRACT') {
            await recordInferenceRouteFailure(providerCircuitStore, route, status);
          }
          traceBoundary({
            correlationId,
            boundary: 'inference.provider',
            state: 'failed',
            transaction,
            modelId: route.id,
            gateway: route.gateway,
            upstreamProvider: route.upstreamProvider,
            failureDomain: route.failureDomain,
            quotaDomain: route.quotaDomain,
            costClass: route.costClass,
            durationMs: Date.now() - attemptStartedAt,
            statusCode: status,
            detailCode: error?.code === 'BUILD_ARTIFACT_CONTRACT'
              ? error.detailCode
              : status === 429 ? 'quota-exhausted' : status === 404 ? 'route-not-found' : status === 504 ? 'attempt-timeout' : 'provider-failure',
          });
          if (shouldRecoverHtml && !htmlRecoveryTried && !sse.isCommitted) {
            htmlRecoveryTried = true;
            index -= 1;
            continue;
          }
          const nextRoute = attempts[index + 1];
          if (
            sse.isCommitted
            || index >= attempts.length - 1
            || !shouldFallbackBeforeStreaming(error, {
              currentGateway: route.gateway,
              nextGateway: nextRoute?.gateway,
            })
          ) throw error;
        }
      }

      if (!usedRoute) throw lastRouteError || new Error('No inference route completed the turn.');
      if (grounding && sources.length) {
        let sourceBlock = '\n\n---\n**Sources**\n';
        sources.slice(0, 5).forEach((source, index) => { sourceBlock += `${index + 1}. [${source.title}](${source.uri})\n`; });
        fullReply += sourceBlock;
        sse.text(sourceBlock);
      }

      const latencyMs = Date.now() - startTime;
      logTelemetry(
        usedRoute.id,
        latencyMs,
        fullReply.length,
        usedRoute.gateway === 'gemini' ? 'Gemini' : 'OpenRouter',
        activeSessionUser?.sub ?? null,
        usedRoute.gateway === 'gemini' ? !userKey && mayUseServerKeys : !openRouterKey && mayUseServerKeys,
        telemetryContext,
        req,
      );
      recordModelQualityEvent({
        requestId,
        modelId: usedRoute.id,
        taskCategory,
        outcome: 'success',
        latencyMs,
        fallbackFrom: usedRoute.reason === 'fallback' ? modelId : fallbackFrom,
      });
      sse.done({
        provider: `${usedRoute.gateway === 'gemini' ? 'Google Gemini' : 'OpenRouter'} (${usedRoute.id})`,
        latencyMs,
        modelId: usedRoute.id,
        requestId,
        correlationId,
        liveConnected: true,
        grounded: grounding && sources.length > 0,
        fallbackUsed: usedRoute.reason === 'fallback',
        inferenceRoute: {
          gateway: usedRoute.gateway,
          upstreamProvider: usedRoute.upstreamProvider,
          failureDomain: usedRoute.failureDomain,
          quotaDomain: usedRoute.quotaDomain,
          costClass: usedRoute.costClass,
          health: usedRoute.health,
          circuit: usedRoute.circuit,
        },
        conversation: conversationMetadata(fullReply),
      });
      traceBoundary({
        correlationId,
        boundary: 'api.chat',
        state: 'succeeded',
        transaction,
        route: '/api/chat',
        modelId: usedRoute.id,
        gateway: usedRoute.gateway,
        durationMs: latencyMs,
      });
      return;
    }

    if (attempts[0].provider === 'gemini') {
      if (!effectiveGeminiKey) {
        return res.status(401).json({ error: "No Google Gemini API key configured.", requiresKey: "gemini" });
      }

      const travelPersona = travelToolsEnabled ? `\n\nTRAVEL TOOL SAFETY DIRECTIVE:
- Use connected travel tools only for the current travel-domain request.
- Live flight search may be available through Duffel. Do not call search_flights until origin airport, destination airport, and a YYYY-MM-DD departure date are known — ask for what is missing instead. If the provider is not connected or errors, say so plainly and do not substitute invented results.
- Hotels, stays, property ratings, websites, Google Maps links, and photos MUST use search_hotels (Google Places). Never call get_places_routing for hotels. Dates are optional for discovery.
- search_hotels location MUST be a city, island, or neighbourhood (Phuket, Seminyak, Gold Coast, Singapore). If the latest user message is that place, use it. Do not ask for the city again. If the traveller only named a vibe such as beach resorts or kids' clubs, ASK for the place first. Do not call the tool with that vibe as the location.
- After search_hotels succeeds, paste mandatoryShortlist verbatim so every property has ★ Google user rating (when supplied), a website or Maps link, and is clickable. Do not invent extra hotels or ratings.
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
      let travelPlaces: any[] = [];

      while (continueAgent && loopCount < MAX_AGENT_STEPS) {
        assertBudget(startTime, TOTAL_CHAT_BUDGET_MS, 'chat turn');
        loopCount += 1;
        continueAgent = false;

        let stream: any = null;
        let lastOpenError: any = null;
        const candidateAttempts = loopCount === 1 && !sse.isCommitted
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
            if (
              sse.isCommitted
              || index >= candidateAttempts.length - 1
              || !shouldFallbackBeforeStreaming(error, {
                currentGateway: 'gemini',
                nextGateway: candidateAttempts[index + 1] ? 'gemini' : undefined,
              })
            ) throw error;
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
          const turnAttempt = Math.max(1, Number(req.body?.turnAttempt) || 1);
          const toolResult = await executeToolCall(signedFunctionTurn.call.name, signedFunctionTurn.call.args, {
            recentUserTexts: recentUserTextsFromChat(boundedHistory, message),
            turnAttempt,
          });
          if (Array.isArray(toolResult?.hotels) && toolResult.hotels.length) {
            travelPlaces = toolResult.hotels;
          } else if (Array.isArray(toolResult?.attractions) && toolResult.attractions.length) {
            travelPlaces = toolResult.attractions;
          } else if (Array.isArray(toolResult?.places) && toolResult.places.length) {
            travelPlaces = toolResult.places;
          }

          if (toolResult?.action === 'PAUSE_AND_ASK') {
            const autoRetryToolTurn = toolResult?.autoRetryTurn === true
              && toolResult?.retryable === true
              && !sse.isCommitted;
            sse.status({
              phase: 'tool',
              state: autoRetryToolTurn
                ? 'cleared'
                : (toolResult?.status === 'unavailable' ? 'unavailable' : 'waiting_for_user'),
              tool: signedFunctionTurn.call.name,
            });
            if (autoRetryToolTurn) {
              // Mirror turn-recovery (#273): clear the tool status and fail the
              // stream as retryable so the desk re-runs the tool turn once.
              sse.fail({
                message: String(toolResult?.message || 'Live flight lookup failed. Retrying…'),
                code: TRAVEL_FLIGHT_PROVIDER_CODE,
                retryable: true,
                requestId,
                correlationId,
              });
              return;
            }
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

      if (travelPlaces.length) {
        const shortlist = formatTravelPlaceShortlist(travelPlaces);
        const hasRating = /★\s*\d/.test(fullReply);
        const hasLink = /https?:\/\//i.test(fullReply);
        if (shortlist && (!hasRating || !hasLink)) {
          const hotelBlock = `\n\n${shortlist}\n`;
          fullReply += hotelBlock;
          sse.text(hotelBlock);
        }
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
        correlationId,
        liveConnected: true,
        grounded: grounding && sources.length > 0,
        fallbackUsed: modelFallbackUsed,
        conversation: conversationMetadata(fullReply),
        ...(travelPlaces.length ? { travelPlaces: travelPlaces.slice(0, 8) } : {}),
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
            { type: "text", text: refineUserMessage },
          ]
        : refineUserMessage,
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
        if (
          index >= openRouterAttempts.length - 1
          || !shouldFallbackBeforeStreaming(error, {
            currentGateway: 'openrouter',
            nextGateway: openRouterAttempts[index + 1] ? 'openrouter' : undefined,
          })
        ) throw error;
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
      correlationId,
      liveConnected: true,
      fallbackUsed: modelFallbackUsed,
      conversation: conversationMetadata(fullReply),
    });
    return;
  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    traceBoundary({
      correlationId,
      boundary: 'api.chat',
      state: 'failed',
      transaction,
      route: '/api/chat',
      durationMs: Date.now() - startTime,
      statusCode: Number(err?.status || 500),
      detailCode: Number(err?.status) === 429 ? 'quota-exhausted' : 'chat-failure',
    });
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

    const retryableProviderFailure = shouldFallbackBeforeStreaming(err);
    const artifactContractFailure = err?.code === 'BUILD_ARTIFACT_CONTRACT';
    const publicError = artifactContractFailure
      ? (err?.detailCode === 'browser-preview-missing'
        ? 'The model wrote native iOS/Android files. Preview only runs a web page. Retry and I will rebuild HTML.'
        : err?.detailCode === 'code-fences-missing'
          ? 'The model answered in chat without files. Preview needs a page. Retry and I will rebuild HTML.'
        : 'Quantora generated files that could not run in Preview. Retry and I will rebuild a complete page.')
      : retryableProviderFailure
      ? "Quantora could not reach a healthy AI route for this turn. Please retry in a moment."
      : "Quantora could not complete this request.";

    if (sse.isStarted) {
      sse.fail({
        message: publicError,
        code: err?.code || 'CHAT_STREAM_FAILURE',
        retryable: retryableProviderFailure || artifactContractFailure,
        provider: req.body?.modelId?.startsWith('gemini') ? 'gemini' : 'openrouter',
        requestId,
        correlationId,
      });
      return;
    }

    return res.status(retryableProviderFailure ? 503 : 500).json({
      error: publicError,
      modelName: req.body?.modelName || req.body?.modelId,
      requestId,
      correlationId,
    });
  }
}
