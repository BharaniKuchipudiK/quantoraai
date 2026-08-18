async function projectRequest(payload) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStage: 'project-state', ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Project sync is unavailable.');
    error.status = response.status;
    error.conflict = data.conflict === true;
    throw error;
  }
  return data;
}

export function loadRemoteProjects() {
  return projectRequest({ action: 'list' });
}

export function saveRemoteProject({ project, expectedVersion }) {
  return projectRequest({ action: 'save', project, expectedVersion });
}

export function deleteRemoteProject(projectId) {
  return projectRequest({ action: 'delete', projectId });
}

export function syncRemoteProjectResources(projectId, resources) {
  return projectRequest({ action: 'sync-resources', projectId, resources });
}

export function syncRemoteProjectSessions(projectId, sessionIds) {
  return projectRequest({ action: 'sync-sessions', projectId, sessionIds });
}

export function loadRemoteProjectContext(projectId) {
  return projectRequest({ action: 'context', projectId });
}
