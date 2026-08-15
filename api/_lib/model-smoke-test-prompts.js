/** Fixed prompts every discovered model must pass before admin approval. */
export const SMOKE_PROMPTS = [
  {
    id: 'ping',
    label: 'Basic response',
    message: 'Reply with exactly the word OK and nothing else.',
    validate: (text) => /\bOK\b/i.test((text || '').trim()),
  },
  {
    id: 'math',
    label: 'Simple reasoning',
    message: 'What is 17 + 25? Reply with only the number.',
    validate: (text) => /\b42\b/.test((text || '').replace(/[^\d\s]/g, ' ')),
  },
  {
    id: 'build',
    label: 'Build relevance',
    message: 'In one sentence, what can a builder create with an AI studio like Quantora?',
    validate: (text) => (text || '').trim().length >= 24,
  },
];

export function evaluateSmokeResults(prompts, rawResults) {
  return prompts.map((prompt, index) => {
    const raw = rawResults[index];
    const passed = Boolean(raw?.ok && prompt.validate(raw.text));
    return {
      id: prompt.id,
      label: prompt.label,
      passed,
      latencyMs: raw?.latencyMs ?? null,
      error: raw?.error || (passed ? null : 'Response did not meet qualification criteria'),
      snippet: raw?.text ? raw.text.slice(0, 120) : '',
    };
  });
}
