import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { evaluateStudyProjectionSlo, STUDY_SLO_VERSION } from './study-slos.js';

export const STUDY_OBSERVABILITY_VERSION = 'study-observability-2026-09-02.3';

export type StudyReplaySource = 'checkpoint_delta' | 'full_replay';
export type StudyReplayFallbackReason =
  | 'checkpoint_miss'
  | 'checkpoint_unavailable'
  | 'delta_unavailable'
  | 'delta_overflow'
  | 'checkpoint_replay_rejected'
  | 'full_replay_unavailable';

export type StudyTelemetryOperation =
  | 'adaptive_learner_model'
  | 'learner_projection_load'
  | 'study_assessment';

type StudyTraceState = {
  traceId: string;
  dbCalls: number;
  startedAtMs: number;
};

const traceStorage = new AsyncLocalStorage<StudyTraceState>();

function nowMs(): number {
  return Date.now();
}

function boundedDuration(startedAtMs: number): number {
  return Math.max(0, Math.min(120_000, Math.round(nowMs() - startedAtMs)));
}

function safeErrorClass(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name.slice(0, 80) || 'Error';
  }
  return 'Error';
}

/**
 * Run one learner-facing Study operation under a server-owned correlation ID.
 * The correlation ID is random and never derived from learner/session/content data.
 */
export async function withStudyTelemetryScope<T>(
  operation: StudyTelemetryOperation,
  work: () => Promise<T>,
): Promise<T> {
  const existing = traceStorage.getStore();
  if (existing) return work();

  const state: StudyTraceState = {
    traceId: randomUUID(),
    dbCalls: 0,
    startedAtMs: nowMs(),
  };

  return traceStorage.run(state, async () => {
    try {
      const result = await work();
      emitStudyTelemetry({
        event: 'scope_complete',
        operation,
        status: 'success',
        durationMs: boundedDuration(state.startedAtMs),
        dbCalls: state.dbCalls,
      });
      return result;
    } catch (error: unknown) {
      emitStudyTelemetry({
        event: 'scope_complete',
        operation,
        status: 'error',
        errorClass: safeErrorClass(error),
        durationMs: boundedDuration(state.startedAtMs),
        dbCalls: state.dbCalls,
      });
      throw error;
    }
  });
}

/** Count one actual server-side Study Supabase request inside the current scope. */
export function noteStudyDbCall(): void {
  const state = traceStorage.getStore();
  if (state) state.dbCalls += 1;
}

export function currentStudyTraceId(): string | null {
  return traceStorage.getStore()?.traceId || null;
}

export function currentStudyDbCalls(): number {
  return traceStorage.getStore()?.dbCalls || 0;
}

type StudyTelemetryEvent =
  | {
      event: 'projection_load';
      operation: 'learner_projection_load';
      status: 'success' | 'unavailable';
      source?: StudyReplaySource;
      fallbackReason?: StudyReplayFallbackReason;
      durationMs: number;
      dbCalls: number;
    }
  | {
      event: 'scope_complete';
      operation: StudyTelemetryOperation;
      status: 'success' | 'error';
      errorClass?: string;
      durationMs: number;
      dbCalls: number;
    };

/**
 * Emit a deliberately narrow telemetry record. There is no arbitrary metadata
 * object here by design: learner IDs, prompts, paths, query strings, answer keys,
 * receipts, secrets and raw exception messages cannot be attached accidentally.
 */
export function emitStudyTelemetry(event: StudyTelemetryEvent): void {
  const traceId = currentStudyTraceId();
  const durationMs = Math.max(0, Math.min(120_000, Math.round(event.durationMs)));
  const dbCalls = Math.max(0, Math.min(10_000, Math.floor(event.dbCalls)));
  const sloStatus = event.event === 'projection_load' && event.status === 'success' && event.source
    ? evaluateStudyProjectionSlo({ source: event.source, durationMs, dbCalls })
    : undefined;
  console.info('Study telemetry', {
    version: STUDY_OBSERVABILITY_VERSION,
    sloVersion: STUDY_SLO_VERSION,
    traceId,
    event: event.event,
    operation: event.operation,
    status: event.status,
    ...(event.event === 'projection_load' && event.source ? { source: event.source } : {}),
    ...(event.event === 'projection_load' && event.fallbackReason ? { fallbackReason: event.fallbackReason } : {}),
    ...(sloStatus ? { sloStatus } : {}),
    ...(event.event === 'scope_complete' && event.errorClass ? { errorClass: event.errorClass.slice(0, 80) } : {}),
    durationMs,
    dbCalls,
  });
}

export function studyTelemetryStartedAt(): number {
  return nowMs();
}

export function studyTelemetryElapsedMs(startedAtMs: number): number {
  return boundedDuration(startedAtMs);
}
