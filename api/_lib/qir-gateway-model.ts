import type { generateText } from 'ai';
import { qirProviderFailure } from './qir-provider-failure.js';
import type { QirServerModelRunner, QirServerModelResult } from './qir-server-model.js';

// Explicit credentials prevent an OIDC/default key from bypassing the pilot budget.
export function createQirGatewayRunner(options: {
  env?: NodeJS.ProcessEnv;
  generate?: typeof generateText;
} = {}): QirServerModelRunner {
  const env = options.env || process.env;
  return async ({ modelId, prompt, timeoutMs = 90_000, signal }) => {
    const fail = (code: string, retryable = false, httpStatus?: number): QirServerModelResult => ({
      status: 'failure', failure: qirProviderFailure({
        provider: 'vercel-gateway', modelId, providerCode: code, httpStatus,
        // Do not journal raw SDK errors: they can contain request bodies and credentials.
        providerMessage: `Coding Gateway request stopped: ${code}.`, retryable, route: 'qir-worker',
      }),
    });
    if (signal?.aborted) return fail('ownership_lost', true);
    const key = env.QIR_AI_GATEWAY_API_KEY?.trim();
    if (!key) return fail('credential_missing');
    const allowed = String(env.QIR_GATEWAY_MODELS || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!modelId.includes('/') || !allowed.includes(modelId)) return fail('model_not_allowed');
    if (!prompt.trim() || prompt.length > 80_000) return fail('prompt_limit');
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(90_000, timeoutMs)));
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      // Load the SDK at the call boundary so the Workflow CJS bundle initializes
      // its schema dependencies before Gateway creates top-level schemas.
      const sdk = await import('ai');
      const generate = options.generate || sdk.generateText;
      const result = await generate({
        model: sdk.createGateway({ apiKey: key })(modelId),
        prompt, maxOutputTokens: 4096, maxRetries: 0, abortSignal,
        // No model fallback here. QIR owns bounded recovery, including budget refusal.
      });
      if (signal?.aborted) return fail('ownership_lost', true);
      if (timeout.aborted) return fail('timeout', true);
      if (result.finishReason !== 'stop') return fail('incomplete_response');
      const text = result.text?.trim();
      if (!text) return fail('empty_response', true);
      const metadata = result.providerMetadata?.gateway as Record<string, unknown> | undefined;
      const rawCost = metadata?.cost;
      const cost = typeof rawCost === 'number' ? rawCost : NaN;
      return {
        status: 'success', provider: 'vercel-gateway', modelId, text,
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          costUsd: Number.isFinite(cost) && cost >= 0 ? cost : null,
        },
      };
    } catch (error: unknown) {
      if (signal?.aborted) return fail('ownership_lost', true);
      if (timeout.aborted) return fail('timeout', true);
      const chain: any[] = [];
      let current: any = error;
      for (let i = 0; current && i < 4; i++, current = current.cause) chain.push(current);
      // AI SDK can wrap a Gateway 402 as a server error. Budget refusal must win.
      const quota = chain.some(e => Number(e.statusCode || e.status) === 402 || [e.type, e.data?.type, e.data?.error?.type, e.message].some(value => typeof value === 'string' && value.includes('quota_for_entity_exceeded')));
      if (quota) return fail('budget_exceeded', false, 402);
      const status = chain.map(e => Number(e.statusCode || e.status)).find(n => n >= 400 && n <= 599);
      return fail(status ? `http_${status}` : 'transport', status === undefined || status === 408 || status === 429 || status >= 500, status);
    }
  };
}
