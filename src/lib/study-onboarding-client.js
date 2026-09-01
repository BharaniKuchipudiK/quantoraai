async function onboardingRequest(method, body) {
  const response = await fetch('/api/study-onboarding', {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Study personalization is unavailable right now.');
    error.status = response.status;
    throw error;
  }
  return payload || {};
}

export async function loadStudyOnboarding() {
  const payload = await onboardingRequest('GET');
  return {
    profile: payload.profile || null,
    needsOnboarding: payload.needsOnboarding === true,
  };
}

export async function saveStudyOnboarding(profile) {
  const payload = await onboardingRequest('POST', profile);
  if (!payload.profile) throw new Error('Your Study preferences could not be saved right now.');
  return payload.profile;
}
