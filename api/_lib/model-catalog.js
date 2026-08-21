const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const FETCH_TIMEOUT_MS = 4_000;

export const CURATED_MODELS = [
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Fast multimodal reasoning for complex logic and general tasks.',
    contextWindow: '1M',
    tag: 'MULTIMODAL',
    icon: 'sparkles',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    description: 'Open-weights logic, math and coding powerhouse.',
    contextWindow: '64k',
    tag: 'OPEN',
    icon: 'cpu',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'Qwen',
    description: 'Code synthesis and UI generation specialist.',
    contextWindow: '128k',
    tag: 'CODING',
    icon: 'brain',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'Highly capable open-source instruction following.',
    contextWindow: '128k',
    tag: 'OPEN',
    icon: 'database',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'General assistant tuned for fast, low-cost queries.',
    contextWindow: '128k',
    tag: 'FAST',
    icon: 'zap',
  },
];

export const DIRECT_MODELS = [
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash',
    provider: 'Google',
    description: 'Primary Quantora route. Direct Google API, independent of OpenRouter quota.',
    contextWindow: '1M',
    available: true,
    pricingKind: 'free-tier',
    tag: 'RECOMMENDED',
    icon: 'sparkles',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'Nemotron 3 Super 120B',
    provider: 'NVIDIA',
    description: 'Optional OpenRouter free route for coding and reasoning. Shares OpenRouter account quota.',
    contextWindow: '262k',
    available: true,
    pricingKind: 'free',
    tag: 'OPENROUTER',
    icon: 'cpu',
  },
];

export async function fetchOpenRouterCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.OPENROUTER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    const response = await fetch(OPENROUTER_CATALOG_URL, { headers, signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    const list = Array.isArray(body?.data) ? body.data : [];
    const catalog = new Map();
    for (const model of list) {
      if (model && typeof model.id === 'string') catalog.set(model.id, model);
    }
    return catalog.size ? catalog : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isFreeModel(entry) {
  if (!entry) return false;
  if (typeof entry.id === 'string' && entry.id.endsWith(':free')) return true;
  const prompt = Number(entry.pricing?.prompt);
  const completion = Number(entry.pricing?.completion);
  return Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
}

export function formatContext(length, fallback = '—') {
  const value = Number(length);
  if (!value || Number.isNaN(value)) return fallback;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function providerFromId(id = '') {
  const vendor = id.split('/')[0];
  if (!vendor) return 'Unknown';
  return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

export function metadataFingerprint(model) {
  return JSON.stringify({
    name: model.name || model.id,
    description: model.description || '',
    contextLength: Number(model.context_length) || null,
    pricing: model.pricing || {},
    architecture: model.architecture || {},
    supportedParameters: model.supported_parameters || [],
  });
}

export function catalogCreatedAt(model) {
  const timestamp = Number(model?.created);
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}
