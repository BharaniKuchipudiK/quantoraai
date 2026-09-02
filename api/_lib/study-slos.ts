export const STUDY_SLO_VERSION = 'study-slo-2026-09-02.1';

export type StudyProjectionSloSource = 'checkpoint_delta' | 'full_replay';
export type StudySloStatus = 'within_budget' | 'latency_breach' | 'db_call_breach' | 'latency_and_db_breach';

export const STUDY_PROJECTION_SLO = {
  checkpoint_delta: {
    p95LatencyMs: 750,
    dbCallsPerProjection: 6,
  },
  full_replay: {
    p95LatencyMs: 2_000,
    dbCallsPerProjection: 12,
  },
} as const;

/**
 * Initial H3.4 production SLO targets. They are intentionally conservative and
 * must be revisited from privacy-safe production distributions rather than
 * silently loosened when a regression occurs.
 */
export function evaluateStudyProjectionSlo(input: {
  source: StudyProjectionSloSource;
  durationMs: number;
  dbCalls: number;
}): StudySloStatus {
  const budget = STUDY_PROJECTION_SLO[input.source];
  const latencyBreach = Number.isFinite(input.durationMs) && input.durationMs > budget.p95LatencyMs;
  const dbCallBreach = Number.isFinite(input.dbCalls) && input.dbCalls > budget.dbCallsPerProjection;
  if (latencyBreach && dbCallBreach) return 'latency_and_db_breach';
  if (latencyBreach) return 'latency_breach';
  if (dbCallBreach) return 'db_call_breach';
  return 'within_budget';
}
