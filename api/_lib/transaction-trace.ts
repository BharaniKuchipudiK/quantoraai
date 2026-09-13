import { randomUUID, timingSafeEqual } from 'node:crypto';
import { recordBoundaryEvent } from './store.js';
import { observeTransactionBoundary } from './runtime-governor.js';

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
  userSub?: string | null;
};

const USER_SUB_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:@|-]{0,199}$/;

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
  try {
    void observeTransactionBoundary(event);
  } catch {
    /* governor telemetry never fails the turn */
  }
  if (isTerminalApiChat(event)) releaseTraceContext(event.correlationId);
  return true;
}

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
      /* bookkeeping never fails the turn */
    }
  }
  try {
    await observeTransactionBoundary(event);
  } catch {
    /* governor telemetry never fails the turn */
  }
  if (isTerminalApiChat(event)) releaseTraceContext(event.correlationId);
  return true;
}

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
