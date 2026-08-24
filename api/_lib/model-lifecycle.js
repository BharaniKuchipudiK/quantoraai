/**
 * Pure helpers for Model Dashboard buckets and auto-promotion policy.
 * Discovery (catalog APIs) is separate from Active (routing permission).
 */
export const NEW_MODEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_CANARIES_PER_SCAN = 5;
export const INTERNET_LIST_CAP = 250;

export function pricingKindFromEntry(entry) {
  if (!entry) return 'unknown';
  if (entry.pricingKind) return entry.pricingKind;
  if (typeof entry.id === 'string' && entry.id.startsWith('gemini')) {
    return 'free-tier';
  }
  if (typeof entry.is_free === 'boolean') {
    return entry.is_free ? 'free' : 'paid';
  }
  const prompt = Number(entry.pricing?.prompt);
  const completion = Number(entry.pricing?.completion);
  if (typeof entry.id === 'string' && entry.id.endsWith(':free')) return 'free';
  if (Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0) return 'free';
  if (Number.isFinite(prompt) || Number.isFinite(completion)) return 'paid';
  return 'unknown';
}

export function isStudioFreeEligible(pricingKind) {
  return pricingKind === 'free' || pricingKind === 'free-tier';
}

export function isWithinNewWindow(iso, nowMs = Date.now(), windowMs = NEW_MODEL_WINDOW_MS) {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return false;
  const age = nowMs - at;
  return age >= 0 && age <= windowMs;
}

/**
 * Free, not rejected, not already Active — eligible for automated canary
 * promotion. Paid models stay Catalog / internet-available only.
 */
export function isAutoPromoteCandidate(row) {
  if (!row?.id) return false;
  if (row.approved === true && row.lifecycle === 'available') return false;
  if (row.lifecycle === 'rejected' || row.lifecycle === 'retired') return false;
  if (row.removed_at) return false;
  if (row.is_free !== true) return false;
  const kind = pricingKindFromEntry(row);
  return isStudioFreeEligible(kind);
}

export function rankCanaryCandidates(rows, nowMs = Date.now()) {
  return [...rows]
    .filter(isAutoPromoteCandidate)
    .sort((a, b) => {
      const aNew = isWithinNewWindow(a.first_seen_at, nowMs) || a.last_event === 'discovered' ? 0 : 1;
      const bNew = isWithinNewWindow(b.first_seen_at, nowMs) || b.last_event === 'discovered' ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0);
    });
}

export function applyCanaryPromotion(row, canary, { nowIso = new Date().toISOString(), actor = 'auto-canary' } = {}) {
  const smoke_test = {
    passed: canary?.passed === true,
    ran_at: canary?.ranAt || nowIso,
    results: canary?.results || [],
    error: canary?.error || null,
    kind: 'discovery-canary',
    actor,
  };

  if (canary?.passed === true) {
    return {
      row: {
        ...row,
        approved: true,
        lifecycle: 'available',
        last_event: 'approved',
        last_changed_at: nowIso,
        health_status: 'healthy',
        smoke_test,
      },
      event: {
        model_id: row.id,
        event_type: 'approved',
        details: { source: actor, canary: true, results: smoke_test.results },
      },
      promoted: true,
    };
  }

  return {
    row: {
      ...row,
      approved: false,
      lifecycle: row.lifecycle === 'testing' ? 'testing' : 'discovered',
      last_event: 'updated',
      last_changed_at: nowIso,
      health_status: 'listed',
      smoke_test,
    },
    event: {
      model_id: row.id,
      event_type: 'updated',
      details: { source: actor, canary: true, passed: false, results: smoke_test.results },
    },
    promoted: false,
  };
}

function mapActiveRow(row) {
  const pricingKind = pricingKindFromEntry(row);
  const studioEligible = isStudioFreeEligible(pricingKind);
  return {
    id: row.id,
    name: row.name || row.id,
    provider: row.provider,
    description: row.description || '',
    pricingKind,
    status: 'available',
    event: row.last_event || 'approved',
    isNew: isWithinNewWindow(row.first_seen_at),
    approved: true,
    selectable: studioEligible,
    studioEligible,
    paidOnly: pricingKind === 'paid',
    firstSeenAt: row.first_seen_at || null,
    lastChangedAt: row.last_changed_at || null,
    category: 'active',
    list: 'active',
    source: row.source || 'registry',
  };
}

function mapNewRow(row) {
  const pricingKind = pricingKindFromEntry(row);
  const active = row.approved === true && row.lifecycle === 'available';
  const studioEligible = active && isStudioFreeEligible(pricingKind);
  return {
    id: row.id,
    name: row.name || row.id,
    provider: row.provider,
    description: row.description || '',
    pricingKind,
    status: active ? 'available' : (row.lifecycle || 'discovered'),
    event: row.last_event || 'discovered',
    isNew: true,
    approved: row.approved === true,
    selectable: studioEligible,
    studioEligible,
    paidOnly: pricingKind === 'paid',
    firstSeenAt: row.first_seen_at || null,
    lastChangedAt: row.last_changed_at || null,
    category: 'newly-added',
    list: 'newlyAdded',
    source: row.source || 'registry',
    smokeTest: row.smoke_test
      ? {
          passed: row.smoke_test.passed === true,
          ranAt: row.smoke_test.ran_at || row.smoke_test.ranAt || null,
          results: Array.isArray(row.smoke_test.results) ? row.smoke_test.results : [],
          error: row.smoke_test.error || null,
        }
      : null,
  };
}

function mapInternetEntry(entry) {
  const pricingKind = pricingKindFromEntry(entry);
  return {
    id: entry.id,
    name: entry.name || entry.id,
    provider: entry.provider || 'Unknown',
    description: entry.description || '',
    pricingKind,
    status: 'catalog',
    event: 'listed',
    isNew: false,
    approved: false,
    selectable: false,
    studioEligible: false,
    paidOnly: pricingKind === 'paid',
    firstSeenAt: entry.createdAt || null,
    lastChangedAt: null,
    category: 'internet',
    list: 'internetAvailable',
    source: entry.source || 'provider',
    contextWindow: entry.contextWindow || null,
  };
}

/**
 * Build the three admin lists. Featured/direct models are always Active.
 * Internet-available comes from live provider catalogues (not approval).
 */
export function buildAdminModelLists({
  registryRows = [],
  featuredModels = [],
  internetEntries = [],
  nowMs = Date.now(),
} = {}) {
  const featuredIds = new Set(featuredModels.map((m) => m.id));
  const active = [];

  for (const model of featuredModels) {
    const pricingKind = pricingKindFromEntry(model) || model.pricingKind || 'unknown';
    const studioEligible = isStudioFreeEligible(pricingKind);
    active.push({
      ...mapActiveRow({
        ...model,
        approved: true,
        lifecycle: 'available',
        is_free: studioEligible,
        last_event: 'listed',
        source: 'featured',
        pricingKind,
      }),
      name: model.name || model.id,
      description: model.description || '',
      pricingKind,
      // Featured routes already ship in Studio; keep them selectable when listed,
      // but label paid honestly so operators see cost clearly.
      studioEligible,
      selectable: model.available !== false,
      paidOnly: pricingKind === 'paid',
    });
  }

  for (const row of registryRows) {
    if (featuredIds.has(row.id)) continue;
    if (row.approved === true && row.lifecycle === 'available' && !row.removed_at) {
      active.push(mapActiveRow(row));
    }
  }

  const newlyAdded = registryRows
    .filter((row) => !row.removed_at && (
      isWithinNewWindow(row.first_seen_at, nowMs)
      || row.last_event === 'discovered'
      || row.last_event === 'restored'
    ))
    .map(mapNewRow)
    .sort((a, b) => new Date(b.firstSeenAt || 0) - new Date(a.firstSeenAt || 0));

  const internetAvailable = internetEntries
    .map(mapInternetEntry)
    .sort((a, b) => {
      const freeRank = (m) => (m.pricingKind === 'free' || m.pricingKind === 'free-tier' ? 0 : 1);
      const byFree = freeRank(a) - freeRank(b);
      if (byFree !== 0) return byFree;
      return String(a.name).localeCompare(String(b.name));
    })
    .slice(0, INTERNET_LIST_CAP);

  return {
    active,
    newlyAdded,
    internetAvailable,
    summary: {
      active: active.length,
      newlyAdded: newlyAdded.length,
      internetAvailable: internetAvailable.length,
      paidInternet: internetAvailable.filter((m) => m.pricingKind === 'paid').length,
      freeInternet: internetAvailable.filter((m) => m.pricingKind === 'free' || m.pricingKind === 'free-tier').length,
    },
  };
}
