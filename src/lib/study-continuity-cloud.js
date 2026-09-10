import { validateStudyContinuityCheckpoint } from './study-session-continuity.js';
export const STUDY_CONTINUITY_CLOUD_VERSION = 'study-continuity-cloud-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validStudyContinuityRevision(value) { return value === null || (typeof value === 'string' && UUID.test(value)); }

/** One serialized writer per mounted authenticated scope; conflict is terminal. */
export function createStudyContinuityCloud(scope, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  const controller = new AbortController();
  let revision = null;
  let ready = false;
  let stopped = false;
  let pending; // undefined = no work; null = explicit discard tombstone.
  let running = null;
  let lastStatus = 'loading';
  const status = (value) => { lastStatus = value; options.onStatus?.(value); };
  async function request(action, extra = {}) {
    const response = await fetcher('/api/study-learning-compass', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      body: JSON.stringify({ action, sessionId: scope.sessionId, topic: scope.topic,
        accountKey: scope.accountKey, ...extra }),
    });
    if (!response.ok) {
      const error = new Error(response.status === 409 ? 'conflict' : 'unavailable');
      error.code = response.status === 409 ? 'conflict' : 'unavailable';
      throw error;
    }
    const data = await response.json();
    if (data?.version !== STUDY_CONTINUITY_CLOUD_VERSION || !validStudyContinuityRevision(data.revision)
      || typeof data.cleared !== 'boolean' || (data.cleared && data.checkpoint !== null)
      || (data.revision === null && (data.cleared === true || data.checkpoint !== null))) throw new Error('Invalid cloud checkpoint response');
    return data;
  }
  async function pump() {
    if (!ready || stopped || running || pending === undefined) return running;
    running = (async () => {
      while (pending !== undefined && !stopped) {
        const next = pending;
        pending = undefined;
        status('saving');
        try {
          const data = await request(next === null ? 'continuity-clear' : 'continuity-save', { revision, checkpoint: next });
          if (stopped) return;
          if (!data.revision) throw new Error('Missing write revision');
          revision = data.revision;
          status('saved');
        } catch (error) {
          if (!stopped) { stopped = true; status(error?.code === 'conflict' ? 'conflict' : 'unavailable'); }
        }
      }
    })().finally(() => { running = null; });
    return running;
  }
  return {
    async read() {
      try {
        const data = await request('continuity-read');
        if (stopped) return null;
        revision = data.revision;
        ready = true;
        const checkpoint = data.checkpoint === null ? null : validateStudyContinuityCheckpoint(data.checkpoint, scope);
        if (data.checkpoint !== null && !checkpoint) throw new Error('Invalid cloud checkpoint');
        // A click queued before hydration did not observe this server revision.
        // Never use a newly discovered revision to overwrite an existing record.
        if (pending !== undefined && revision !== null) {
          stopped = true; pending = undefined; status('conflict');
        } else { status('ready'); void pump(); }
        return { checkpoint, cleared: data.cleared === true };
      } catch {
        if (!stopped) { stopped = true; status('unavailable'); }
        return null; // Existing local recovery remains available; no automatic retry.
      }
    },
    save(checkpoint) {
      if (stopped) return;
      const clean = validateStudyContinuityCheckpoint(checkpoint, scope);
      if (!clean) return;
      pending = { ...clean, conceptId: '', conceptKey: '' };
      void pump();
    },
    clear() { if (!stopped) { pending = null; void pump(); } },
    async flush() { await pump(); if (running) await running; },
    getStatus() { return lastStatus; },
    dispose() { stopped = true; pending = undefined; controller.abort(); },
  };
}

const importOwners = new Set();
export function subscribeStudyContinuityImports(listener) {
  importOwners.add(listener);
  return () => importOwners.delete(listener);
}
export async function requestStudyContinuityImport(checkpoint) {
  if (importOwners.size !== 1) return false;
  return await [...importOwners][0](checkpoint) === true;
}
export function remapStudyContinuityCheckpoint(checkpoint, scope) {
  const clean = validateStudyContinuityCheckpoint(checkpoint, { ...scope, sessionId: checkpoint?.sessionId });
  return clean ? validateStudyContinuityCheckpoint({ ...clean, sessionId: scope.sessionId,
    conceptId: '', conceptKey: '' }, scope) : null;
}
