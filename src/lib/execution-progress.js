const MAX_PROGRESS_EVENTS = 16;

function cleanLabel(status) {
  const raw = typeof status === 'string' ? status : status?.label || status?.message || '';
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** Accumulate only observed milestones; identical heartbeat updates collapse. */
export function appendExecutionProgress(history = [], status = null, { at = Date.now() } = {}) {
  const prior = Array.isArray(history) ? history.filter((event) => event?.label) : [];
  const label = cleanLabel(status);
  if (!label) return prior;
  const phase = String(status?.phase || '').slice(0, 40);
  const state = String(status?.state || '').slice(0, 40);
  const previous = prior.at(-1);
  if (previous?.label === label && previous?.phase === phase && previous?.state === state) return prior;
  return [...prior, { label, phase, state, at: Number(at) || Date.now() }].slice(-MAX_PROGRESS_EVENTS);
}

