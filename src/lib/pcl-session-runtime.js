const CHAT_SESSIONS_KEY = 'quantora_chat_sessions';
const ACTIVE_SESSION_KEY = 'quantora_active_pcl_session';
const SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function storageOrNull(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readSessions(storage) {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(CHAT_SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions, storage) {
  const target = storageOrNull(storage);
  if (!target) return false;
  try {
    target.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

export function normalizePclSessionId(value) {
  return typeof value === 'string' && SESSION_ID.test(value.trim()) ? value.trim() : null;
}

export function normalizePclProjectId(value) {
  return typeof value === 'string' && PROJECT_ID.test(value.trim()) ? value.trim() : null;
}

export function rememberActivePclSession(sessionId, storage) {
  const id = normalizePclSessionId(sessionId);
  const target = storageOrNull(storage);
  if (!id || !target) return null;
  try {
    target.setItem(ACTIVE_SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export function readActivePclSessionId(storage) {
  const target = storageOrNull(storage);
  if (!target) return null;
  try {
    return normalizePclSessionId(target.getItem(ACTIVE_SESSION_KEY));
  } catch {
    return null;
  }
}

export function setPclSessionMemoryConsent(sessionId, consented, storage) {
  const id = normalizePclSessionId(sessionId);
  if (!id) return false;
  const sessions = readSessions(storage);
  let changed = false;
  const updated = sessions.map((session) => {
    if (session?.id !== id) return session;
    changed = true;
    return { ...session, memoryConsented: consented === true };
  });
  return changed ? writeSessions(updated, storage) : false;
}

export function updatePclSessionOutcomeVersion(sessionId, version, storage) {
  const id = normalizePclSessionId(sessionId);
  if (!id || !Number.isInteger(version) || version < 0) return false;
  const sessions = readSessions(storage);
  let changed = false;
  const updated = sessions.map((session) => {
    if (session?.id !== id) return session;
    changed = true;
    return { ...session, outcomeVersion: version };
  });
  return changed ? writeSessions(updated, storage) : false;
}

export function readPclConversationEnvelope({ sessionId, sessionContext, storage } = {}) {
  const id = normalizePclSessionId(sessionId) || readActivePclSessionId(storage);
  const session = id ? readSessions(storage).find((item) => item?.id === id) : null;
  const projectId = normalizePclProjectId(sessionContext?.projectId || session?.projectId);
  return {
    ...(id ? { sessionId: id } : {}),
    ...(projectId ? { projectId } : {}),
    memoryConsented: session?.memoryConsented === true,
  };
}

export function detectPclMemoryConsentIntent(text) {
  const value = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (!value) return null;
  if (/\b(?:forget|delete|clear)\s+(?:this|the)\s+(?:chat|conversation|memory)\b|\bstop\s+(?:remembering|saving)\s+(?:this|the)\s+(?:chat|conversation)\b/.test(value)) {
    return 'revoke';
  }
  if (/\bremember\s+(?:this|that|it)\b|\bsave\s+(?:this|that|it)\s+(?:to|in)\s+memory\b|\bkeep\s+(?:this|that)\s+in\s+memory\b/.test(value)) {
    return 'grant';
  }
  return null;
}

export const PCL_SESSION_RUNTIME_KEYS = Object.freeze({
  chatSessions: CHAT_SESSIONS_KEY,
  activeSession: ACTIVE_SESSION_KEY,
});
