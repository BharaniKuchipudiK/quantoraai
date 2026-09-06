import type { AtomicProviderCircuitStore, ProviderCircuitState } from './provider-resilience.js';

export type InferenceGateway = 'gemini' | 'openrouter';
export type InferenceCapability = 'text' | 'code' | 'vision' | 'travel-tools';
export type InferenceCostClass = 'free' | 'low' | 'standard' | 'unknown';

export type InferenceRoute = {
  id: string;
  provider: InferenceGateway;
  gateway: InferenceGateway;
  upstreamProvider: string;
  reason: 'primary' | 'fallback';
  capabilities: InferenceCapability[];
  health: 'available' | 'unknown' | 'offline';
  quotaDomain: string;
  failureDomain: string;
  costClass: InferenceCostClass;
  circuitKey: string;
  domainCircuitKey: string;
  circuit: 'closed' | 'open';
  /** True only for the reserved paid rescue rung. Never a free route. */
  paid?: boolean;
};

export type InferenceModelLike = {
  id?: string;
  provider?: string;
  available?: boolean;
  lifecycle?: string;
  health?: string;
  pricingKind?: string;
  /** Declared by the provider catalogue; not inferred from the id. */
  vision?: boolean;
};

export type InferencePlanInput = {
  primaryModelId: string;
  fallbackModelIds?: string[];
  models?: InferenceModelLike[];
  requiredCapabilities?: InferenceCapability[];
  geminiAvailable: boolean;
  openRouterAvailable: boolean;
  geminiCredentialScope?: 'server' | 'user';
  openRouterCredentialScope?: 'server' | 'user';
  geminiCredentialPartition?: string;
  openRouterCredentialPartition?: string;
  requestPartition?: string;
  circuitStore?: Pick<AtomicProviderCircuitStore, 'get'>;
  now?: number;
  /**
   * A paid model to hold in reserve as the FINAL rung, reached only after the
   * free ladder is exhausted. Present only when the account has opted in with a
   * configured ceiling and the spend meter currently permits paid routing — the
   * caller decides that from the ledger, so this plane never spends on its own.
   */
  paidLastResortModelId?: string;
  paidLastResortAllowed?: boolean;
};

const GEMINI_STABLE = 'gemini-flash-latest';
/*
 * The cheapest route worth falling back to. This pointed at deepseek-chat, a
 * V3-era id, while deepseek/deepseek-v4-flash-0731 carries 12.5T tokens a week
 * on OpenRouter at $0.12/Mtok — the most-used low-cost model there, and a
 * hundredth the price of a flagship.
 */
const OPENROUTER_LOW_COST = 'deepseek/deepseek-v4-flash-0731';
const NEMOTRON_SUPER = 'nvidia/nemotron-3-super-120b-a12b:free';
/*
 * How many models one turn may try. Two meant a free-quota 429 plus one
 * unlucky fallback ended the turn with "the model is busy" while other healthy
 * routes sat unused. The wall-clock budget, the circuit breaker and the
 * failed-quota-domain skip are what prevent a retry storm — not this count.
 */
const MAX_INFERENCE_ATTEMPTS = 4;
/*
 * The single largest constraint on build quality. At 65s a flagship model was
 * cut off part-way through a multi-file page: the tokens were generated and
 * billed, then discarded, and the turn degraded to a weaker fallback. Raised so
 * the chosen model gets a window it can actually finish in, while still leaving
 * a build-viable rung behind it.
 */
const MAX_PRIMARY_BUILD_ATTEMPT_MS = 110_000;
/* An attempt below this has no realistic chance of producing a build. */
const MIN_VIABLE_ATTEMPT_MS = 20_000;
/*
 * A multi-file build (a page plus its catalogue, styles and scripts) does not
 * come back in 20s on any model. Splitting a 120s turn across four rungs handed
 * out 60s/20s/20s/20s: the primary was cut off mid-file and the three rungs
 * behind it could not finish either, so the whole budget was spent producing
 * truncated output and the turn ended at the client's deadline. Every heavy
 * build failed the same way, for arithmetic reasons rather than model quality.
 *
 * So a BUILD turn plans only as many rungs as the budget can actually fund at a
 * build-viable size. Fewer, real attempts beat four doomed ones.
 */
export const MIN_VIABLE_BUILD_ATTEMPT_MS = 45_000;

/*
 * Two rungs, not three. Every extra rung is reserved out of the PRIMARY's window,
 * and the primary is the attempt most likely to succeed - a third rung cost it
 * 35s (110s -> 75s) to buy a third try that only runs after two real attempts
 * already failed. One full-length attempt at the best model plus one real
 * fallback is the better trade.
 */
const MAX_BUILD_RUNGS = 2;

/** How many build rungs the remaining wall-clock can fund at a viable size. */
/**
 * The budget this turn may actually spend, given what the browser has left.
 *
 * THE DEFECT THIS CLOSES. The handler planned against a constant that restarts
 * on every request, while the browser plans against a deadline that does not.
 * On a retry after a 100s first attempt the browser has ~75s left and the
 * server plans as if it has a fresh 165s — funding a primary rung of up to
 * 110s whose result nobody will still be waiting for. Two planners, one wall
 * clock, neither aware of the other: exit answer #6's duplicate authority,
 * costing real tokens.
 *
 * THE CLIENT MAY ONLY SHORTEN. Never extend. A caller that asks for more than
 * the ceiling gets the ceiling, so a buggy or hostile body cannot buy itself
 * more of the platform's time than the platform allows.
 *
 * An absent, zero, negative or unparseable value means "no information", and
 * that yields the full ceiling — an older client that does not send it must
 * behave exactly as before.
 */
export function resolveTurnBudgetMs(requested: unknown, ceilingMs: number): number {
  const asked = Number(requested);
  if (!Number.isFinite(asked) || asked <= 0) return ceilingMs;
  return Math.min(ceilingMs, Math.floor(asked));
}

/**
 * INDEPENDENCE BEATS DEPTH (2026-09-06).
 *
 * A build turn keeps only the rungs its budget can fund (MAX_BUILD_RUNGS,
 * MIN_VIABLE_BUILD_ATTEMPT_MS). The trim used to keep the first N rungs, and
 * with a Gemini model pinned the first two were both Gemini — so on the day
 * Google refused the project's spend cap, a pinned Gemini Flash build was
 * refused twice and the OpenRouter rung at the back of the ladder, the one
 * that would have answered, had been cut for budget. Two rungs on one dead
 * gateway are one rung.
 *
 * When the kept rungs all sit on one gateway and a dropped rung on the other
 * gateway is not circuit-open, it takes the last kept slot. The primary is
 * never displaced: the user's pin is honoured first, and only the second
 * chance changes. With one fundable rung there is no second chance to give.
 */
export function trimBuildLadder(attempts: InferenceRoute[], fundable: number): InferenceRoute[] {
  const keep = Math.max(1, Math.floor(fundable));
  if (attempts.length <= keep) return attempts;
  const kept = attempts.slice(0, keep);
  const dropped = attempts.slice(keep);
  const gateways = new Set(kept.map((route) => route.gateway));
  if (keep < 2 || gateways.size > 1) return kept;
  const [only] = [...gateways];
  const independent = dropped.find((route) => route.gateway !== only && route.circuit !== 'open');
  if (!independent) return kept;
  return [...kept.slice(0, keep - 1), independent];
}

export function maxViableBuildAttempts(
  totalBudgetMs: number,
  minAttemptMs: number = MIN_VIABLE_BUILD_ATTEMPT_MS,
) {
  const budget = Math.max(0, Math.floor(totalBudgetMs));
  const floorMs = Math.max(1, Math.floor(minAttemptMs));
  return Math.max(1, Math.min(MAX_BUILD_RUNGS, Math.floor(budget / floorMs)));
}
const COST_RANK: Record<InferenceCostClass, number> = { free: 0, low: 1, standard: 2, unknown: 3 };

const MODEL_ID_ALIASES: Record<string, string> = {
  'nvidia/nemotron-3-super:free': NEMOTRON_SUPER,
  'nvidia/nemotron-3-super': NEMOTRON_SUPER,
  'nemotron-3-super': NEMOTRON_SUPER,
  'qwen-2.5-coder-32b': 'qwen/qwen-2.5-coder-32b-instruct',
  'qwen-2.5-coder-32b-instruct': 'qwen/qwen-2.5-coder-32b-instruct',
};

export function canonicalizeModelId(modelId: string): string {
  const trimmed = String(modelId || '').trim();
  if (!trimmed) return '';
  return MODEL_ID_ALIASES[trimmed] || MODEL_ID_ALIASES[trimmed.toLowerCase()] || trimmed;
}

/**
 * A build route cannot consume the entire turn before an independent fallback
 * gets a chance. The final attempt receives whatever remains.
 */
export function inferenceAttemptBudgetMs(
  totalRemainingMs: number,
  attemptsRemaining: number,
  { minAttemptMs = MIN_VIABLE_ATTEMPT_MS }: { minAttemptMs?: number } = {},
) {
  const remaining = Math.max(0, Math.floor(totalRemainingMs));
  if (attemptsRemaining <= 1) return remaining;
  const MIN_VIABLE_ATTEMPT_MS = Math.max(1, Math.floor(minAttemptMs));
  /*
   * Reserve a viable minimum for EACH remaining attempt, not a fixed amount for
   * one. The old fixed reserve left the tail of a four-rung ladder with 15s and
   * then 5s - and the last rung is the reserved PAID rescue, so a naive reserve
   * set the paid last-resort up to fail. This attempt takes a generous slice but
   * never eats into the minimum the rungs behind it need.
   */
  const reserveForRest = (attemptsRemaining - 1) * MIN_VIABLE_ATTEMPT_MS;
  const slice = Math.min(MAX_PRIMARY_BUILD_ATTEMPT_MS, remaining - reserveForRest);
  return Math.max(0, Math.min(remaining, Math.max(slice, MIN_VIABLE_ATTEMPT_MS)));
}

function safeLabel(value: string, fallback: string) {
  const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9._:/-]/g, '-').slice(0, 120);
  return cleaned || fallback;
}

function gatewayFor(modelId: string): InferenceGateway {
  return modelId.startsWith('gemini') ? 'gemini' : 'openrouter';
}

function upstreamProviderFor(modelId: string, registry?: InferenceModelLike) {
  if (gatewayFor(modelId) === 'gemini') return 'google';
  const fromId = modelId.includes('/') ? modelId.split('/')[0] : '';
  return safeLabel(fromId || registry?.provider || 'unknown', 'unknown').toLowerCase();
}

function capabilitiesFor(modelId: string, registry?: InferenceModelLike): InferenceCapability[] {
  if (gatewayFor(modelId) === 'gemini') return ['text', 'code', 'vision', 'travel-tools'];
  /*
   * Vision used to be granted to Gemini alone, so attaching an image to a turn on
   * an explicitly pinned OpenRouter model filtered that model out: the turn either
   * silently rerouted to Gemini (ignoring the user's choice) or 503'd when no
   * Gemini credential existed. Plenty of OpenRouter models are multimodal, so read
   * the capability from the catalogue that says so rather than inferring it from
   * the vendor prefix. Absent that signal we stay conservative and omit vision.
   */
  return registry?.vision ? ['text', 'code', 'vision'] : ['text', 'code'];
}

function costClassFor(modelId: string, registry?: InferenceModelLike): InferenceCostClass {
  const pricing = String(registry?.pricingKind || '').toLowerCase();
  if (modelId.endsWith(':free') || pricing === 'free' || pricing === 'free-tier') return 'free';
  if (modelId === OPENROUTER_LOW_COST) return 'low';
  if (pricing === 'paid') return 'standard';
  return 'unknown';
}

function healthFor(registry?: InferenceModelLike): InferenceRoute['health'] {
  if (!registry) return 'unknown';
  if (registry.available === false || ['retired', 'offline', 'unavailable'].includes(String(registry.lifecycle || registry.health || '').toLowerCase())) {
    return 'offline';
  }
  return 'available';
}

function isOpen(state: ProviderCircuitState | null, now: number) {
  return Boolean(state?.openedUntil && state.openedUntil > now);
}

async function describeRoute(
  modelId: string,
  reason: InferenceRoute['reason'],
  input: InferencePlanInput,
  registry: Map<string, InferenceModelLike>,
): Promise<InferenceRoute | null> {
  const gateway = gatewayFor(modelId);
  if (gateway === 'gemini' && !input.geminiAvailable) return null;
  if (gateway === 'openrouter' && !input.openRouterAvailable) return null;
  /*
   * A batch endpoint is ASYNCHRONOUS: it accepts a job and answers later, so it
   * can never stream a chat turn. Routing to one produces a turn that simply
   * never replies.
   *
   * These are a trap because they are cheap - a provider's `:batch` variant can
   * list at half the price of the same model, so anyone choosing on price picks
   * the one that cannot work. The Anthropic discovery path already filtered
   * them, which left every OTHER way into the router unguarded: an operator
   * approving one in the registry, a pinned id, a curated entry. This is the
   * chokepoint all routes pass through, so it belongs here.
   */
  if (/[:-]batch\b/i.test(modelId)) return null;

  const model = registry.get(modelId);
  const capabilities = capabilitiesFor(modelId, model);
  const required = input.requiredCapabilities || ['text'];
  if (required.some((capability) => !capabilities.includes(capability))) return null;

  const credentialScope = gateway === 'gemini'
    ? input.geminiCredentialScope || 'server'
    : input.openRouterCredentialScope || 'server';
  const credentialPartition = gateway === 'gemini'
    ? input.geminiCredentialPartition
    : input.openRouterCredentialPartition;
  const partition = credentialScope === 'user'
    ? safeLabel(credentialPartition || input.requestPartition || 'request-local', 'request-local')
    : null;
  const quotaDomain = `${gateway}:${credentialScope}${partition ? `:${partition}` : ''}`;
  const failureDomain = quotaDomain;
  const upstreamProvider = upstreamProviderFor(modelId, model);
  const circuitKey = `inference:route:${gateway}:${upstreamProvider}:${safeLabel(modelId, 'model')}`;
  const domainCircuitKey = `inference:domain:${failureDomain}`;
  const now = input.now ?? Date.now();
  const [routeCircuit, domainCircuit] = input.circuitStore
    ? await Promise.all([input.circuitStore.get(circuitKey), input.circuitStore.get(domainCircuitKey)])
    : [null, null];

  return {
    id: modelId,
    provider: gateway,
    gateway,
    upstreamProvider,
    reason,
    capabilities,
    health: healthFor(model),
    quotaDomain,
    failureDomain,
    costClass: costClassFor(modelId, model),
    circuitKey,
    domainCircuitKey,
    circuit: isOpen(routeCircuit, now) || isOpen(domainCircuit, now) ? 'open' : 'closed',
  };
}

/**
 * Produces a bounded, capability-qualified route plan. The selected model stays
 * first when it is executable; fallbacks prefer a genuinely different gateway
 * and credential/quota domain before another model inside the same account.
 */
export async function planInferenceRoutes(input: InferencePlanInput): Promise<InferenceRoute[]> {
  const primary = canonicalizeModelId(input.primaryModelId);
  if (!primary) return [];
  const registry = new Map((input.models || []).filter((model) => model?.id).map((model) => [String(model.id), model]));
  const ids = [primary, ...((input.fallbackModelIds || []).map(canonicalizeModelId)), GEMINI_STABLE, OPENROUTER_LOW_COST]
    .map((id) => String(id || '').trim())
    .filter((id, index, all) => Boolean(id) && all.indexOf(id) === index);

  const described = (await Promise.all(ids.map((id, index) => describeRoute(id, index === 0 ? 'primary' : 'fallback', input, registry))))
    .filter((route): route is InferenceRoute => Boolean(route))
    .filter((route) => route.health !== 'offline');

  // Active list empty/unhealthy can mark every catalog row offline — including
  // gemini-flash-latest. Coding Desk Auto must still get one last-resort Gemini
  // attempt when credentials exist (otherwise "no healthy AI route" spine).
  /*
   * Every gateway with a credential gets a way in, not just Gemini.
   *
   * The old form only injected a last resort when the pool was COMPLETELY
   * empty, and only for Gemini. So when the Active list marked the Gemini rows
   * offline but left something unusable on OpenRouter, the pool was non-empty,
   * nothing was injected, and Flash died alone — the client painting "no
   * healthy AI route" while a perfectly good OpenRouter credential sat unused.
   *
   * A gateway that is credentialed and unrepresented now gets one stable route
   * appended. Registry health cannot veto it: an empty registry means health
   * "unknown", which is not the same as offline, and treating an absent record
   * as a dead provider is the same mistake as reading a key's shape as proof it
   * works.
   */
  let poolDescribed = described;
  const hasGateway = (gateway: InferenceGateway) => poolDescribed.some((route) => route.gateway === gateway);
  const emptyRegistry = new Map<string, InferenceModelLike>();

  /*
   * Gemini goes to the FRONT, the OpenRouter fallback to the back.
   *
   * Not arbitrary: Gemini is direct to Google on the operator's own plan and
   * costs no OpenRouter credit at all, so when both are only reachable as last
   * resorts, the free one is tried first. The old code expressed the same
   * preference by REPLACING the pool with the Gemini route; appending it would
   * have quietly demoted the zero-cost gateway below a paid one.
   */
  if (input.geminiAvailable && !hasGateway('gemini')) {
    const lastResort = await describeRoute(GEMINI_STABLE, 'fallback', input, emptyRegistry);
    if (lastResort && lastResort.health !== 'offline') poolDescribed = [lastResort, ...poolDescribed];
  }
  if (input.openRouterAvailable && !hasGateway('openrouter')) {
    const lastResort = await describeRoute(OPENROUTER_LOW_COST, 'fallback', input, emptyRegistry);
    if (lastResort && lastResort.health !== 'offline') poolDescribed = [...poolDescribed, lastResort];
  }
  if (!poolDescribed.length) return [];

  const live = poolDescribed.filter((route) => route.circuit !== 'open');
  // An open circuit must not leave Studio with zero routes. Use a last-resort
  // executable path (prefer a different gateway) so two OpenRouter 429s cannot
  // strand a signed-in user with "No executable model was selected."
  const pool = live.length ? live : poolDescribed;

  const selected = pool.find((route) => route.id === primary && route.circuit !== 'open')
    || pool.find((route) => route.circuit !== 'open')
    || pool.find((route) => route.gateway === 'gemini')
    || pool[0];
  // The caller (select-models) hands fallbacks pre-ordered by measured
  // finish-reliability. Preserve that order as a tiebreaker so a reliable
  // fallback the router put first is not demoted purely because a less reliable
  // one is cheaper. Operational resilience still leads — failure-domain
  // independence from the primary and circuit/health come first, so a same-domain
  // fallback (likely to fail with the primary) still yields to an independent one.
  const reliabilityRank = new Map(ids.map((id, index) => [id, index]));
  const rankOf = (route: InferenceRoute) => (reliabilityRank.has(route.id) ? reliabilityRank.get(route.id)! : Number.MAX_SAFE_INTEGER);
  const rest = pool.filter((route) => route.id !== selected.id).sort((left, right) => {
    const leftIndependent = left.failureDomain !== selected.failureDomain ? 1 : 0;
    const rightIndependent = right.failureDomain !== selected.failureDomain ? 1 : 0;
    if (leftIndependent !== rightIndependent) return rightIndependent - leftIndependent;
    const leftKnown = left.health === 'available' ? 1 : 0;
    const rightKnown = right.health === 'available' ? 1 : 0;
    if (leftKnown !== rightKnown) return rightKnown - leftKnown;
    const leftRank = rankOf(left);
    const rightRank = rankOf(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return COST_RANK[left.costClass] - COST_RANK[right.costClass];
  });

  const freeLadder = [selected, ...rest];

  // Reserve the last rung for a paid rescue when the account has opted in and
  // the meter permits it. The free ladder always runs first and takes every
  // slot but one; paid is only ever reached after free is exhausted, and is
  // never sticky because the caller re-decides `paidLastResortAllowed` each turn.
  const paidId = canonicalizeModelId(input.paidLastResortModelId || '');
  const wantsPaid = Boolean(
    paidId
    && input.paidLastResortAllowed === true
    && !freeLadder.some((route) => route.id === paidId),
  );
  let paidRoute: InferenceRoute | null = null;
  if (wantsPaid) {
    const described = await describeRoute(paidId, 'fallback', input, registry);
    if (described && described.health !== 'offline' && described.circuit !== 'open') {
      paidRoute = { ...described, paid: true };
    }
  }

  const freeSlots = paidRoute ? Math.max(1, MAX_INFERENCE_ATTEMPTS - 1) : MAX_INFERENCE_ATTEMPTS;
  const ladder = freeLadder.slice(0, freeSlots);
  if (paidRoute) ladder.push(paidRoute);

  return ladder.map((route, index) => ({
    ...route,
    reason: index === 0 && route.id === primary ? 'primary' : 'fallback',
  }));
}

export type InferenceReadiness = {
  ready: boolean;
  geminiConfigured: boolean;
  openRouterConfigured: boolean;
  routeCount: number;
  usedLastResort: boolean;
};

/**
 * Cheap, no-upstream check: can Studio plan at least one executable route for a
 * normal code turn? This is the invariant the fake "Live API Engine Active"
 * badge used to claim without evidence.
 */
export async function summarizeInferenceReadiness(input: {
  geminiAvailable: boolean;
  openRouterAvailable: boolean;
  circuitStore?: InferencePlanInput['circuitStore'];
  now?: number;
}): Promise<InferenceReadiness> {
  const routes = await planInferenceRoutes({
    primaryModelId: NEMOTRON_SUPER,
    geminiAvailable: input.geminiAvailable,
    openRouterAvailable: input.openRouterAvailable,
    requiredCapabilities: ['text', 'code'],
    circuitStore: input.circuitStore,
    now: input.now,
  });
  const live = routes.filter((route) => route.circuit !== 'open');
  return {
    ready: routes.length > 0,
    geminiConfigured: input.geminiAvailable,
    openRouterConfigured: input.openRouterAvailable,
    routeCount: routes.length,
    usedLastResort: routes.length > 0 && live.length === 0,
  };
}

const CIRCUIT_FAILURE_THRESHOLD = 2;
const ROUTE_RESET_MS = 5 * 60_000;
const DOMAIN_RESET_MS = 60_000;

export async function recordInferenceRouteFailure(
  store: AtomicProviderCircuitStore,
  route: InferenceRoute,
  status: number,
  now = Date.now(),
) {
  const key = status === 429 ? route.domainCircuitKey : route.circuitKey;
  return store.recordFailure(key, {
    now,
    failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
    resetMs: status === 429 ? DOMAIN_RESET_MS : ROUTE_RESET_MS,
  });
}

export async function recordInferenceRouteSuccess(
  store: AtomicProviderCircuitStore,
  route: InferenceRoute,
  now = Date.now(),
) {
  await Promise.all([
    store.recordSuccess(route.circuitKey, now),
    store.recordSuccess(route.domainCircuitKey, now),
  ]);
}
