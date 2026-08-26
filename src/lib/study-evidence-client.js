function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function idPart(value, fallback) {
  const part = clean(value, 80).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  return part || fallback;
}

export function createStudyEvidenceEventKey({ sessionId, conceptId } = {}) {
  const nonce = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `study.${idPart(sessionId, 'session')}.${idPart(conceptId, 'concept')}.${nonce}`.slice(0, 200);
}

/**
 * Record a learner's self-confidence signal through the authenticated server
 * boundary. This signal is deliberately not called mastery or a passed check.
 */
export async function recordStudySelfConfidenceEvidence({
  eventKey,
  conceptId,
  conceptLabel,
  sessionId,
  selfConfidence,
} = {}) {
  const response = await fetch('/api/study-evidence', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventKey: clean(eventKey, 200),
      conceptKey: clean(conceptId, 160),
      conceptLabel: clean(conceptLabel, 300),
      sessionId: clean(sessionId, 128),
      kind: 'self_confidence',
      selfConfidence,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Study evidence could not be recorded.');
    error.status = response.status;
    error.requiresAuth = data.requiresAuth === true;
    throw error;
  }
  return data;
}
