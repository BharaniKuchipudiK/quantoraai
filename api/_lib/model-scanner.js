import {
  catalogCreatedAt,
  fetchOpenRouterCatalog,
  isFreeModel,
  metadataFingerprint,
  providerFromId,
} from './model-catalog.js';
import {
  isModelStoreConfigured,
  readModelRegistry,
  writeModelEvents,
  writeModelRegistry,
} from './model-store.js';

export function isAuthorizedModelScan(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.authorization === `Bearer ${secret}`);
}

export async function scanModelCatalog() {
  if (!isModelStoreConfigured()) return { status: 503, body: { error: 'Model registry storage is not configured' } };

  const catalog = await fetchOpenRouterCatalog();
  if (!catalog) return { status: 503, body: { error: 'OpenRouter catalogue unavailable' } };

  const now = new Date().toISOString();
  const previousRows = await readModelRegistry();
  const previous = new Map(previousRows.map((row) => [row.id, row]));
  const freeModels = [...catalog.values()].filter(isFreeModel);
  const liveIds = new Set(freeModels.map((model) => model.id));
  const rows = [];
  const events = [];

  for (const model of freeModels) {
    const old = previous.get(model.id);
    const fingerprint = metadataFingerprint(model);
    const restored = Boolean(old?.removed_at);
    const changed = Boolean(old && old.metadata_fingerprint !== fingerprint);
    const eventType = !old ? 'discovered' : restored ? 'restored' : changed ? 'updated' : null;

    rows.push({
      id: model.id,
      name: model.name || model.id,
      provider: providerFromId(model.id),
      description: model.description || '',
      context_length: Number(model.context_length) || null,
      pricing: model.pricing || {},
      is_free: true,
      approved: old?.approved === true,
      lifecycle: old?.approved
        ? 'available'
        : (old?.lifecycle === 'testing'
          ? 'testing'
          : old?.lifecycle === 'rejected'
            ? 'rejected'
            : 'discovered'),
      health_status: 'listed',
      metadata_fingerprint: fingerprint,
      last_event: eventType || old?.last_event || 'discovered',
      first_seen_at: old?.first_seen_at || now,
      last_seen_at: now,
      last_changed_at: eventType ? now : (old?.last_changed_at || now),
      removed_at: null,
      provider_created_at: catalogCreatedAt(model),
    });

    if (eventType) {
      events.push({ model_id: model.id, event_type: eventType, details: { source: 'openrouter', name: model.name || model.id } });
    }
  }

  for (const old of previousRows) {
    if (!old.is_free || old.removed_at || liveIds.has(old.id)) continue;
    rows.push({
      ...old,
      lifecycle: 'retired',
      health_status: 'unlisted',
      last_event: 'retired',
      last_changed_at: now,
      removed_at: now,
    });
    events.push({ model_id: old.id, event_type: 'retired', details: { source: 'openrouter', name: old.name } });
  }

  const stored = await writeModelRegistry(rows);
  if (!stored) return { status: 503, body: { error: 'Could not update model registry' } };
  await writeModelEvents(events);

  return {
    status: 200,
    body: {
      ok: true,
      scannedAt: now,
      catalogSize: catalog.size,
      freeModels: freeModels.length,
      changes: events.length,
      events: events.reduce((counts, event) => ({ ...counts, [event.event_type]: (counts[event.event_type] || 0) + 1 }), {}),
    },
  };
}
