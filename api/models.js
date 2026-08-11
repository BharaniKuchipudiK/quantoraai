/*
 * Model registry served to the frontend.
 *
 * Source of truth is OpenRouter's LIVE catalog (https://openrouter.ai/api/v1/models),
 * not a hand-maintained list. We keep a small *curated allowlist* below that
 * decides WHICH models we feature and how they are labeled — but a model's
 * availability is derived from the live catalog at request time, so a model
 * that OpenRouter drops automatically flips to unavailable with zero code
 * changes, and we never again ship a bare/stale id that 400s.
 *
 * Resilience is deliberate: if the live fetch fails we fall back to the last
 * values we can compute, then to the static seed below, so the picker (and
 * therefore chat) never breaks just because the upstream catalog is briefly
 * unreachable.
 *
 * HARD RULE: every OpenRouter `id` here MUST be a fully namespaced
 * `vendor/model` slug. Google models (gemini*) are the only non-namespaced ids
 * allowed — the chat handler routes those to the Gemini SDK, not OpenRouter.
 */

// Curated allowlist. `id` + display metadata only — `available` is derived live.
const CURATED = [
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
    id: 'google/gemma-2-9b-it',
    name: 'Gemma 2 9B',
    provider: 'Google',
    description: 'Fast reasoning and spec planning via OpenRouter.',
    contextWindow: '8k',
    tag: 'FAST',
    icon: 'zap',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'General assistant tuned for fast, low-cost queries.',
    contextWindow: '128k',
    tag: 'RECOMMENDED',
    icon: 'brain',
  },
];

// Google-routed models. These do NOT come from OpenRouter (the chat handler
// sends them to the Gemini SDK), so they are always offered here; the Gemini
// key path validates the exact model at call time.
const GEMINI = [
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash',
    provider: 'Google',
    description: 'Fast multimodal responses. Routed through Google directly.',
    contextWindow: '1M',
    available: true,
    tag: 'RECOMMENDED',
    icon: 'sparkles',
  },
];

const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const FETCH_TIMEOUT_MS = 4000;

// Fetch the live OpenRouter catalog as a Map<id, catalogEntry>. Returns null on
// any failure (network, timeout, non-2xx, malformed body) — callers treat null
// as "catalog unknown" and stay optimistic rather than marking everything down.
async function fetchOpenRouterCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Authing raises rate limits but is not required for the public list.
    if (process.env.OPENROUTER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    const resp = await fetch(OPENROUTER_CATALOG_URL, { headers, signal: controller.signal });
    if (!resp.ok) return null;
    const json = await resp.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    if (list.length === 0) return null;
    const map = new Map();
    for (const m of list) {
      if (m && typeof m.id === 'string') map.set(m.id, m);
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isFreeModel(entry) {
  if (!entry) return false;
  if (typeof entry.id === 'string' && entry.id.endsWith(':free')) return true;
  const p = entry.pricing || {};
  const prompt = parseFloat(p.prompt);
  const completion = parseFloat(p.completion);
  return prompt === 0 && completion === 0;
}

function formatContext(len, fallback) {
  if (!len || Number.isNaN(Number(len))) return fallback;
  const n = Number(len);
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export default async function handler(req, res) {
  // Edge-cache so we are not hammering OpenRouter on every page load, while
  // still refreshing a couple of times an hour. stale-while-revalidate serves
  // the cached copy instantly and refreshes in the background.
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const catalog = await fetchOpenRouterCatalog();

  const models = [...GEMINI];

  for (const c of CURATED) {
    const live = catalog ? catalog.get(c.id) : undefined;
    // When the catalog is known, availability is authoritative. When it is
    // unknown (fetch failed), stay optimistic so chat keeps working — the
    // chat handler still surfaces a clear error if the model is truly gone.
    const available = catalog ? Boolean(live) : true;
    models.push({
      ...c,
      available,
      unavailableReason: available ? undefined : 'Currently unavailable on OpenRouter',
      // Prefer the live context length when we have it.
      contextWindow: live?.context_length ? formatContext(live.context_length, c.contextWindow) : c.contextWindow,
    });
  }

  /*
   * Curated-allowlist companion: surface free models that exist on OpenRouter
   * but are NOT in our curated list, so the list can be expanded intentionally
   * (and, later, powers the "new models available" dashboard). This is data
   * only — the UI does not auto-add these.
   */
  let freeModelsAvailable = [];
  if (catalog) {
    const curatedIds = new Set(CURATED.map(m => m.id));
    for (const entry of catalog.values()) {
      if (curatedIds.has(entry.id)) continue;
      if (!isFreeModel(entry)) continue;
      freeModelsAvailable.push({
        id: entry.id,
        name: entry.name || entry.id,
        contextWindow: formatContext(entry.context_length, '—'),
      });
      if (freeModelsAvailable.length >= 15) break;
    }
  }

  return res.status(200).json({
    models,
    source: catalog ? 'live' : 'fallback',
    catalogSize: catalog ? catalog.size : 0,
    freeModelsAvailable,
    fetchedAt: new Date().toISOString(),
  });
}
