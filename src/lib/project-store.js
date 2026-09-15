const DEFAULT_PROJECT_ID = 'project-personal';
const PROJECTS_STORAGE_KEY = 'quantora_projects_v1';
const PROJECTS_STORAGE_PREFIX = `${PROJECTS_STORAGE_KEY}:account:`;
const CANNED_PROJECT_DESCRIPTION = 'Sessions you start outside a named Project show up here.';
const DEFAULT_PROJECT_COLOR = '#f97316';

function createDefaultProject(now = Date.now()) {
  return {
    id: DEFAULT_PROJECT_ID,
    version: 0,
    name: 'Personal Workspace',
    description: CANNED_PROJECT_DESCRIPTION,
    goal: '',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    color: DEFAULT_PROJECT_COLOR,
  };
}

/**
 * Keep the default Personal Workspace as a real project whenever a stored
 * project list exists. Historical builds could persist custom Projects without
 * project-personal; the sidebar still renders default-chat history, so opening
 * one of those chats then left activeProject on the custom Project while
 * activeSessionId pointed at the default chat. Writes landed in one session
 * and the transcript rendered another, making the submitted prompt disappear.
 */
export function ensureDefaultProject(projects, now = Date.now()) {
  if (!Array.isArray(projects)) return projects;
  if (projects.some((project) => project?.id === DEFAULT_PROJECT_ID)) return projects;
  return [...projects, createDefaultProject(now)];
}

/**
 * One-time, idempotent browser repair for project lists written by older
 * builds. It runs before useStudioSession initialises because this module is an
 * import of that hook, restoring the project/session membership invariant on
 * the very first render after deploy.
 */
export function repairDefaultProjectStorage(storage, now = Date.now()) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return 0;

  const keys = [];
  try {
    const length = Number(storage.length) || 0;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (key === PROJECTS_STORAGE_KEY || String(key || '').startsWith(PROJECTS_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    if (!keys.includes(PROJECTS_STORAGE_KEY) && storage.getItem(PROJECTS_STORAGE_KEY) != null) {
      keys.push(PROJECTS_STORAGE_KEY);
    }
  } catch {
    return 0;
  }

  let repaired = 0;
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      if (raw == null) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some((project) => project?.id === DEFAULT_PROJECT_ID)) continue;
      storage.setItem(key, JSON.stringify(ensureDefaultProject(parsed, now)));
      repaired += 1;
    } catch {
      // Leave corrupt/blocked storage untouched; useStudioSession already has
      // its normal fallback for those cases.
    }
  }
  return repaired;
}

try {
  if (typeof localStorage !== 'undefined') repairDefaultProjectStorage(localStorage);
} catch {
  // Storage can be unavailable in privacy/SSR contexts. Normal hook fallbacks
  // continue to provide a default workspace there.
}

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
