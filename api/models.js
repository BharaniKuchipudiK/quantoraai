export default function handler(req, res) {
  // Authoritative model registry served to the frontend.
  //
  // HARD RULE: every OpenRouter model `id` below MUST be a fully namespaced
  // OpenRouter slug in `vendor/model` form (e.g. "deepseek/deepseek-chat").
  // OpenRouter's /chat/completions endpoint rejects any bare id (like
  // "deepseek-coder-v2") with a 400 Bad Request — that exact mismatch is what
  // used to surface in the UI as "OpenRouter API failed: 400 Bad Request".
  // The only non-namespaced ids permitted here are Google models, which the
  // chat handler routes to the Gemini SDK instead (see api/chat.ts:
  // `modelId.startsWith("gemini")`).
  //
  // Keep this list and the `fallbackModels` array in src/App.jsx in sync — they
  // are the two sources of truth the app reads from, and both must contain only
  // valid slugs so the app behaves identically whether or not this endpoint
  // resolves.

  // Set cache headers so Vercel edge caches this aggressively.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const dynamicModels = [
    {
      id: 'gemini-flash-latest',
      name: 'Gemini Flash',
      provider: 'Google',
      description: 'Fast multimodal responses. Routed through Google directly.',
      contextWindow: '1M',
      available: true,
      tag: 'RECOMMENDED',
      icon: 'sparkles'
    },
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek V3',
      provider: 'DeepSeek',
      description: 'Open-weights logic, math and coding powerhouse.',
      contextWindow: '64k',
      available: true,
      tag: 'OPEN',
      icon: 'cpu'
    },
    {
      id: 'qwen/qwen-2.5-coder-32b-instruct',
      name: 'Qwen 2.5 Coder 32B',
      provider: 'Qwen',
      description: 'Code synthesis and UI generation specialist.',
      contextWindow: '128k',
      available: true,
      tag: 'CODING',
      icon: 'brain'
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B',
      provider: 'Meta',
      description: 'Highly capable open-source instruction following.',
      contextWindow: '128k',
      available: true,
      tag: 'OPEN',
      icon: 'database'
    },
    {
      id: 'google/gemma-2-9b-it',
      name: 'Gemma 2 9B',
      provider: 'Google',
      description: 'Fast reasoning and spec planning via OpenRouter.',
      contextWindow: '8k',
      available: true,
      tag: 'FAST',
      icon: 'zap'
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      description: 'General assistant tuned for fast, low-cost queries.',
      contextWindow: '128k',
      available: true,
      tag: 'RECOMMENDED',
      icon: 'brain'
    }
  ];

  return res.status(200).json({
    models: dynamicModels,
    fetchedAt: new Date().toISOString()
  });
}
