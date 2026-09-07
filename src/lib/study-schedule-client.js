async function scheduleRequest(method, body, query = '') {
  const response = await fetch(`/api/study-schedule${query}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error || 'Your Study schedule is unavailable right now.');
    error.status = response.status;
    throw error;
  }
  return payload || {};
}

export async function loadStudySchedule({ from, to }) {
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const payload = await scheduleRequest('GET', undefined, query);
  return Array.isArray(payload.blocks) ? payload.blocks : [];
}

export async function createStudyScheduleBlock(block) {
  const payload = await scheduleRequest('POST', block);
  if (!payload.block) throw new Error('Your study block could not be created right now.');
  return payload.block;
}

export async function updateStudyScheduleBlock(block) {
  const payload = await scheduleRequest('PATCH', block);
  if (!payload.block) throw new Error('Your study block could not be saved right now.');
  return payload.block;
}

export async function deleteStudyScheduleBlock(id) {
  const payload = await scheduleRequest('DELETE', { id });
  if (payload.deleted !== true) throw new Error('Your study block could not be deleted right now.');
  return true;
}
