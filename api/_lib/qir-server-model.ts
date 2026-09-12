import { createQirGatewayRunner } from './qir-gateway-model.js';
import { GoogleGenAI } from '@google/genai';
import { fetchApiGatewayKey } from '../autocomplete.js';
import { resolveOpenRouterEnvKey } from './openrouter-key.js';
import { qirProviderFailure, type QirProviderFailure } from './qir-provider-failure.js';

export type QirServerModelSuccess = {
  status: 'success';
  provider: 'gemini' | 'openrouter' | 'vercel-gateway';
  usage?: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
  modelId: string;
  text: string;
  priorFailures?: QirProviderFailure[];
};

export type QirServerModelResult = QirServerModelSuccess | {
  status: 'failure';
  failure: QirProviderFailure;
  failures?: QirProviderFailure[];
};

export type QirServerModelRunner = (input: {
  modelId: string;
  prompt: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<QirServerModelResult>;

function safeProviderMessage(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .replace(/sk-or-v1-[\w-]+/gi, 'sk-or-v1-[key]')
    .replace(/AIza[\w-]{20,}/g, 'AIza[key]')
    .slice(0, 500);
}

function providerSignal(timeoutMs: number, ownership?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return ownership ? AbortSignal.any([ownership, timeout]) : timeout;
}

function cancelledFailure(provider: string, modelId: string): QirServerModelResult {
  return {
    status: 'failure',
    failure: qirProviderFailure({
      provider,
      modelId,
      providerCode: 'ownership_lost',
      providerMessage: 'The worker stopped this provider attempt because it no longer owns the durable Run.',
      retryable: true,
      route: 'qir-worker',
    }),
  };
}

async function openRouterError(response: Response): Promise<{ code: string; message: string }> {
  const raw = await response.text().catch(() => '');
  if (!raw) return { code: '', message: `HTTP ${response.status}` };
  try {
    const body: any = JSON.parse(raw);
    return {
      code: String(body?.error?.code || body?.code || '').slice(0, 120),
      message: safeProviderMessage(body?.error?.message || body?.message || raw),
    };
  } catch {
    return { code: '', message: safeProviderMessage(raw) };
  }
}

async function runOpenRouter(input: { modelId: string; prompt: string; timeoutMs: number; signal?: AbortSignal }): Promise<QirServerModelResult> {
  if (input.signal?.aborted) return cancelledFailure('openrouter', input.modelId);
  const key = resolveOpenRouterEnvKey() || await fetchApiGatewayKey('OPENROUTER') || '';
  if (input.signal?.aborted) return cancelledFailure('openrouter', input.modelId);
  if (!key) {
    return { status: 'failure', failure: qirProviderFailure({
      provider: 'openrouter', modelId: input.modelId, providerCode: 'credential_missing',
      providerMessage: 'No server OpenRouter credential is configured.', retryable: false, route: 'qir-worker',
    }) };
  }
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora QIR Worker',
      },
      body: JSON.stringify({
        model: input.modelId,
        stream: false,
        temperature: 0.2,
        messages: [{ role: 'user', content: input.prompt }],
      }),
      signal: providerSignal(input.timeoutMs, input.signal),
    });
  } catch (error: any) {
    if (input.signal?.aborted) return cancelledFailure('openrouter', input.modelId);
    const timeout = /timeout|aborted/i.test(String(error?.name || error?.message || error));
    return { status: 'failure', failure: qirProviderFailure({
      provider: 'openrouter', modelId: input.modelId,
      providerCode: timeout ? 'timeout' : 'transport',
      providerMessage: safeProviderMessage(error?.message || error), retryable: true, route: 'qir-worker',
    }) };
  }
  if (input.signal?.aborted) return cancelledFailure('openrouter', input.modelId);
  if (!response.ok) {
    const detail = await openRouterError(response);
    return { status: 'failure', failure: qirProviderFailure({
      provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
      providerCode: detail.code, providerMessage: detail.message,
      retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      route: 'qir-worker',
    }) };
  }
  try {
    const body: any = await response.json();
    const text = String(body?.choices?.[0]?.message?.content || '').trim();
    if (!text) return { status: 'failure', failure: qirProviderFailure({
      provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
      providerCode: 'empty_response', providerMessage: 'OpenRouter returned no model text.',
      retryable: true, route: 'qir-worker',
    }) };
    return { status: 'success', provider: 'openrouter', modelId: input.modelId, text };
  } catch (error: any) {
    return { status: 'failure', failure: qirProviderFailure({
      provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
      providerCode: 'invalid_response', providerMessage: safeProviderMessage(error?.message || error),
      retryable: true, route: 'qir-worker',
    }) };
  }
}

async function runGemini(input: { modelId: string; prompt: string; timeoutMs: number; signal?: AbortSignal }): Promise<QirServerModelResult> {
  if (input.signal?.aborted) return cancelledFailure('gemini', input.modelId);
  const key = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY || '';
  if (input.signal?.aborted) return cancelledFailure('gemini', input.modelId);
  if (!key) return { status: 'failure', failure: qirProviderFailure({
    provider: 'gemini', modelId: input.modelId, providerCode: 'credential_missing',
    providerMessage: 'No server Gemini credential is configured.', retryable: false, route: 'qir-worker',
  }) };
  try {
    const client = new GoogleGenAI({ apiKey: key });
    const response = await client.models.generateContent({
      model: input.modelId,
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      config: { temperature: 0.2, abortSignal: providerSignal(input.timeoutMs, input.signal) },
    });
    if (input.signal?.aborted) return cancelledFailure('gemini', input.modelId);
    const text = String(response.text || '').trim();
    if (!text) return { status: 'failure', failure: qirProviderFailure({
      provider: 'gemini', modelId: input.modelId, providerCode: 'empty_response',
      providerMessage: 'Gemini returned no model text.', retryable: true, route: 'qir-worker',
    }) };
    return { status: 'success', provider: 'gemini', modelId: input.modelId, text };
  } catch (error: any) {
    if (input.signal?.aborted) return cancelledFailure('gemini', input.modelId);
    const status = Number(error?.status ?? error?.code);
    const message = safeProviderMessage(error?.message || error);
    const timeout = /timeout|aborted/i.test(`${error?.name || ''} ${message}`);
    return { status: 'failure', failure: qirProviderFailure({
      provider: 'gemini', modelId: input.modelId,
      httpStatus: Number.isInteger(status) ? status : null,
      providerCode: timeout ? 'timeout' : String(error?.code || '').slice(0, 120),
      providerMessage: message, retryable: timeout || status === 429 || status >= 500, route: 'qir-worker',
    }) };
  }
}

async function runOne(modelId: string, prompt: string, timeoutMs: number, signal?: AbortSignal): Promise<QirServerModelResult> {
  return modelId.startsWith('gemini')
    ? runGemini({ modelId, prompt, timeoutMs, signal })
    : runOpenRouter({ modelId, prompt, timeoutMs, signal });
}

function modelLadder(primary: string): string[] {
  const configured = String(process.env.QIR_WORKER_FALLBACK_MODELS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const defaultCrossProvider = primary.startsWith('gemini')
    ? 'deepseek/deepseek-v4-flash-0731'
    : 'gemini-flash-latest';
  return [...new Set([primary, ...(configured.length ? configured : [defaultCrossProvider])])].slice(0, 3);
}

export const runQirServerModel: QirServerModelRunner = async ({ modelId, prompt, timeoutMs = 90_000, signal }) => {
  if (process.env.QIR_WORKER_PROVIDER === 'vercel-gateway') {
    return createQirGatewayRunner()({ modelId, prompt, timeoutMs, signal });
  }
  const primary = String(modelId || '').trim() || 'gemini-flash-latest';
  const failures: QirProviderFailure[] = [];
  for (const candidate of modelLadder(primary)) {
    if (signal?.aborted) {
      const cancelled = cancelledFailure(candidate.startsWith('gemini') ? 'gemini' : 'openrouter', candidate);
      return cancelled.status === 'failure' ? { ...cancelled, failures } : cancelled;
    }
    const result = await runOne(candidate, prompt, timeoutMs, signal);
    if (result.status === 'success') {
      return failures.length ? { ...result, priorFailures: failures } : result;
    }
    if (result.failure.providerCode === 'ownership_lost') return { ...result, failures: [...failures, result.failure] };
    failures.push({ ...result.failure, fallbackAttempted: true });
  }
  const last = failures.at(-1) || qirProviderFailure({
    provider: 'unknown', modelId: primary, providerCode: 'no_route',
    providerMessage: 'No server model route could be attempted.', retryable: false, route: 'qir-worker',
  });
  return { status: 'failure', failure: last, failures };
};
