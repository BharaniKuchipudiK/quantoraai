const MAX_ACTIVITY_EVENTS = 12;

function clean(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function timeOf(event) {
  const raw = event?.at || event?.createdAt || event?.created_at || null;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function activityForBoundary(event = {}) {
  const boundary = clean(event.boundary, 80);
  const state = clean(event.state, 40);
  const model = clean(event.modelId, 100);
  const detail = clean(event.detailCode, 100).replace(/[-_]+/g, ' ');

  if (boundary === 'api.chat' && state === 'started') return { phase: 'request', state: 'running', label: 'Request received' };
  if (boundary === 'inference.plan' && state === 'selected') return { phase: 'routing', state: 'done', label: model ? `Model selected · ${model}` : 'Model selected' };
  if (boundary === 'inference.provider' && state === 'attempting') return { phase: 'model', state: 'running', label: model ? `Generating with ${model}` : 'Generating response' };
  if (boundary === 'inference.provider' && state === 'succeeded') return { phase: 'model', state: 'done', label: model ? `${model} responded` : 'Model responded' };
  if (boundary === 'inference.provider' && state === 'failed') return { phase: 'model', state: 'failed', label: detail ? `Model attempt failed · ${detail}` : 'Model attempt failed' };
  if (boundary === 'browser.turn-recovery' && state === 'attempting') return { phase: 'recovery', state: 'running', label: detail ? `Recovering · ${detail}` : 'Recovering automatically' };
  if (boundary === 'browser.turn-recovery' && state === 'skipped') return { phase: 'recovery', state: 'stopped', label: detail ? `Recovery stopped · ${detail}` : 'Recovery stopped' };
  if (boundary === 'browser.response-parser' && state === 'parsed') return { phase: 'response', state: 'done', label: 'Response received' };
  if (boundary === 'artifact.vfs' && state === 'parsed') return { phase: 'files', state: 'done', label: event.fileCount != null ? `${event.fileCount} file(s) prepared` : 'Files prepared' };
  if (boundary === 'preview.compiler' && state === 'started') return { phase: 'verification', state: 'running', label: 'Compiling preview' };
  if (boundary === 'preview.compiler' && state === 'compiled') return { phase: 'verification', state: 'done', label: 'Preview compiled' };
  if (boundary === 'browser.iframe' && state === 'rendered') return { phase: 'verification', state: 'done', label: 'Preview rendered' };
  if (boundary === 'browser.python-verification' && state === 'started') return { phase: 'verification', state: 'running', label: 'Running Python verification' };
  if (boundary === 'browser.python-verification' && state === 'succeeded') return { phase: 'verification', state: 'done', label: 'Python verification passed' };
  if (boundary === 'api.chat' && state === 'succeeded') return { phase: 'complete', state: 'done', label: 'Turn completed' };
  if (boundary === 'api.chat' && state === 'failed') return { phase: 'complete', state: 'failed', label: detail ? `Turn ended · ${detail}` : 'Turn ended with an error' };
  return null;
}

/**
 * Project durable transaction-boundary evidence into user-facing progress.
 * No elapsed-time guesses, no hidden chain-of-thought, and no invented work.
 */
export function activityProgressFromTrace(events = []) {
  const ordered = (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event, index, time: timeOf(event) }))
    .sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) return a.time - b.time;
      return a.index - b.index;
    });

  const output = [];
  for (const entry of ordered) {
    const activity = activityForBoundary(entry.event);
    if (!activity) continue;
    const prior = output.at(-1);
    if (prior?.label === activity.label && prior?.state === activity.state) continue;
    output.push({
      ...activity,
      at: entry.time !== null ? new Date(entry.time).toISOString() : null,
      boundary: clean(entry.event.boundary, 80),
    });
  }
  return output.slice(-MAX_ACTIVITY_EVENTS);
}
