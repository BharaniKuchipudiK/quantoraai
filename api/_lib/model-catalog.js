const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const GEMINI_CATALOG_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const FETCH_TIMEOUT_MS = 4_000;

/*
 * Deliberately empty.
 *
 * This was a hand-written list of models (Gemini 2.5 Flash, Qwen 2.5 Coder,
 * GPT-4o Mini, Llama 3.3, DeepSeek V3) frozen at the time it was typed. Vendors
 * ship successors constantly, so the list aged into a menu of superseded options
 * that the picker still offered - and a hardcoded id is exactly what caused the
 * retired-Anthropic-model outage: the router selects it, the provider rejects it,
 * and the turn silently degrades.
 *
 * Every route is now DISCOVERED instead of named:
 *   - DIRECT_MODELS  - the two first-party defaults, verified by their own gateway
 *   - discoverAnthropicFlagships() - read from the live provider catalogue
 *   - the approved model registry - operator-curated, checked for liveness
 *
 * Keep it empty. Adding an id here reintroduces the defect.
 */
export const CURATED_MODELS = [];

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

/**
 * Discover the paid flagship coders that OpenRouter ACTUALLY lists right now.
 *
 * A hardcoded slug is how the Coding Desk ended up routing to a model id that
 * no longer exists: the router picked it, OpenRouter 404'd the unknown id, and
 * the turn silently fell back to a cheap coder that truncates. Model ids move
 * (claude-3.5-sonnet -> claude-sonnet-4.x -> claude-sonnet-5 ...), so the
 * flagship is READ from the live catalogue instead of named in code.
 *
 * Ranked newest-first: on this vendor the newer Sonnet/Opus is the stronger
 * coder, and "newest listed" keeps working after the next rename with no edit.
 * Haiku-tier is excluded — it carries the vendor name without the completion
 * reliability that makes a flagship worth escalating to.
 */
export function discoverAnthropicFlagships(catalog, { limit = 3 } = {}) {
  if (!catalog) return [];
  const rows = [];
  for (const model of catalog.values()) {
    const id = String(model?.id || '');
    if (!/^anthropic\//i.test(id)) continue;
    if (!/sonnet|opus/i.test(id)) continue;
    if (isFreeModel(model)) continue;
    /*
     * A batch endpoint is asynchronous - it accepts a job and returns later - so
     * it cannot serve a streaming chat turn. Offering it in the picker is
     * offering a route that will never stream a reply.
     */
    if (/batch/i.test(id) || /batch/i.test(String(model?.name || ''))) continue;
    rows.push(model);
  }
  rows.sort((left, right) => (Number(right?.created) || 0) - (Number(left?.created) || 0));

  /*
   * Keep ONE entry per model family. A vendor ships variants of the same model
   * (":fast", ":thinking", dated snapshots), and counting each against the limit
   * let three Opus 5 variants fill every slot and push Sonnet 5 out of the list
   * entirely - the reported "still no Sonnet". Families first, variants never at
   * the cost of a different model.
   */
  const familyOf = (id) => String(id).split(':')[0].replace(/-\d{8}$/, '');
  const bestPerFamily = new Map();
  for (const model of rows) {
    const family = familyOf(model.id);
    if (!bestPerFamily.has(family)) bestPerFamily.set(family, model);
  }

  return [...bestPerFamily.values()].slice(0, limit).map((model) => ({
    id: model.id,
    name: model.name || model.id,
    provider: 'Anthropic',
    // Read from the catalogue's declared modalities, never inferred from the id:
    // routing uses this to keep an image turn on the model the user picked.
    vision: Array.isArray(model?.architecture?.input_modalities)
      ? model.architecture.input_modalities.includes('image')
      : undefined,
    description: model.description
      || 'Paid flagship coder discovered from the live OpenRouter catalogue. Writes complete, non-truncated builds.',
    contextWindow: formatContext(model.context_length),
    pricingKind: 'paid',
    tag: 'CODING',
    icon: 'brain',
    available: true,
  }));
}

const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = { at: 0, value: null };

/** Catalogue read on the chat path: cached so a build turn adds no per-request fetch. */
export async function fetchOpenRouterCatalogCached() {
  const now = Date.now();
  if (catalogCache.value && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.value;
  const fresh = await fetchOpenRouterCatalog();
  if (fresh) catalogCache = { at: now, value: fresh };
  return fresh || catalogCache.value;
}

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

/**
 * Official Gemini model list (Generative Language API). Requires GEMINI_API_KEY.
 * Used for the admin "Available on internet" catalog — not an approval signal.
 */
export async function fetchGeminiCatalog() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = new URL(GEMINI_CATALOG_URL);
    url.searchParams.set('key', key);
    url.searchParams.set('pageSize', '100');
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = await response.json();
    const list = Array.isArray(body?.models) ? body.models : [];
    const catalog = new Map();
    for (const model of list) {
      const rawName = typeof model?.name === 'string' ? model.name : '';
      if (!rawName) continue;
      const id = rawName.replace(/^models\//, '');
      if (!id.startsWith('gemini')) continue;
      catalog.set(id, {
        id,
        name: model.displayName || id,
        description: model.description || '',
        pricingKind: 'free-tier',
        provider: 'Google',
        source: 'gemini',
        supportedGenerationMethods: model.supportedGenerationMethods || [],
      });
    }
    return catalog.size ? catalog : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Flatten live provider catalogues into admin Internet-available rows. */
export function buildInternetCatalogEntries({ openRouter = null, gemini = null } = {}) {
  const entries = [];
  if (openRouter) {
    for (const model of openRouter.values()) {
      if (!model?.id) continue;
      entries.push({
        id: model.id,
        name: model.name || model.id,
        provider: providerFromId(model.id),
        description: model.description || '',
        pricing: model.pricing || {},
        pricingKind: isFreeModel(model) ? 'free' : 'paid',
        contextWindow: formatContext(model.context_length),
        createdAt: catalogCreatedAt(model),
        source: 'openrouter',
      });
    }
  }
  if (gemini) {
    for (const model of gemini.values()) {
      if (!model?.id) continue;
      entries.push({
        id: model.id,
        name: model.name || model.id,
        provider: model.provider || 'Google',
        description: model.description || '',
        pricingKind: model.pricingKind || 'free-tier',
        contextWindow: null,
        createdAt: null,
        source: 'gemini',
      });
    }
  }
  return entries;
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
