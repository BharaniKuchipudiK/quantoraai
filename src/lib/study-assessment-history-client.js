export async function loadStudyAssessmentHistory() {
  const response = await fetch('/api/study-assessment-history', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(body?.error || 'Assessment history is temporarily unavailable.');
    error.status = response.status;
    error.requiresAuth = body?.requiresAuth === true;
    throw error;
  }

  return {
    windowDays: Number(body?.windowDays) || 30,
    generatedAt: typeof body?.generatedAt === 'string' ? body.generatedAt : null,
    assessments: Array.isArray(body?.assessments) ? body.assessments : [],
  };
}
