function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
