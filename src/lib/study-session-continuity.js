// UI continuation only. Never persist an assessment receipt, answer or mastery.
export const STUDY_CONTINUITY_VERSION = 'study-session-continuity-v2';
export const STUDY_CONTINUITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STUDY_CONTINUITY_HINT_TTL_MS = 20 * 60 * 1000;
const PREFIX = 'quantora:study-continuity:v2:';
const MAX_SESSIONS = 12;
const PHASES = new Set(['explain', 'guided_practice', 'verified_check', 'review']);
const ACTIONS = new Set(['guided_repair', 'independent_retrieval', 'diagnose_misconception', 'confirm_misconception', 'vary_evidence', 'retention_probe', 'transfer_task']);
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
const labelKey = (value) => text(value, 160).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'+-]+/g, ' ').replace(/\s+/g, ' ').trim();

function scopeKey({ accountKey, sessionId } = {}) {
  const account = text(accountKey, 254).toLowerCase();
  const session = text(sessionId, 128);
  return account && session ? `${PREFIX}${encodeURIComponent(account)}:${encodeURIComponent(session)}` : '';
}

export function makeStudyContinuityCheckpoint({ mission, sessionId, workingState = null, now = Date.now() } = {}) {
  const label = text(mission?.label, 160);
  if (!Number.isFinite(now) || now < 0 || !text(sessionId, 128) || !labelKey(label)
    || mission?.status !== 'active' || mission.topicAligned !== true || !PHASES.has(mission.phase)
    || !['compass', 'guided_chip'].includes(mission.source)) return null;
  const supportMatches = workingState?.temporary === true
    && labelKey(workingState.conceptLabel) === labelKey(label);
  const hintDependence = supportMatches && ['emerging', 'high'].includes(workingState.hintDependence)
    ? workingState.hintDependence : null;
  return {
    version: STUDY_CONTINUITY_VERSION,
    observationOnly: true,
    sessionId: text(sessionId, 128),
    savedAt: now,
    label,
    // Review cannot be recovered from a browser's claim that a check passed.
    // A fresh server check is required before entering review again.
    phase: mission.phase === 'review' ? 'verified_check' : mission.phase,
    source: mission.source,
    conceptId: text(mission.conceptId, 160),
    conceptKey: text(mission.conceptKey, 160),
    actionType: ACTIONS.has(mission.actionType) ? mission.actionType : 'guided_repair',
    durationMinutes: Number.isFinite(mission.durationMinutes)
      ? Math.max(3, Math.min(480, mission.durationMinutes)) : null,
    priorSupport: hintDependence ? { hintDependence, observedAt: now } : null,
  };
}

export function validateStudyContinuityCheckpoint(value, { sessionId, topic, now = Date.now() } = {}) {
  if (!value || value.version !== STUDY_CONTINUITY_VERSION || value.observationOnly !== true
    || !text(sessionId, 128) || value.sessionId !== sessionId || !Number.isFinite(now)
    || !Number.isFinite(value.savedAt) || value.savedAt < 0 || value.savedAt > now
    || now - value.savedAt > STUDY_CONTINUITY_TTL_MS
    || !labelKey(topic) || labelKey(topic) !== labelKey(value.label)
    || !['explain', 'guided_practice', 'verified_check'].includes(value.phase)) return null;
  // Re-project an allowlist: extra fields in tampered storage are never restored.
  const clean = makeStudyContinuityCheckpoint({
    sessionId, now: value.savedAt,
    mission: { ...value, status: 'active', topicAligned: true },
  });
  if (!clean) return null;
  const support = value.priorSupport;
  if (support && ['emerging', 'high'].includes(support.hintDependence)
    && Number.isFinite(support.observedAt) && support.observedAt >= 0
    && support.observedAt <= value.savedAt && now - support.observedAt <= STUDY_CONTINUITY_HINT_TTL_MS) {
    clean.priorSupport = { hintDependence: support.hintDependence, observedAt: support.observedAt };
  }
  return clean;
}

export function studyContinuityResumeEvents(checkpoint, scope) {
  const saved = validateStudyContinuityCheckpoint(checkpoint, scope);
  if (!saved) return [];
  // Replay progress through the existing mission reducer, never VERIFIED_RESULT.
  // All restored missions start without an attempt identity or a grade receipt.
  // Canonical concept IDs in browser storage are untrusted too: re-resolve the
  // visible current topic through the existing server checker on the next click.
  const events = [{
    type: 'START_COMPASS', activeTopic: saved.label,
    recommendation: {
      label: saved.label, conceptId: '', conceptKey: '',
      recommendedActionType: saved.phase === 'verified_check' ? 'independent_retrieval' : 'guided_repair',
      suggestedDurationMinutes: saved.durationMinutes || 10,
    },
  }];
  if (saved.phase === 'guided_practice') events.push({ type: 'PRACTICE' });
  return events;
}

export function readStudyContinuity(storage, scope) {
  const key = scopeKey(scope);
  if (!key) return null;
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    if (raw.length > 2400) { storage.removeItem(key); return null; }
    const decoded = JSON.parse(raw);
    const result = validateStudyContinuityCheckpoint(decoded, scope);
    // A different topic in the same chat is not permission to erase its record.
    if (!result && (!Number.isFinite(decoded?.savedAt)
      || (scope.now ?? Date.now()) - decoded.savedAt > STUDY_CONTINUITY_TTL_MS)) storage.removeItem(key);
    return result;
  } catch { return null; }
}

export function clearStudyContinuity(storage, scope) {
  const key = scopeKey(scope);
  if (!key) return false;
  try { storage?.removeItem(key); return Boolean(storage); } catch { return false; }
}

export function saveStudyContinuity(storage, scope, checkpoint) {
  const key = scopeKey(scope);
  const clean = validateStudyContinuityCheckpoint(checkpoint, scope);
  if (!key || !clean || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(clean));
    const accountPrefix = key.slice(0, key.lastIndexOf(':') + 1);
    const records = [];
    for (let index = 0; index < storage.length; index += 1) {
      const itemKey = storage.key(index);
      if (!itemKey?.startsWith(accountPrefix)) continue;
      try { records.push({ key: itemKey, savedAt: JSON.parse(storage.getItem(itemKey))?.savedAt || 0 }); }
      catch { records.push({ key: itemKey, savedAt: 0 }); }
    }
    records.sort((a, b) => b.savedAt - a.savedAt || (a.key === key ? -1 : b.key === key ? 1 : a.key.localeCompare(b.key)));
    for (const entry of records.slice(MAX_SESSIONS)) storage.removeItem(entry.key);
    return true;
  } catch { return false; }
}
