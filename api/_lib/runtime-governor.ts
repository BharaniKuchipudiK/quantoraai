import type { TransactionBoundaryEvent } from './transaction-trace.js';

export const RUNTIME_LIFECYCLE_STATES = [
  'received', 'planned', 'executing', 'validating', 'recovering', 'completed', 'failed',
] as const;

export type RuntimeLifecycleState = (typeof RUNTIME_LIFECYCLE_STATES)[number];
export type RuntimeTerminalState = 'completed' | 'failed';

export type RuntimeGovernorEvent = {
  lifecycleId: string;
  correlationId: string;
  state: RuntimeLifecycleState;
  at: string;
  userSub?: string | null;
  runId?: string | null;
  source: 'chat' | 'qir' | 'delivery' | 'system';
  provider?: string | null;
  modelId?: string | null;
  route?: string | null;
  tool?: string | null;
  workspaceId?: string | null;
  retryCount?: number;
  recoveryCount?: number;
  terminal?: boolean;
  verified?: boolean;
  reason?: string | null;
  evidenceRef?: string | null;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@|-]{0,199}$/;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/# -]{0,239}$/;
const active = new Map<string, RuntimeLifecycleState>();
const lastObservedAt = new Map<string, number>();
const terminal = new Set<string>();
const MAX_ACTIVE = 1024;
const STORE_TIMEOUT_MS = 2_000;
const OPPORTUNISTIC_STALE_MS = 4 * 60_000;
let sweeping = false;

function bounded(value: unknown, max = 240): string | null {
  const text = String(value ?? '').trim().slice(0, max);
  return text && SAFE_LABEL.test(text) ? text : null;
}

function lifecycleId(correlationId: string): string {
  return `life:${correlationId}`;
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}

export function isRuntimeLifecycleState(value: unknown): value is RuntimeLifecycleState {
  return (RUNTIME_LIFECYCLE_STATES as readonly unknown[]).includes(value);
}

export function normalizeRuntimeGovernorEvent(input: Partial<RuntimeGovernorEvent>): RuntimeGovernorEvent | null {
  const correlationId = String(input.correlationId || '').trim();
  if (!SAFE_ID.test(correlationId) || !isRuntimeLifecycleState(input.state)) return null;
  const source = ['chat', 'qir', 'delivery', 'system'].includes(String(input.source))
    ? input.source as RuntimeGovernorEvent['source'] : 'system';
  const isTerminal = input.state === 'completed' || input.state === 'failed';
  return {
    lifecycleId: lifecycleId(correlationId), correlationId, state: input.state,
    at: typeof input.at === 'string' && input.at ? input.at : new Date().toISOString(), source,
    userSub: bounded(input.userSub, 200), runId: bounded(input.runId, 128),
    provider: bounded(input.provider, 120), modelId: bounded(input.modelId, 160),
    route: bounded(input.route, 160), tool: bounded(input.tool, 160), workspaceId: bounded(input.workspaceId, 160),
    retryCount: Math.max(0, Math.min(100, Math.round(Number(input.retryCount) || 0))),
    recoveryCount: Math.max(0, Math.min(100, Math.round(Number(input.recoveryCount) || 0))),
    terminal: isTerminal, verified: isTerminal ? Boolean(input.verified) : false,
    reason: bounded(input.reason, 240), evidenceRef: bounded(input.evidenceRef, 240),
  };
}

export type RuntimeGovernorSink = (event: RuntimeGovernorEvent) => Promise<void> | void;

export async function persistRuntimeGovernorEvent(event: RuntimeGovernorEvent): Promise<void> {
  const cfg = supabaseConfig();
  if (!cfg) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORE_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.url}/rest/v1/runtime_governor_events`, {
      method: 'POST',
      headers: {
        apikey: cfg.key, Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        lifecycle_id: event.lifecycleId, correlation_id: event.correlationId,
        lifecycle_state: event.state, event_at: event.at, user_sub: event.userSub || null,
        run_id: event.runId || null, source: event.source, provider: event.provider || null,
        model_id: event.modelId || null, route: event.route || null, tool: event.tool || null,
        workspace_id: event.workspaceId || null, retry_count: event.retryCount || 0,
        recovery_count: event.recoveryCount || 0, terminal: Boolean(event.terminal),
        verified: Boolean(event.verified), reason: event.reason || null, evidence_ref: event.evidenceRef || null,
      }),
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 409) console.warn(`runtime governor persist -> ${response.status}`);
  } catch (error: any) {
    console.warn('runtime governor persist failed:', error?.message || error);
  } finally {
    clearTimeout(timer);
  }
}

async function sweepOneStalledLifecycle(exceptCorrelationId: string, sink: RuntimeGovernorSink) {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Date.now();
    for (const [correlationId, seenAt] of lastObservedAt) {
      if (correlationId === exceptCorrelationId || terminal.has(correlationId)) continue;
      if (now - seenAt < OPPORTUNISTIC_STALE_MS) continue;
      await terminalizeStalledLifecycle({
        correlationId,
        lastObservedAtMs: seenAt,
        nowMs: now,
        staleAfterMs: OPPORTUNISTIC_STALE_MS,
      }, sink);
      break;
    }
  } finally {
    sweeping = false;
  }
}

export async function observeRuntimeLifecycle(
  input: Partial<RuntimeGovernorEvent>,
  sink: RuntimeGovernorSink = persistRuntimeGovernorEvent,
): Promise<RuntimeGovernorEvent | null> {
  const event = normalizeRuntimeGovernorEvent(input);
  if (!event) return null;
  if (terminal.has(event.correlationId)) return null;
  if (active.size >= MAX_ACTIVE && !active.has(event.correlationId)) {
    active.clear(); lastObservedAt.clear(); terminal.clear();
  }
  const previous = active.get(event.correlationId);
  lastObservedAt.set(event.correlationId, Date.now());
  if (previous === event.state && !event.terminal) return event;
  active.set(event.correlationId, event.state);
  if (event.terminal) terminal.add(event.correlationId);
  try { await sink(event); } catch { /* observability never becomes availability */ }
  if (!event.terminal) await sweepOneStalledLifecycle(event.correlationId, sink);
  return event;
}

export function governorStateFor(correlationId: string): RuntimeLifecycleState | null {
  return active.get(correlationId) || null;
}

export async function terminalizeStalledLifecycle(input: {
  correlationId: string; userSub?: string | null; source?: RuntimeGovernorEvent['source'];
  lastObservedAtMs: number; nowMs?: number; staleAfterMs: number; reason?: string;
}, sink: RuntimeGovernorSink = persistRuntimeGovernorEvent): Promise<boolean> {
  const now = input.nowMs ?? Date.now();
  if (terminal.has(input.correlationId)) return false;
  if (now - input.lastObservedAtMs < input.staleAfterMs) return false;
  const event = await observeRuntimeLifecycle({
    correlationId: input.correlationId, state: 'failed', source: input.source || 'system',
    userSub: input.userSub, verified: false,
    reason: input.reason || 'stalled-without-terminal-outcome', evidenceRef: input.correlationId,
  }, sink);
  return Boolean(event);
}

export function governorEventFromBoundary(event: TransactionBoundaryEvent): Partial<RuntimeGovernorEvent> | null {
  const source: RuntimeGovernorEvent['source'] = event.boundary === 'api.chat' ? 'chat' : 'system';
  let state: RuntimeLifecycleState | null = null;
  if (event.boundary === 'api.chat' && event.state === 'started') state = 'received';
  else if (event.state === 'selected') state = 'planned';
  else if (event.state === 'attempting' || event.state === 'started') state = 'executing';
  else if (event.state === 'parsed' || event.state === 'compiled' || event.state === 'rendered' || event.state === 'interacted') state = 'validating';
  else if (event.boundary === 'api.chat' && event.state === 'succeeded') state = 'completed';
  else if (event.boundary === 'api.chat' && event.state === 'failed') state = 'failed';
  else if (event.state === 'failed') state = 'recovering';
  if (!state) return null;
  return {
    correlationId: event.correlationId, state, source, userSub: event.userSub,
    provider: event.upstreamProvider || event.gateway, modelId: event.modelId, route: event.route,
    terminal: state === 'completed' || state === 'failed', verified: state === 'completed',
    reason: event.detailCode || event.failureDomain || null, evidenceRef: event.correlationId,
  };
}

export async function observeTransactionBoundary(
  event: TransactionBoundaryEvent,
  sink: RuntimeGovernorSink = persistRuntimeGovernorEvent,
): Promise<void> {
  const mapped = governorEventFromBoundary(event);
  if (mapped) await observeRuntimeLifecycle(mapped, sink);
}
