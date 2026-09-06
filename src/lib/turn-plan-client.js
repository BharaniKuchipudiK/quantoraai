/*
 * PHASE 7, FIRST CUT — the client's side of the turn planner.
 *
 * One request per turn to /api/plan-turn, bounded by a short timeout, and one
 * pure policy for what the answer may change. The planner may ADD a lane —
 * make a build of a brief the regexes read as chat, keep an Office noun used
 * as a look out of the Office generator, name an advisor desk the resolver
 * missed — and it may never move a pinned chat or veto a build the desk
 * already owns. When it does not answer in time, the turn runs exactly as it
 * did before this module existed.
 */

export const TURN_PLAN_TIMEOUT_MS = 3_500;
export const TURN_PLAN_ENDPOINT = '/api/plan-turn';

const LANES = new Set(['build', 'office', 'advisor', 'chat']);
const ADVISOR_DESKS = new Set(['travel', 'finance', 'education', 'research']);

/** The body the planner reads: the whole message, what is attached, a bounded history, the pinned desk. */
export function turnPlanRequest({
  text = '',
  attachments = [],
  messages = [],
  pinnedDesk = null,
  codingDeskOpen = false,
  hasDeskFiles = false,
  buildOwned = false,
  activeOfficeKind = null,
} = {}) {
  return {
    message: String(text || ''),
    attachments: (Array.isArray(attachments) ? attachments : [])
      .filter((item) => item && (item.name || item.type))
      .slice(0, 8)
      .map((item) => ({ name: String(item.name || ''), kind: item.type === 'image' ? 'image' : 'document' })),
    history: (Array.isArray(messages) ? messages : [])
      .filter((message) => message && typeof message.text === 'string' && message.id !== 1)
      .slice(-6)
      .map((message) => ({ sender: message.sender === 'user' ? 'user' : 'ai', text: String(message.text).slice(0, 600) })),
    pinnedDesk: pinnedDesk || null,
    codingDeskOpen: Boolean(codingDeskOpen),
    hasDeskFiles: Boolean(hasDeskFiles),
    buildOwned: Boolean(buildOwned),
    activeOfficeKind: activeOfficeKind || null,
  };
}

/** A readable plan from the endpoint's answer, or null. */
export function readTurnPlan(payload) {
  const plan = payload && typeof payload === 'object' ? payload.plan : null;
  if (!plan || typeof plan !== 'object' || !LANES.has(plan.lane)) return null;
  return {
    lane: plan.lane,
    desk: typeof plan.desk === 'string' ? plan.desk : null,
    officeKind: typeof plan.officeKind === 'string' ? plan.officeKind : null,
    buildMode: plan.buildMode === true,
    confidence: Number.isFinite(Number(plan.confidence)) ? Number(plan.confidence) : 0,
    source: plan.source === 'planner' ? 'planner' : 'fallback',
    agreed: plan.agreed === true,
    reason: typeof plan.reason === 'string' ? plan.reason.slice(0, 300) : '',
  };
}

/**
 * Ask the planner. Null on any fault — a missing endpoint, a stub that answers
 * something else, a slow provider — so the turn never waits on it for long
 * and never fails because of it.
 */
export async function requestTurnPlan(request, { fetchFn = typeof fetch === 'function' ? fetch : null, timeoutMs = TURN_PLAN_TIMEOUT_MS, headers = {} } = {}) {
  if (typeof fetchFn !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(TURN_PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(request),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res || !res.ok) return null;
    return readTurnPlan(await res.json().catch(() => null));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * What a plan may change on the turn. Pure, so the policy is testable apart
 * from the hook: the planner adds lanes and never removes what a desk owns.
 */
export function turnPlanOverrides(plan, { chosenOfficeKind = null, deterministicBuild = false, pinnedDesk = null, currentDesk = null, buildOwned = false } = {}) {
  if (chosenOfficeKind) {
    // A kind picked by hand is not a guess; the planner does not second-guess it.
    return { officeKind: chosenOfficeKind, isCodingRequest: false, desk: currentDesk, applied: false };
  }
  if (!plan) return { officeKind: undefined, isCodingRequest: deterministicBuild, desk: undefined, applied: false };
  const officeKind = plan.lane === 'office' ? plan.officeKind : null;
  /*
   * The second invariant, on the client as on the server: a build the desk
   * already owns is never vetoed. A "chat" plan for "change the heading" on
   * a desk that shows a site (files or a single HTML page) is still that
   * site's turn — the server reconciles the same way, and a client that did
   * not would take the model's word over the desk (2026-09-06, second run).
   */
  const advisorPinned = Boolean(pinnedDesk) && pinnedDesk !== 'coding';
  const isCodingRequest = deterministicBuild
    || plan.lane === 'build'
    || (buildOwned && plan.lane === 'chat' && !advisorPinned);
  let desk;
  if (pinnedDesk) desk = undefined; // the resolver keeps the pin; the plan cannot move it
  else if (plan.lane === 'advisor' && ADVISOR_DESKS.has(plan.desk)) desk = plan.desk;
  else if ((plan.lane === 'build' || plan.lane === 'chat') && !currentDesk) desk = null;
  else desk = undefined;
  return { officeKind, isCodingRequest, desk, applied: true };
}
