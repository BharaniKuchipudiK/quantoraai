/** Fixed discovery-canary prompts and pure evaluation (no network I/O). */

export const CANARY_MAX_LATENCY_MS = 25_000;

export const CANARY_PROMPTS = Object.freeze({
  ping: {
    id: 'ping',
    label: 'Latency + reply',
    message: 'Reply with exactly the word PONG and nothing else.',
    validate: (text) => Boolean(String(text || '').trim()) && /\bPONG\b/i.test(String(text)),
  },
  coding: {
    id: 'coding',
    label: 'Coding reply',
    message: 'Write a one-line JavaScript arrow function named add that returns a+b. Reply with only that function.',
    validate: (text) => {
      const body = String(text || '').trim();
      if (body.length < 8) return false;
      return /=>|function\s*\(|=\s*\(/.test(body) && /\+/.test(body);
    },
  },
});

export function isCodingModelId(modelId = '') {
  return /(?:^|\/|-)(code|coder|codestral|starcoder|devstral|nemotron)(?:$|\/|-|:)|qwen[^/]*coder|deepseek-r1|deepseek-coder/i.test(String(modelId));
}

export function canaryPromptsForModel(modelId) {
  const prompts = [CANARY_PROMPTS.ping];
  if (isCodingModelId(modelId)) prompts.push(CANARY_PROMPTS.coding);
  return prompts;
}

export function evaluateCanaryResults(prompts, rawResults, maxLatencyMs = CANARY_MAX_LATENCY_MS) {
  return prompts.map((prompt, index) => {
    const raw = rawResults[index] || {};
    const latencyOk = Number.isFinite(raw.latencyMs) && raw.latencyMs >= 0 && raw.latencyMs <= maxLatencyMs;
    const contentOk = Boolean(raw.ok && prompt.validate(raw.text));
    const passed = contentOk && latencyOk;
    let error = null;
    if (!raw.ok) error = raw.error || 'Request failed';
    else if (!contentOk) error = 'Response did not meet canary criteria';
    else if (!latencyOk) error = `Latency ${raw.latencyMs}ms exceeded ${maxLatencyMs}ms`;
    return {
      id: prompt.id,
      label: prompt.label,
      passed,
      latencyMs: raw.latencyMs ?? null,
      error,
      snippet: raw.text ? String(raw.text).slice(0, 120) : '',
    };
  });
}
