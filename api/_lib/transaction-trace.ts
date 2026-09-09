import { randomUUID, timingSafeEqual } from 'node:crypto';
import { recordBoundaryEvent } from './store.js';

const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}$/;
const BOUNDARY_PATTERN = /^[a-z][a-z0-9._-]{2,80}$/;
const STATE_PATTERN = /^(started|selected|attempting|succeeded|failed|parsed|compiled|rendered|interacted|skipped)$/;

export type TransactionBoundaryEvent = {
  correlationId: string;
  boundary: string;
  state: string;
  transaction?: string | null;
  route?: string | null;
  modelId?: string | null;
  gateway?: string | null;
  upstreamProvider?: string | null;
  failureDomain?: string | null;
  quotaDomain?: string | null;
  costClass?: string | null;
  health?: string | null;
  circuit?: string | null;
  durationMs?: number | null;
  budgetMs?: number | null;
  statusCode?: number | null;
  fileCount?: number | null;
  detailCode?: string | null;
  /*
   * The signed-in principal the event belongs to, when the boundary knew one.
   * Persisted so a person can resolve their own reference id; never written
   * to the log line, which stays operational data only.
   */
  userSub?: string | null;
};

const USER_SUB_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:@|-]{0,199}$/;

/*
 * The terminal SSE payload intentionally contains only browser-safe response
 * metadata. It does not repeat the signed-in owner or the golden transaction
 * label. Both are already present on earlier server boundary events for the
 * same correlation id, though, and losing them on the new durable terminal row
 * would make the trace less useful precisely while making it more reliable.
 *
 * Keep that tiny piece of turn context in memory until the terminal boundary
 * is written. This is not a second trace store: it holds only owner/transaction,
 * is bounded, and is discarded at the terminal event. A serverless restart can
 * lose this convenience context, but never the response itself.
 */
type TraceContext = { transaction: string | null; userSub: string | null; activeChats: number };
const traceContextByCorrelation = new Map<string, TraceContext>();
const MAX_TRACE_CONTEXTS = 512;

function rememberTraceContext(event: TransactionBoundaryEvent) {
  const startsChat = event.boundary === 'api.chat' && event.state === 'started';
  if (!event.transaction && !event.userSub && !startsChat) return;
  const previous = traceContextByCorrelation.get(event.correlationId)
    || { transaction: null, userSub: null, activeChats: 0 };
  if (!traceContextByCorrelation.has(event.correlationId) && traceContextByCorrelation.size >= MAX_TRACE_CONTEXTS) {
    traceContextByCorrelation.clear();
  }
  traceContextByCorrelation.set(event.correlationId, {
    transaction: event.transaction || previous.transaction,
    userSub: event.userSub || previous.userSub,
    activeChats: previous.activeChats + (startsChat ? 1 : 0),
  });
}

function traceContext(correlationId: string): TraceContext {
  return traceContextByCorrelation.get(correlationId)
    || { transaction: null, userSub: null, activeChats: 0 };
}

function releaseTraceContext(correlationId: string) {
  const context = traceContextByCorrelation.get(correlationId);
  if (!context || context.activeChats <= 1) {
    traceContextByCorrelation.delete(correlationId);
    return;
  }
  traceContextByCorrelation.set(correlationId, {
    ...context,
    activeChats: context.activeChats - 1,
  });
}

function isTerminalApiChat(event: TransactionBoundaryEvent): boolean {
  return event.boundary === 'api.chat' && (event.state === 'succeeded' || event.state === 'failed');
}

function firstHeader(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

export function normalizeCorrelationId(value: unknown): string | null {
  const candidate = String(value || '').trim();
  return CORRELATION_ID_PATTERN.test(candidate) ? candidate : null;
}

export function correlationIdForRequest(req: any): string {
  return normalizeCorrelationId(req?.headers?.['x-quantora-correlation-id'])
    || normalizeCorrelationId(req?.body?.correlationId)
    || randomUUID();
}

export function attachCorrelationId(res: any, correlationId: string) {
  res.setHeader?.('X-Quantora-Correlation-Id', correlationId);
  res.setHeader?.('Access-Control-Expose-Headers', 'X-Quantora-Correlation-Id');
}

function boundedString(value: unknown, pattern: RegExp, fallback: string | null = null): string | null {
  const candidate = String(value || '').trim().slice(0, 120);
  return pattern.test(candidate) ? candidate : fallback;
}

function boundedNumber(value: unknown, max: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : null;
}

export function normalizeBoundaryEvent(input: Partial<TransactionBoundaryEvent>): TransactionBoundaryEvent | null {
  const correlationId = normalizeCorrelationId(input.correlationId);
  const boundary = boundedString(input.boundary, BOUNDARY_PATTERN);
  const state = boundedString(input.state, STATE_PATTERN);
  if (!correlationId || !boundary || !state) return null;
  const label = (value: unknown) => boundedString(value, /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/);
  return {
    correlationId,
    boundary,
    state,
    transaction: label(input.transaction),
    route: label(input.route),
    modelId: label(input.modelId),
    gateway: label(input.gateway),
    upstreamProvider: label(input.upstreamProvider),
    failureDomain: label(input.failureDomain),
    quotaDomain: label(input.quotaDomain),
    costClass: label(input.costClass),
    health: label(input.health),
    circuit: label(input.circuit),
    durationMs: boundedNumber(input.durationMs, 600_000),
    budgetMs: boundedNumber(input.budgetMs, 600_000),
    statusCode: boundedNumber(input.statusCode, 999),
    fileCount: boundedNumber(input.fileCount, 10_000),
    detailCode: label(input.detailCode),
    userSub: boundedString(input.userSub, USER_SUB_PATTERN),
  };
}

export type BoundaryEventSink = (event: TransactionBoundaryEvent) => unknown;

/*
 * Log AND keep. Until 2026-09-05 a boundary event was one console.log line in a
 * serverless function's stdout: gone with the instance, unreadable by the
 * person holding the reference id the desk had shown them ("This turn ended
 * without a reply … Reference: studio-…"). The log line stays, for the
 * platform's own logs; the durable copy is what GET /api/trace resolves.
 * Persistence fails soft, like every store write — a turn is never blocked on
 * bookkeeping — and is injectable so a test can watch what would be kept.
 */
export function traceBoundary(
  input: Partial<TransactionBoundaryEvent>,
  persist: BoundaryEventSink | null = recordBoundaryEvent,
) {
  const event = normalizeBoundaryEvent(input);
  if (!event) return false;
  rememberTraceContext(event);
  const { userSub: _owner, ...logged } = event;
  console.log(JSON.stringify({
    type: 'quantora.transaction.boundary',
    at: new Date().toISOString(),
    ...logged,
  }));
  if (persist) {
    try {
      void persist(event);
    } catch {
      /* bookkeeping never fails the turn */
    }
  }
  if (isTerminalApiChat(event)) releaseTraceContext(event.correlationId);
  return true;
}

/**
 * The same record, but WAITED FOR.
 *
 * traceBoundary above is fire-and-forget, which is right for an event written
 * in the middle of a turn: the function keeps running for seconds afterwards
 * and the write lands long before it ends. It is exactly wrong for the last
 * event of a turn. A serverless instance is frozen the moment the handler
 * returns, so a POST started microseconds earlier never completes -- and the
 * event lost that way is the one that says what finally happened.
 *
 * Seen in production on 2026-09-08: an engine failure recorded at +114.7s and
 * nothing after it, on a turn whose catch writes an api.chat failed row on any
 * throw. The row was written. It was never delivered.
 *
 * Use this wherever the next statement ends the response. The write is bounded
 * by the store's own request timeout, so the cost is a network hop and the
 * ceiling is that timeout.
 */
export async function traceBoundarySettled(
  input: Partial<TransactionBoundaryEvent>,
  persist: BoundaryEventSink | null = recordBoundaryEvent,
): Promise<boolean> {
  const event = normalizeBoundaryEvent(input);
  if (!event) return false;
  rememberTraceContext(event);
  const { userSub: _owner, ...logged } = event;
  console.log(JSON.stringify({
    type: 'quantora.transaction.boundary',
    at: new Date().toISOString(),
    ...logged,
  }));
  if (persist) {
    try {
      await persist(event);
    } catch {
      /* bookkeeping never fails the turn — but it is no longer allowed to
       * disappear silently either: the caller waited, and that is the point. */
    }
  }
  if (isTerminalApiChat(event)) releaseTraceContext(event.correlationId);
  return true;
}

/**
 * Turn the final SSE payload into the terminal api.chat success row.
 *
 * Success used to be the one terminal path that still called traceBoundary
 * after sse.done(). That starts an asynchronous store write immediately before
 * the serverless response ends, so the instance may freeze before the write
 * lands. SseWriter now holds the socket open only for this settled write.
 *
 * Owner and transaction are not sent to the browser in the SSE payload. The
 * settled wrapper reattaches the bounded context remembered from earlier
 * server boundary events before writing the terminal row.
 */
export function chatSuccessEventFromSsePayload(payload: unknown): Partial<TransactionBoundaryEvent> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, any>;
  const correlationId = normalizeCorrelationId(row.correlationId);
  const modelId = typeof row.modelId === 'string' ? row.modelId.trim() : '';
  if (!correlationId || !modelId) return null;

  const provider = typeof row.provider === 'string' ? row.provider.toLowerCase() : '';
  const routeGateway = row.inferenceRoute && typeof row.inferenceRoute === 'object'
    ? String(row.inferenceRoute.gateway || '').trim().toLowerCase()
    : '';
  const gateway = routeGateway
    || (provider.includes('openrouter') ? 'openrouter' : provider.includes('gemini') ? 'gemini' : null);

  return {
    correlationId,
    boundary: 'api.chat',
    state: 'succeeded',
    route: '/api/chat',
    modelId,
    gateway,
    durationMs: row.latencyMs,
  };
}

export function traceSseChatSuccessSettled(
  payload: unknown,
  persist: BoundaryEventSink | null = recordBoundaryEvent,
): false | Promise<boolean> {
  const event = chatSuccessEventFromSsePayload(payload);
  if (!event || !event.correlationId) return false;
  const context = traceContext(event.correlationId);
  return traceBoundarySettled({
    ...event,
    transaction: context.transaction,
    userSub: context.userSub,
  }, persist);
}

export type TraceLookupUser = { sub: string; isAdmin?: boolean } | null | undefined;

/**
 * Which events of one reference a user may read: all of them for its owner or
 * an admin, none otherwise. "None" is returned as null and answered exactly
 * like "no record", so a reference cannot be probed for existence. An empty
 * record for a signed-in user is the honest empty list.
 */
export function authorizeTraceLookup(
  events: TransactionBoundaryEvent[],
  user: TraceLookupUser,
): TransactionBoundaryEvent[] | null {
  if (!user || !user.sub) return null;
  if (!events.length) return [];
  if (user.isAdmin === true) return events;
  const owned = events.some((event) => Boolean(event.userSub) && event.userSub === user.sub);
  return owned ? events : null;
}

/** The lookup response never carries the owner. */
export function publicTraceEvents(events: TransactionBoundaryEvent[]): Omit<TransactionBoundaryEvent, 'userSub'>[] {
  return events.map((event) => {
    const { userSub: _owner, ...rest } = event;
    return rest;
  });
}

export function isGoldenCanaryRequest(req: any): boolean {
  const expected = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
  const supplied = firstHeader(req?.headers?.['x-quantora-golden-canary']);
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
