/*
 * The desk's half of "a reference resolves".
 *
 * A failed turn shows a reference id. Until 2026-09-05 that id was a handle to
 * nothing the person could reach; GET /api/trace?correlationId= now answers with
 * the persisted boundary events and their plain-English account
 * (shared/trace-story.js). This wrapper turns every way that call can end into
 * something the desk can say truthfully — including "this deployment keeps no
 * trace store", which is a fact about the platform, not about the turn.
 */
import { normalizeClientCorrelationId } from './transaction-trace.js';
import { activityProgressFromTrace } from './activity-progress.js';

export function traceLookupUrl(correlationId) {
  const normalized = normalizeClientCorrelationId(correlationId);
  return normalized ? `/api/trace?correlationId=${encodeURIComponent(normalized)}` : null;
}

function failed(error, status = null) {
  return { ok: false, story: null, events: [], activities: [], error, status };
}

/**
 * @returns {Promise<{ ok: boolean, story: object|null, events: Array<object>, activities: Array<object>, error: string|null, status: number|null }>}
 */
export async function fetchTraceStory(correlationId, { fetchImpl = globalThis.fetch } = {}) {
  const url = traceLookupUrl(correlationId);
  if (!url) return failed('That reference is not one Quantora issued.');
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
  } catch {
    return failed('Quantora could not be reached to resolve this reference.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const said = body && typeof body.error === 'string' ? body.error : '';
    const error = response.status === 401
      ? 'Sign in to resolve this reference.'
      : response.status === 404
        ? 'Quantora has no record under this reference for your account.'
        : said || `Quantora answered ${response.status} while resolving this reference.`;
    return failed(error, response.status);
  }
  const story = body && body.story && typeof body.story === 'object' ? body.story : null;
  if (!story || typeof story.headline !== 'string') {
    return failed('Quantora answered without an account of this reference.', response.status);
  }
  const events = Array.isArray(body.events) ? body.events : [];
  return {
    ok: true,
    story,
    events,
    activities: activityProgressFromTrace(events),
    error: null,
    status: response.status,
  };
}
