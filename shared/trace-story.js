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
  'rate-limited': 'this account sent more requests than the per-minute guard allows',
  'turn-budget': 'the daily turn budget for this account was already spent',
  'platform-budget': "Quantora's shared daily limit for AI work was already spent",
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

/* The refusals Quantora itself makes, as written by /api/chat. A provider's
 * own 'quota-exhausted' is deliberately absent: that is a fault, not a
 * decision about this account. */
const REFUSAL_DETAIL = new Set(['rate-limited', 'turn-budget', 'platform-budget']);

/* The one refusal that is NOT about the person reading it. Everyone is paused,
 * so "a limit on your account" would be false and "nothing you did caused
 * this" is the whole point of saying it. */
const SHARED_REFUSAL_DETAIL = 'platform-budget';

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
    /* A refusal we chose is not "an error": that wording reads as a fault and
     * sends the person hunting for a break that never happened. Keyed on the
     * detail code, not the 429 — an exhausted provider quota reaches this
     * boundary at 429 too, and that one IS a fault. */
    if (state === 'failed' && REFUSAL_DETAIL.has(String(event.detailCode || ''))) {
      return `Quantora declined to run the turn${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}.`;
    }
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

  if (apiState === 'failed' && REFUSAL_DETAIL.has(String(last.detailCode || ''))) {
    const shared = String(last.detailCode || '') === SHARED_REFUSAL_DETAIL;
    return {
      outcome: 'server-refused',
      headline: shared
        ? 'Quantora paused new turns for everyone — a shared limit, not a failure.'
        : 'Quantora declined to run this turn — a limit on your account, not a failure.',
      detail: `${lastWords} Nothing broke: the request was turned away before any engine ran, `
        + 'so no work was lost and your message is unchanged. '
        + (shared
          ? 'This is not your allowance: Quantora reached its own shared ceiling and it resets within 24 hours. '
            + 'Adding your own API key in Settings lifts it immediately, because your key has its own allowance.'
          : 'A per-minute limit clears on its own within a minute; a daily budget clears at the next reset.'),
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
   * A provider SUCCESS followed by no terminal api.chat record is not evidence
   * of a provider timeout, nor evidence that the server died "before choosing
   * an engine". Production incident studio-f32ae5dd-4e01-4828-8896-c4c5e0add16b
   * proved the opposite: Vercel's runtime log had api.chat succeeded, while the
   * durable trace lost that last row. State exactly what survived and stop there.
   */
  if (last.boundary === 'inference.provider' && last.state === 'succeeded') {
    return {
      outcome: 'provider-finished-terminal-missing',
      headline: 'The model replied successfully, but Quantora has no terminal server record for this turn.',
      detail: `The last thing recorded was: ${lastWords} The provider completed its reply. `
        + 'The trace ends before api.chat recorded success or failure, so this record alone cannot distinguish '
        + 'a lost terminal trace from a post-processing failure. It does not prove that the provider timed out, crashed, or refused the request.'
        + (deskSilent ? ' The desk later recorded that it still did not receive a usable reply.' : ''),
      steps,
    };
  }

  /*
   * The record stops before the server's final word. That is the original
   * cut-off incident shape: started, engine chosen, engine called — then nothing.
   * Keep that diagnosis for an in-flight call / failed provider record. The
   * provider-success case above is deliberately excluded because success is
   * positive evidence that the engine DID finish.
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
