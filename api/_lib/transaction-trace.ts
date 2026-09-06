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
  return true;
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
