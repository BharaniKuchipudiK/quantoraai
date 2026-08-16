/*
 * Public model registry for the picker and the left-navigation dashboard.
 *
 * OpenRouter's live catalogue answers "is it listed right now?". Supabase
 * history answers "is it new, changed, restored, or retired?". Neither signal
 * automatically approves a model for routing: discovery and qualification are
 * deliberately separate so a free but incompatible model cannot receive user
 * traffic just because it appeared upstream.
 */
import {
  CURATED_MODELS,
  DIRECT_MODELS,
  catalogCreatedAt,
  fetchOpenRouterCatalog,
  formatContext,
  isFreeModel,
  providerFromId,
} from './_lib/model-catalog.js';
import { readModelQualitySummary, readModelRegistry } from './_lib/model-store.js';
import { isAuthorizedModelScan, scanModelCatalog } from './_lib/model-scanner.js';
import { purgeOldTelemetry } from './_lib/store.js';

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Retention TTL for operational telemetry (usage / product_events). These hold
// no prompt or response bodies — only metadata — so this is footprint
// minimization, not a functional dependency. (Roadmap 0.2)
const TELEMETRY_RETENTION_DAYS = 30;

function isRecentlyCreated(model) {
  const createdAt = catalogCreatedAt(model);
  return Boolean(createdAt && Date.now() - new Date(createdAt).getTime() <= NEW_WINDOW_MS);
}

function candidateFromLive(model, stored) {
  const event = stored?.last_event || (isRecentlyCreated(model) ? 'discovered' : 'listed');
  return {
    id: model.id,
    name: model.name || model.id,
    provider: providerFromId(model.id),
    description: model.description || 'New free model discovered through OpenRouter.',
    contextWindow: formatContext(model.context_length),
    pricingKind: 'free',
    status: stored?.lifecycle === 'testing' ? 'testing' : stored?.approved ? 'available' : 'discovered',
    health: 'listed',
    event,
    isNew: event === 'discovered' || event === 'restored',
    isUpdated: event === 'updated',
    approved: stored?.approved === true,
    firstSeenAt: stored?.first_seen_at || catalogCreatedAt(model),
    lastChangedAt: stored?.last_changed_at || catalogCreatedAt(model),
    selectable: stored?.approved === true,
  };
}

function aggregateQuality(rows) {
  const result = new Map();
  for (const row of rows) {
    const current = result.get(row.model_id) || { successes: 0, failures: 0, helpful: 0, notHelpful: 0, fallbacks: 0 };
    current.successes += Number(row.successful_responses) || 0;
    current.failures += Number(row.failed_responses) || 0;
    current.helpful += Number(row.helpful_votes) || 0;
    current.notHelpful += Number(row.not_helpful_votes) || 0;
    current.fallbacks += Number(row.fallback_rescues) || 0;
    result.set(row.model_id, current);
  }
  for (const quality of result.values()) {
    const reliabilitySamples = quality.successes + quality.failures;
    const feedbackSamples = quality.helpful + quality.notHelpful;
    const reliability = reliabilitySamples ? quality.successes / reliabilitySamples : null;
    const usefulness = feedbackSamples ? quality.helpful / feedbackSamples : null;
    quality.sampleSize = reliabilitySamples;
    quality.score = reliabilitySamples >= 5
      ? Math.round(100 * ((reliability ?? 0.5) * 0.7 + (usefulness ?? reliability ?? 0.5) * 0.3))
      : null;
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Reuse this existing serverless function for the scheduled persistence job.
  // This keeps Quantora within Vercel Hobby's function limit; ordinary public
  // GET requests continue to receive the read-only dashboard response below.
  if (isAuthorizedModelScan(req)) {
    res.setHeader('Cache-Control', 'no-store');
    // Piggyback the daily retention sweep on the same scheduled run.
    const [result, retention] = await Promise.all([
      scanModelCatalog(),
      purgeOldTelemetry(TELEMETRY_RETENTION_DAYS),
    ]);
    return res.status(result.status).json({ ...result.body, telemetryPurged: retention.ok });
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const [catalog, storedRows, qualityRows] = await Promise.all([
    fetchOpenRouterCatalog(),
    readModelRegistry(),
    readModelQualitySummary(),
  ]);
  const stored = new Map(storedRows.map((row) => [row.id, row]));
  const quality = aggregateQuality(qualityRows);
  const fetchedAt = new Date().toISOString();
  const models = DIRECT_MODELS.map((model) => ({ ...model, quality: quality.get(model.id) || null }));
  const dashboardModels = DIRECT_MODELS.map((model) => ({
    ...model,
    quality: quality.get(model.id) || null,
    status: 'available',
    health: 'untested',
    event: 'listed',
    isNew: false,
    isUpdated: false,
    approved: true,
    selectable: true,
    category: 'featured',
  }));

  for (const curated of CURATED_MODELS) {
    const live = catalog ? catalog.get(curated.id) : undefined;
    const available = catalog ? Boolean(live) : true;
    const pricingKind = live ? (isFreeModel(live) ? 'free' : 'paid') : 'unknown';
    const model = {
      ...curated,
      quality: quality.get(curated.id) || null,
      available,
      unavailableReason: available ? undefined : 'No longer listed by OpenRouter',
      contextWindow: live?.context_length ? formatContext(live.context_length, curated.contextWindow) : curated.contextWindow,
      pricingKind,
    };
    models.push(model);
    dashboardModels.push({
      ...model,
      status: available ? 'available' : 'offline',
      health: available ? 'listed' : 'unlisted',
      event: available ? 'listed' : 'retired',
      isNew: false,
      isUpdated: false,
      approved: true,
      selectable: available,
      category: 'featured',
    });
  }

  const liveFree = catalog ? [...catalog.values()].filter(isFreeModel) : [];
  const dashboardIds = new Set(dashboardModels.map((model) => model.id));
  
  // Track candidates for admin view, but DO NOT append them to the public model list
  // to avoid cluttering the dropdown with dozens of untested free models.
  for (const model of liveFree) {
    if (dashboardIds.has(model.id)) continue;
    const storedRow = stored.get(model.id);
    const candidate = {
      ...candidateFromLive(model, storedRow),
      quality: quality.get(model.id) || null,
      category: 'candidate',
    };
    dashboardIds.add(model.id);
    
    // We only push to dashboardModels for the admin panel, NOT to the `models` array
    // which powers the public dropdown.
    dashboardModels.push({
      ...candidate,
      status: storedRow?.approved === true ? 'available' : candidate.status,
      selectable: storedRow?.approved === true,
      category: storedRow?.approved === true ? 'approved' : 'candidate',
    });
  }

  // Preserve recently retired free models so users can see what disappeared.
  for (const row of storedRows) {
    if (!row.is_free || !row.removed_at || dashboardIds.has(row.id)) continue;
    dashboardModels.push({
      id: row.id,
      name: row.name,
      provider: row.provider,
      description: row.description || 'This model is no longer listed by its provider.',
      contextWindow: formatContext(row.context_length),
      pricingKind: 'free',
      status: 'retired',
      health: 'unlisted',
      event: 'retired',
      isNew: false,
      isUpdated: false,
      approved: row.approved === true,
      selectable: false,
      firstSeenAt: row.first_seen_at,
      lastChangedAt: row.last_changed_at,
      category: 'retired',
    });
    dashboardIds.add(row.id);
  }

  const summary = {
    available: dashboardModels.filter((model) => model.status === 'available').length,
    free: dashboardModels.filter((model) => (model.pricingKind === 'free' || model.pricingKind === 'free-tier') && model.status !== 'retired').length,
    new: dashboardModels.filter((model) => model.isNew).length,
    updated: dashboardModels.filter((model) => model.isUpdated).length,
    offline: dashboardModels.filter((model) => ['offline', 'retired'].includes(model.status)).length,
    evaluating: dashboardModels.filter((model) => ['discovered', 'testing'].includes(model.status)).length,
  };

  return res.status(200).json({
    models,
    source: catalog ? 'live' : 'fallback',
    catalogSize: catalog ? catalog.size : 0,
    freeModelsAvailable: dashboardModels.filter((model) => model.category === 'approved').slice(0, 25),
    fetchedAt,
    dashboard: {
      source: catalog ? 'live' : 'fallback',
      catalogSize: catalog ? catalog.size : 0,
      fetchedAt,
      summary,
      models: dashboardModels,
    },
  });
}
