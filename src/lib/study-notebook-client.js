async function notebookRequest(method, body) {
  const response = await fetch('/api/study-notebook', {
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
    const error = new Error(payload?.error || 'Your Study notebook is unavailable right now.');
    error.status = response.status;
    throw error;
  }
  return payload || {};
}

export async function loadStudyNotebook() {
  const payload = await notebookRequest('GET');
  return Array.isArray(payload.notes) ? payload.notes : [];
}

export async function createStudyNotebookNote(note) {
  const payload = await notebookRequest('POST', note);
  if (!payload.note) throw new Error('Your note could not be created right now.');
  return payload.note;
}

export async function updateStudyNotebookNote(note) {
  const payload = await notebookRequest('PATCH', note);
  if (!payload.note) throw new Error('Your note could not be saved right now.');
  return payload.note;
}

export async function deleteStudyNotebookNote(id) {
  const payload = await notebookRequest('DELETE', { id });
  if (payload.deleted !== true) throw new Error('Your note could not be deleted right now.');
  return true;
}
