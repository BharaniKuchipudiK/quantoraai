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

async function studyAssessmentRequest(body) {
  const response = await fetch('/api/study-assessment', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The verified Study check is unavailable.');
    error.status = response.status;
    error.code = data.code || '';
    error.requiresAuth = data.requiresAuth === true;
    error.fallbackAllowed = data.fallbackAllowed === true;
    throw error;
  }
  return data;
}

export async function requestStudyAssessment({ conceptId, conceptLabel, sessionId } = {}) {
  const data = await studyAssessmentRequest({
    action: 'issue',
    conceptKey: clean(conceptId, 160),
    conceptLabel: clean(conceptLabel, 300),
    sessionId: clean(sessionId, 128),
  });
  if (!data?.attemptId || !data?.item?.prompt || !Array.isArray(data.item.options)) {
    throw new Error('The verified Study check returned an invalid item.');
  }
  return data;
}

export async function gradeStudyAssessment({ attemptId, optionId } = {}) {
  const data = await studyAssessmentRequest({
    action: 'grade',
    attemptId: clean(attemptId, 64),
    optionId: clean(optionId, 40),
  });
  if (typeof data?.correct !== 'boolean' || data?.evidenceKind !== 'assessment_item') {
    throw new Error('The verified Study check returned an invalid grade.');
  }
  return data;
}
