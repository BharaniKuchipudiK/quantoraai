export default function handler(req, res) {
  // This simulates a dynamic model registry, which in production would fetch 
  // from a Vercel Edge Config, Redis, or a cron-updated JSON file on S3.
  
  // Set cache headers so Vercel edge caches this aggressively
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  
  const dynamicModels = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Omni)',
      provider: 'OpenAI',
      description: 'Flagship multimodal model with real-time vision and audio.',
      contextWindow: '128k',
      available: true,
      tag: 'RECOMMENDED',
      icon: 'brain'
    },
    {
      id: 'claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      description: 'Extremely fast and intelligent coding powerhouse.',
      contextWindow: '200k',
      available: true,
      tag: 'NEW',
      icon: 'zap'
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      description: 'Massive context window for full-codebase analysis.',
      contextWindow: '2M',
      available: true,
      tag: 'PRO',
      icon: 'sparkles'
    },
    {
      id: 'deepseek-coder-v2',
      name: 'DeepSeek Coder V2',
      provider: 'DeepSeek',
      description: 'Open-weights coding expert optimized for zero-shot tasks.',
      contextWindow: '128k',
      available: true,
      tag: 'OPEN',
      icon: 'cpu'
    },
    {
      id: 'llama-3.3-70b',
      name: 'Llama 3.3 (70B)',
      provider: 'Meta',
      description: 'Highly capable open-source instruction following.',
      contextWindow: '8k',
      available: false,
      unavailableReason: 'Node Capacity Full',
      tag: 'OPEN',
      icon: 'database'
    }
  ];

  return res.status(200).json({
    models: dynamicModels,
    fetchedAt: new Date().toISOString()
  });
}
