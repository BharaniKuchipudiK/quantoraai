/**
 * Lightweight discovery canary: prove latency + a non-empty reply before a
 * free model can be auto-promoted into Active. Coding-tagged models get an
 * extra one-line code check. This is intentionally stricter than "listed"
 * and cheaper than the admin three-prompt smoke suite.
 */
import { fetchApiGatewayKey } from '../autocomplete.js';
import {
  canaryPromptsForModel,
  evaluateCanaryResults,
} from './model-canary-prompts.js';

export {
  CANARY_MAX_LATENCY_MS,
  CANARY_PROMPTS,
  canaryPromptsForModel,
  evaluateCanaryResults,
  isCodingModelId,
} from './model-canary-prompts.js';

export const CANARY_PROMPT_TIMEOUT_MS = 28_000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function resolveOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || await fetchApiGatewayKey('OPENROUTER') || null;
}

async function callOpenRouter(apiKey, modelId, prompt) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CANARY_PROMPT_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora AI model canary',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
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
      ? `Timed out after ${Math.round(CANARY_PROMPT_TIMEOUT_MS / 1000)}s`
      : (error?.message || 'Request failed');
    return { ok: false, latencyMs, error: message, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runModelCanary(modelId, apiKey = null) {
  const key = apiKey || await resolveOpenRouterKey();
  const prompts = canaryPromptsForModel(modelId);
  if (!key) {
    return {
      ok: false,
      passed: false,
      error: 'OpenRouter API key is not configured',
      results: [],
      ranAt: new Date().toISOString(),
      prompts: prompts.map((p) => p.id),
    };
  }

  const rawResults = [];
  for (const prompt of prompts) {
    rawResults.push(await callOpenRouter(key, modelId, prompt.message));
  }
  const results = evaluateCanaryResults(prompts, rawResults);
  const passed = results.every((item) => item.passed);
  return {
    ok: true,
    passed,
    results,
    ranAt: new Date().toISOString(),
    error: passed ? null : 'One or more canary checks failed',
    prompts: prompts.map((p) => p.id),
  };
}
