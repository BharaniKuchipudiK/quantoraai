import { fetchApiGatewayKey } from '../autocomplete.js';
import { evaluateSmokeResults, SMOKE_PROMPTS } from './model-smoke-test-prompts.js';

export { SMOKE_PROMPTS, evaluateSmokeResults } from './model-smoke-test-prompts.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PROMPT_TIMEOUT_MS = 28_000;

export async function resolveOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') || null;
}

async function callModel(apiKey, modelId, prompt) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 120,
        stream: false,
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      let detail = '';
      try {
        const parsed = await response.json();
        detail = parsed?.error?.message || parsed?.message || '';
      } catch {
        detail = (await response.text()).slice(0, 200);
      }
      return { ok: false, latencyMs, error: detail || `HTTP ${response.status}`, text: '' };
    }

    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      return { ok: false, latencyMs, error: 'Empty model response', text: '' };
    }

    return { ok: true, latencyMs, error: null, text: text.trim() };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error?.name === 'AbortError'
      ? `Timed out after ${Math.round(PROMPT_TIMEOUT_MS / 1000)}s`
      : (error?.message || 'Request failed');
    return { ok: false, latencyMs, error: message, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runModelSmokeTest(modelId, apiKey = null) {
  const key = apiKey || await resolveOpenRouterKey();
  if (!key) {
    return {
      ok: false,
      passed: false,
      error: 'OpenRouter API key is not configured',
      results: [],
      ranAt: new Date().toISOString(),
    };
  }

  const rawResults = [];
  for (const prompt of SMOKE_PROMPTS) {
    rawResults.push(await callModel(key, modelId, prompt.message));
  }

  const results = evaluateSmokeResults(SMOKE_PROMPTS, rawResults);
  const passed = results.every((item) => item.passed);

  return {
    ok: true,
    passed,
    results,
    ranAt: new Date().toISOString(),
    error: passed ? null : 'One or more smoke prompts failed',
  };
}
