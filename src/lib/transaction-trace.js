const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/;

export const LIVE_ACTIVITY_TRACE_EVENT = 'quantora:live-activity-trace';
export const LIVE_ACTIVITY_TRACE_STORAGE_KEY = 'quantora_live_activity_trace';
const LIVE_ACTIVITY_TRACE_MAX_AGE_MS = 10 * 60 * 1000;

export function createCorrelationId(prefix = 'turn') {
  const safePrefix = String(prefix || 'turn').replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 24) || 'turn';
  const id = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${safePrefix}-${id}`.slice(0, 96);
}

export function normalizeClientCorrelationId(value) {
  const candidate = String(value || '').trim();
  return CORRELATION_ID_PATTERN.test(candidate) ? candidate : null;
}

function isStudioTurnCorrelationId(value) {
  return typeof value === 'string' && value.startsWith('studio-');
}

function browserSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

/**
 * Remember which durable trace belongs to the turn the desk is actively sending.
 *
 * The browser already sends the same correlation id to /api/chat. This merely
 * exposes that opaque id to other desk chrome so it can read the persisted trace;
 * it does not invent progress or make the browser a second execution authority.
 */
export function publishLiveActivityTrace(correlationId, {
  storage = undefined,
  eventTarget = globalThis,
  now = Date.now(),
} = {}) {
  const normalized = normalizeClientCorrelationId(correlationId);
  if (!isStudioTurnCorrelationId(normalized)) return false;

  const payload = {
    correlationId: normalized,
    at: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
  };
  try {
    const targetStorage = storage === undefined ? browserSessionStorage() : storage;
    targetStorage?.setItem?.(LIVE_ACTIVITY_TRACE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Progress chrome is best-effort; storage failure must never block a turn.
  }
  try {
    if (typeof eventTarget?.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      eventTarget.dispatchEvent(new globalThis.CustomEvent(LIVE_ACTIVITY_TRACE_EVENT, { detail: payload }));
    }
  } catch {
    // A listener failure must not affect the request path.
  }
  return true;
}

export function readLiveActivityTrace({
  storage = undefined,
  now = Date.now(),
  maxAgeMs = LIVE_ACTIVITY_TRACE_MAX_AGE_MS,
} = {}) {
  try {
    const targetStorage = storage === undefined ? browserSessionStorage() : storage;
    const parsed = JSON.parse(targetStorage?.getItem?.(LIVE_ACTIVITY_TRACE_STORAGE_KEY) || 'null');
    const correlationId = normalizeClientCorrelationId(parsed?.correlationId);
    const at = Number(parsed?.at);
    const age = Number(now) - at;
    if (!isStudioTurnCorrelationId(correlationId) || !Number.isFinite(at) || !Number.isFinite(age)) return null;
    if (age < 0 || age > maxAgeMs) return null;
    return correlationId;
  } catch {
    return null;
  }
}

/**
 * The desk drops iframe messages whose correlation id does not match the
 * compile it asked for. Production can mint a new id when the request
 * arrives without one — believe the id the compiler baked into the page.
 * A mock that compiles without that id produces a null event id and must
 * not be treated as proof of the running page.
 */
export function previewMessageMatchesCompile({ requestId = null, compiledId = null, eventId = null } = {}) {
  const expected = normalizeClientCorrelationId(compiledId) || normalizeClientCorrelationId(requestId);
  const incoming = normalizeClientCorrelationId(eventId);
  if (!expected) return true;
  if (!incoming) return false;
  return incoming === expected;
}

export function correlationHeaders(correlationId, extra = {}) {
  const normalized = normalizeClientCorrelationId(correlationId);
  if (isStudioTurnCorrelationId(normalized)) publishLiveActivityTrace(normalized);
  return {
    ...extra,
    ...(normalized ? { 'X-Quantora-Correlation-Id': normalized } : {}),
  };
}

export function recordClientBoundary(correlationId, boundary, state, metadata = {}) {
  const normalized = normalizeClientCorrelationId(correlationId);
  if (!normalized) return Promise.resolve(false);
  return fetch('/api/trace', {
    method: 'POST',
    headers: correlationHeaders(normalized, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ correlationId: normalized, boundary, state, ...metadata }),
    keepalive: true,
  }).then((response) => response.ok).catch(() => false);
}
