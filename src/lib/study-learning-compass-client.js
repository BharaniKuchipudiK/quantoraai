async function compassRequest(body) {
  const response = await fetch('/api/study-learning-compass', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Your Learning Compass is unavailable right now.');
    error.status = response.status;
    error.code = payload?.status || '';
    throw error;
  }
  return payload;
}

export async function loadStudyLearningCompass({
  conceptKey,
  conceptLabel,
  curriculumKey = null,
  availableMinutes = null,
}) {
  return compassRequest({
    conceptKey,
    conceptLabel,
    curriculumKey,
    availableMinutes,
  });
}
