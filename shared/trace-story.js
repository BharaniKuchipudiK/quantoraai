/*
 * A reference id resolves to what happened.
 *
 * THE INCIDENT (2026-09-05). A turn ended with "This turn ended without a reply —
 * that is a fault on Quantora's side … Reference: studio-719887e2-…". The
 * reference was a handle to nothing: boundary events were console.log lines in
 * a serverless function's stdout, gone with the instance, and the only way to
 * learn what the server had done was a screenshot and a guess.
 *
 * This module turns the persisted boundary events of one correlation id into a
 * plain-English account. It is pure — the same words on the server (the lookup
 * response) and on the desk (the "What happened?" panel) — and it names only
 * what the events prove. Where the record stops, it says the record stops; it
 * never invents a cause to fill the silence, because an invented cause is the
 * thing the reader will act on (CLAUDE.md: "A tool description is a promise").
 */

const SERVER_BOUNDARY = /^(api\.|inference\.|preview\.)/;

const DETAIL_WORDS = Object.freeze({
  'quota-exhausted': 'the engine quota was exhausted',
  'chat-failure': 'the turn failed on the server',
  'provider-failure': 'the engine returned an error',
  'attempt-timeout': 'the engine did not answer in time',
  'route-not-found': 'the engine route does not exist on that gateway',
  'code-fences-missing': 'the reply carried no files where files were owed',
  'browser-preview-missing': 'the reply had no page the preview could run',
  'opaque-storage-access': 'the reply used browser storage the preview forbids',
  'golden-vfs-shape-missing': 'the reply was not the project shape the canary demands',
  'project-runtime-contract-missing': 'the files on the desk were not a runnable project',
  'silent-turn': 'the desk received no reply',
  'assistant-response-empty': 'the stream carried no reply',
  'stream-truncated': 'the reply stream was cut off',
  'compile-failed': 'the preview could not compile the files',
  'iframe-failed': 'the preview page failed while running',
});

function detailWords(code) {
  if (!code) return '';
  return DETAIL_WORDS[code] || String(code).replace(/[-_]+/g, ' ');
}

function engineWords(event) {
  const model = event.modelId ? String(event.modelId) : '';
  const gateway = event.gateway ? String(event.gateway) : '';
  if (model && gateway) return `${model} via ${gateway}`;
  return model || gateway || 'an engine';
}

function ms(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}s` : `${Math.round(n)}ms`;
}

function timeOf(event) {
  const raw = event?.at || event?.createdAt || event?.created_at || null;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** One boundary event, as a sentence a person can read. */
export function describeTraceEvent(event = {}) {
  const boundary = String(event.boundary || '');
  const state = String(event.state || '');
  const status = Number.isFinite(Number(event.statusCode)) && event.statusCode !== null ? Number(event.statusCode) : null;
  const detail = detailWords(event.detailCode);
  const took = ms(event.durationMs);

  if (boundary === 'api.chat') {
    if (state === 'started') return 'Quantora received the request.';
    if (state === 'succeeded') return `The server finished the turn${took ? ` in ${took}` : ''}${event.modelId ? ` with ${engineWords(event)}` : ''}.`;
    if (state === 'failed') return `The server ended the turn with an error${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}.`;
  }
  if (boundary === 'inference.plan' && state === 'selected') return `Chose ${engineWords(event)} to run it.`;
  if (boundary === 'inference.provider') {
    if (state === 'attempting') return `Called ${engineWords(event)}.`;
    if (state === 'skipped') return `Skipped ${engineWords(event)}${detail ? ` — ${detail}` : ''}.`;
    if (state === 'succeeded') return `${engineWords(event)} replied${took ? ` in ${took}` : ''}.`;
    if (state === 'failed') return `${engineWords(event)} failed${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}.`;
  }
  if (boundary === 'preview.compiler') {
    if (state === 'started') return `The preview compiler received ${event.fileCount ?? 'the'} file(s).`;
    if (state === 'compiled') return `The preview compiled${took ? ` in ${took}` : ''}.`;
    if (state === 'failed') return `The preview failed to compile${detail ? `: ${detail}` : ''}.`;
  }
  if (boundary === 'browser.response-parser' && state === 'parsed') {
    // The desk records what it parsed even when that was nothing; "read the
    // reply" would be a lie for an empty stream.
    return event.detailCode === 'assistant-response-empty'
      ? 'The desk read the stream to its end and found no reply in it.'
      : 'The desk received the reply and read it.';
  }
  if (boundary === 'artifact.vfs' && state === 'parsed') return `${event.fileCount ?? 'The'} file(s) landed on the desk.`;
  if (boundary === 'browser.preview-response') {
    if (state === 'compiled') return 'The desk received the compiled preview.';
    if (state === 'failed') return `The preview did not run${detail ? `: ${detail}` : ''}.`;
  }
  if (boundary === 'browser.iframe') {
    if (state === 'rendered') return 'The preview rendered in the browser.';
    if (state === 'failed') return `The preview page failed in the browser${detail ? `: ${detail}` : ''}.`;
  }
  if (boundary === 'browser.chat-stream' && state === 'failed') return `The desk ended the turn without a reply${detail ? ` (${detail})` : ''}.`;
  return `${boundary} ${state}${detail ? `: ${detail}` : ''}.`;
}

/**
 * The account of one reference.
 *
 * @param {Array<object>} events - persisted boundary events, any order
 * @returns {{ outcome: string, headline: string, detail: string, steps: Array<{ at: string|null, offsetMs: number|null, text: string }> }}
 */
export function describeTrace(events = []) {
  const list = (Array.isArray(events) ? events : [])
    .filter((event) => event && event.boundary && event.state)
    .map((event, index) => ({ event, index, t: timeOf(event) }))
    .sort((a, b) => {
      if (a.t !== null && b.t !== null && a.t !== b.t) return a.t - b.t;
      return a.index - b.index;
    })
    .map((entry) => entry.event);

  if (!list.length) {
    return {
      outcome: 'no-record',
      headline: 'Quantora has no record of this reference.',
      detail: 'Nothing ran on our side under this reference: the request never reached Quantora\'s API, '
        + 'or this deployment keeps no trace store. If the desk showed a failure, the fault is between this browser and the server.',
      steps: [],
    };
  }

  const t0 = timeOf(list[0]);
  const steps = list.map((event) => {
    const t = timeOf(event);
    return {
      at: t !== null ? new Date(t).toISOString() : null,
      offsetMs: t !== null && t0 !== null ? Math.max(0, t - t0) : null,
      text: describeTraceEvent(event),
    };
  });

  const server = list.filter((event) => SERVER_BOUNDARY.test(String(event.boundary)));
  const deskSilent = list.some((event) => event.boundary === 'browser.chat-stream' && event.state === 'failed');
  const providerFailures = server.filter((event) => event.boundary === 'inference.provider' && event.state === 'failed');
  const last = server[server.length - 1] || null;
  const lastWords = last ? describeTraceEvent(last) : '';

  if (!last) {
    return {
      outcome: 'browser-only',
      headline: 'The server has no record of this turn; only this browser does.',
      detail: 'The desk recorded what it saw, but no request under this reference reached Quantora\'s API. '
        + 'The request was never sent, or it was lost between this browser and the server.',
      steps,
    };
  }

  const apiState = last.boundary.startsWith('api.') || last.boundary === 'preview.compiler' ? last.state : null;

  if (apiState === 'succeeded' || apiState === 'compiled') {
    return deskSilent
      ? {
        outcome: 'server-finished-desk-silent',
        headline: 'Quantora finished this turn and sent a reply, but the desk never showed it.',
        detail: `The server's last word was: ${lastWords} The fault is between the server and this browser — the stream was cut, or the desk dropped it. Nothing on the server failed.`,
        steps,
      }
      : {
        outcome: 'server-finished',
        headline: 'Quantora finished this turn.',
        detail: `The server's last word was: ${lastWords}`,
        steps,
      };
  }

  if (apiState === 'failed') {
    const tried = providerFailures.length
      ? ` Engines tried and failed: ${providerFailures.map((event) => `${engineWords(event)}${event.statusCode ? ` (HTTP ${event.statusCode})` : ''}`).join('; ')}.`
      : '';
    return {
      outcome: 'server-failed',
      headline: 'Quantora\'s server ended this turn with an error, and recorded why.',
      detail: `${lastWords}${tried}`,
      steps,
    };
  }

  /*
   * The record stops before the server's final word. That is the incident's
   * shape: started, engine chosen, engine called — then nothing. A function
   * that timed out or crashed writes no "failed" event, so the absence IS the
   * finding, and it is a fault on our side by definition.
   */
  const cutOffWhile = last.boundary === 'inference.provider' && (last.state === 'attempting')
    ? ` while waiting on ${engineWords(last)}`
    : last.boundary === 'inference.provider' && last.state === 'failed'
      ? ` after ${engineWords(last)} failed, before trying the next engine or reporting the failure`
      : last.boundary === 'inference.plan'
        ? ' right after choosing an engine'
        : ' before choosing an engine';
  return {
    outcome: 'server-cut-off',
    headline: 'Quantora\'s server was cut off before it finished this turn — a fault on our side.',
    detail: `The last thing recorded was: ${lastWords} Nothing after it. The server function stopped${cutOffWhile}: a timeout or a crash on Quantora's side, not a refusal and not anything you did. Your message is unchanged.`,
    steps,
  };
}
