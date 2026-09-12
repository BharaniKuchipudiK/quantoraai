import { GoogleGenAI } from '@google/genai';
import { fetchApiGatewayKey } from '../autocomplete.js';
import { resolveOpenRouterEnvKey } from './openrouter-key.js';
import { qirProviderFailure, type QirProviderFailure } from './qir-provider-failure.js';

export type QirServerModelSuccess = {
  status: 'success';
  provider: 'gemini' | 'openrouter';
  modelId: string;
  text: string;
};

export type QirServerModelResult = QirServerModelSuccess | {
  status: 'failure';
  failure: QirProviderFailure;
};

export type QirServerModelRunner = (input: {
  modelId: string;
  prompt: string;
  timeoutMs?: number;
}) => Promise<QirServerModelResult>;

function safeProviderMessage(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .replace(/sk-or-v1-[\w-]+/gi, 'sk-or-v1-[key]')
    .replace(/AIza[\w-]{20,}/g, 'AIza[key]')
    .slice(0, 500);
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

async function runOpenRouter(input: { modelId: string; prompt: string; timeoutMs: number }): Promise<QirServerModelResult> {
  const key = resolveOpenRouterEnvKey() || await fetchApiGatewayKey('OPENROUTER') || '';
  if (!key) {
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'openrouter', modelId: input.modelId, providerCode: 'credential_missing',
        providerMessage: 'No server OpenRouter credential is configured.', retryable: false, route: 'qir-worker',
      }),
    };
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
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error: any) {
    const timeout = /timeout|aborted/i.test(String(error?.name || error?.message || error));
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'openrouter', modelId: input.modelId,
        providerCode: timeout ? 'timeout' : 'transport',
        providerMessage: safeProviderMessage(error?.message || error), retryable: true, route: 'qir-worker',
      }),
    };
  }
  if (!response.ok) {
    const detail = await openRouterError(response);
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
        providerCode: detail.code, providerMessage: detail.message,
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        route: 'qir-worker',
      }),
    };
  }
  try {
    const body: any = await response.json();
    const text = String(body?.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      return {
        status: 'failure',
        failure: qirProviderFailure({
          provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
          providerCode: 'empty_response', providerMessage: 'OpenRouter returned no model text.',
          retryable: true, route: 'qir-worker',
        }),
      };
    }
    return { status: 'success', provider: 'openrouter', modelId: input.modelId, text };
  } catch (error: any) {
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'openrouter', modelId: input.modelId, httpStatus: response.status,
        providerCode: 'invalid_response', providerMessage: safeProviderMessage(error?.message || error),
        retryable: true, route: 'qir-worker',
      }),
    };
  }
}

async function runGemini(input: { modelId: string; prompt: string; timeoutMs: number }): Promise<QirServerModelResult> {
  const key = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY || '';
  if (!key) {
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'gemini', modelId: input.modelId, providerCode: 'credential_missing',
        providerMessage: 'No server Gemini credential is configured.', retryable: false, route: 'qir-worker',
      }),
    };
  }
  try {
    const client = new GoogleGenAI({ apiKey: key });
    const response = await client.models.generateContent({
      model: input.modelId,
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      config: { temperature: 0.2, abortSignal: AbortSignal.timeout(input.timeoutMs) },
    });
    const text = String(response.text || '').trim();
    if (!text) {
      return {
        status: 'failure',
        failure: qirProviderFailure({
          provider: 'gemini', modelId: input.modelId, providerCode: 'empty_response',
          providerMessage: 'Gemini returned no model text.', retryable: true, route: 'qir-worker',
        }),
      };
    }
    return { status: 'success', provider: 'gemini', modelId: input.modelId, text };
  } catch (error: any) {
    const status = Number(error?.status ?? error?.code);
    const message = safeProviderMessage(error?.message || error);
    const timeout = /timeout|aborted/i.test(`${error?.name || ''} ${message}`);
    return {
      status: 'failure',
      failure: qirProviderFailure({
        provider: 'gemini', modelId: input.modelId,
        httpStatus: Number.isInteger(status) ? status : null,
        providerCode: timeout ? 'timeout' : String(error?.code || '').slice(0, 120),
        providerMessage: message,
        retryable: timeout || status === 429 || status >= 500,
        route: 'qir-worker',
      }),
    };
  }
}

export const runQirServerModel: QirServerModelRunner = async ({ modelId, prompt, timeoutMs = 90_000 }) => {
  const selected = String(modelId || '').trim() || 'gemini-flash-latest';
  return selected.startsWith('gemini')
    ? runGemini({ modelId: selected, prompt, timeoutMs })
    : runOpenRouter({ modelId: selected, prompt, timeoutMs });
};
