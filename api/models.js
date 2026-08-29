/*
 * Public model registry for the picker and the left-navigation dashboard.
 *
 * OpenRouter's live catalogue answers "is it listed right now?". Supabase
 * history answers "is it new, changed, restored, or retired?". Neither signal
 * automatically approves a model for routing by itself: the scheduled scan may
 * auto-promote only after a bounded discovery canary passes. Paid catalogue
 * entries stay labeled and never become free-Studio selectable.
 */
import {
  CURATED_MODELS,
  DIRECT_MODELS,
  discoverFeaturedRoster,
  discoverAnthropicFlagships,
  catalogCreatedAt,
  fetchOpenRouterCatalog,
  formatContext,
  isFreeModel,
  providerFromId,
} from './_lib/model-catalog.js';
import { readModelQualitySummary, readModelRegistry } from './_lib/model-store.js';
import { overallOutcomeSignals } from '../shared/model-outcome-routing.js';
import { rankAdminDashboardModels } from '../shared/model-dashboard-ranking.js';
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
  const quality = overallOutcomeSignals(qualityRows);
  const fetchedAt = new Date().toISOString();
  /*
   * Anthropic flagships are not in CURATED_MODELS (their ids move, and a stale
   * one is a route the provider rejects), so they are read from the live
   * catalogue here exactly as the chat router reads them. Without this the
   * router could reach Claude on Auto while the picker never listed it — the
   * model was selectable by the platform but invisible to the user.
   */
  const flagships = discoverAnthropicFlagships(catalog).map((model) => ({
    ...model,
    quality: quality.get(model.id) || null,
  }));
  // The everyday roster, resolved against the SAME live catalogue. Without this
  // the picker only ever showed the two DIRECT_MODELS and the Anthropic
  // flagships, so every roster change was invisible to the person choosing.
  const roster = discoverFeaturedRoster(catalog).map((model) => ({
    ...model,
    quality: quality.get(model.id) || null,
  }));
  const models = [
    ...DIRECT_MODELS.map((model) => ({ ...model, quality: quality.get(model.id) || null })),
    ...flagships,
    ...roster,
  ];
  const dashboardModels = [
    ...flagships.map((model) => ({
      ...model,
      status: 'available',
      health: 'listed',
      event: 'listed',
      isNew: false,
      isUpdated: false,
      approved: true,
      selectable: true,
      category: 'featured',
    })),
  ].concat(roster.map((model) => ({
    ...model,
    status: 'available',
    health: 'listed',
    event: 'listed',
    isNew: false,
    isUpdated: false,
    approved: true,
    selectable: true,
    category: 'featured',
  }))).concat(DIRECT_MODELS.map((model) => ({
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
  })));

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
    /*
     * A model the provider no longer lists is not a choice - picking it produces
     * a 404 at the gateway and a silent downgrade. It used to be shown greyed
     * with "No longer listed by OpenRouter", which still cluttered the picker
     * with dead options (the reported stale Gemini 2.5 Flash). Keep it out of the
     * user-facing list entirely; the admin dashboard below still records it as
     * retired so the change is visible to an operator.
     *
     * Only when the catalogue itself was unreachable (available defaults true)
     * do we keep listing, so a fetch timeout cannot empty the picker.
     */
    if (available) models.push(model);
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

  // Surface the strongest measured performers first within each category group,
  // so the dashboard (and the free-models shortlist derived from it) leads with
  // what has actually earned it rather than raw discovery order.
  const rankedDashboardModels = rankAdminDashboardModels(dashboardModels);

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
    freeModelsAvailable: rankedDashboardModels.filter((model) => model.category === 'approved').slice(0, 25),
    fetchedAt,
    dashboard: {
      source: catalog ? 'live' : 'fallback',
      catalogSize: catalog ? catalog.size : 0,
      fetchedAt,
      summary,
      models: rankedDashboardModels,
    },
  });
}
