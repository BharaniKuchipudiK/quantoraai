function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const GRADED_EVIDENCE_KINDS = new Set([
  'assessment_item',
  'retrieval',
  'application',
  'transfer',
  'retention_probe',
  'misconception_probe',
]);

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

export async function requestStudyAssessment({ conceptId, conceptLabel, sessionId, excludeItemRefs } = {}) {
  const exclusions = Array.isArray(excludeItemRefs)
    ? [...new Set(excludeItemRefs.map((value) => clean(value, 220)).filter(Boolean))].slice(0, 20)
    : [];
  const body = {
    action: 'issue',
    conceptKey: clean(conceptId, 160),
    conceptLabel: clean(conceptLabel, 300),
    sessionId: clean(sessionId, 128),
    ...(exclusions.length ? { excludeItemRefs: exclusions } : {}),
  };
  const data = await studyAssessmentRequest(body);
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
  if (typeof data?.correct !== 'boolean' || !GRADED_EVIDENCE_KINDS.has(data?.evidenceKind)) {
    throw new Error('The verified Study check returned an invalid grade.');
  }
  return data;
}
