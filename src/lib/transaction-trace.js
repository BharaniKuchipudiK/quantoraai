const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/;

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
