export type GovernorMetricSource = 'measured' | 'no-rows' | 'unavailable' | 'not_configured';

export type RuntimeGovernorMetricRow = {
  lifecycle_id?: string | null;
  lifecycle_state?: string | null;
  event_at?: string | null;
  source?: string | null;
  recovery_count?: number | null;
  terminal?: boolean | null;
  verified?: boolean | null;
  reason?: string | null;
};

export type RuntimeGovernorMetrics = {
  source: GovernorMetricSource;
  windowHours: number;
  eventCount: number | null;
  lifecycleCount: number | null;
  activeLifecycleCount: number | null;
  terminalCount: number | null;
  completedCount: number | null;
  failedCount: number | null;
  verifiedCompletedCount: number | null;
  recoveredLifecycleCount: number | null;
  stalledFailureCount: number | null;
  outcomeSatisfiedCount: number | null;
  outcomeFailedCount: number | null;
  outcomeIndeterminateCount: number | null;
  modelJudgeRequiredCount: number | null;
  verifiedCompletionRate: number | null;
  recoveryRate: number | null;
  bySource: Record<string, number>;
};

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}

function ratio(part: number, total: number): number | null {
  return total > 0 ? Number((part / total).toFixed(3)) : null;
}

export function summarizeRuntimeGovernorMetrics(
  rows: RuntimeGovernorMetricRow[],
  windowHours = 24,
): RuntimeGovernorMetrics {
  const lifecycleIds = new Set<string>();
  const terminalIds = new Set<string>();
  const completedIds = new Set<string>();
  const failedIds = new Set<string>();
  const verifiedCompletedIds = new Set<string>();
  const recoveredIds = new Set<string>();
  const stalledIds = new Set<string>();
  const outcomeSatisfiedIds = new Set<string>();
  const outcomeFailedIds = new Set<string>();
  const outcomeIndeterminateIds = new Set<string>();
  const modelJudgeIds = new Set<string>();
  const bySource: Record<string, number> = {};

  for (const row of rows) {
    const id = String(row.lifecycle_id || '').trim();
    if (!id) continue;
    lifecycleIds.add(id);
    const state = String(row.lifecycle_state || '');
    const reason = String(row.reason || '');
    const source = String(row.source || 'unknown') || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;

    if (state === 'recovering' || Number(row.recovery_count || 0) > 0) recoveredIds.add(id);
    if (row.terminal || state === 'completed' || state === 'failed') terminalIds.add(id);
    if (state === 'completed') completedIds.add(id);
    if (state === 'failed') failedIds.add(id);
    if (state === 'completed' && row.verified === true) verifiedCompletedIds.add(id);
    if (state === 'failed' && reason === 'stalled-without-terminal-outcome') stalledIds.add(id);
    if (reason.startsWith('outcome:satisfied')) outcomeSatisfiedIds.add(id);
    if (reason.startsWith('outcome:failed')) outcomeFailedIds.add(id);
    if (reason.startsWith('outcome:indeterminate')) outcomeIndeterminateIds.add(id);
    if (reason.includes('model-judge-required')) modelJudgeIds.add(id);
  }

  const lifecycleCount = lifecycleIds.size;
  return {
    source: rows.length ? 'measured' : 'no-rows',
    windowHours,
    eventCount: rows.length,
    lifecycleCount,
    activeLifecycleCount: Math.max(0, lifecycleCount - terminalIds.size),
    terminalCount: terminalIds.size,
    completedCount: completedIds.size,
    failedCount: failedIds.size,
    verifiedCompletedCount: verifiedCompletedIds.size,
    recoveredLifecycleCount: recoveredIds.size,
    stalledFailureCount: stalledIds.size,
    outcomeSatisfiedCount: outcomeSatisfiedIds.size,
    outcomeFailedCount: outcomeFailedIds.size,
    outcomeIndeterminateCount: outcomeIndeterminateIds.size,
    modelJudgeRequiredCount: modelJudgeIds.size,
    verifiedCompletionRate: ratio(verifiedCompletedIds.size, terminalIds.size),
    recoveryRate: ratio(recoveredIds.size, lifecycleCount),
    bySource,
  };
}

export async function getRuntimeGovernorMetrics(windowHours = 24): Promise<RuntimeGovernorMetrics> {
  const cfg = config();
  if (!cfg) {
    return {
      source: 'not_configured', windowHours, eventCount: null, lifecycleCount: null, activeLifecycleCount: null,
      terminalCount: null, completedCount: null, failedCount: null, verifiedCompletedCount: null,
      recoveredLifecycleCount: null, stalledFailureCount: null, outcomeSatisfiedCount: null, outcomeFailedCount: null,
      outcomeIndeterminateCount: null, modelJudgeRequiredCount: null, verifiedCompletionRate: null, recoveryRate: null, bySource: {},
    };
  }

  const since = new Date(Date.now() - Math.max(1, windowHours) * 3_600_000).toISOString();
  const params = new URLSearchParams({
    select: 'lifecycle_id,lifecycle_state,event_at,source,recovery_count,terminal,verified,reason',
    event_at: `gte.${since}`,
    order: 'event_at.asc',
    limit: '5000',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${cfg.url}/rest/v1/runtime_governor_events?${params}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`governor metrics read -> ${response.status}`);
    const rows = await response.json();
    return summarizeRuntimeGovernorMetrics(Array.isArray(rows) ? rows : [], windowHours);
  } catch {
    return {
      source: 'unavailable', windowHours, eventCount: null, lifecycleCount: null, activeLifecycleCount: null,
      terminalCount: null, completedCount: null, failedCount: null, verifiedCompletedCount: null,
      recoveredLifecycleCount: null, stalledFailureCount: null, outcomeSatisfiedCount: null, outcomeFailedCount: null,
      outcomeIndeterminateCount: null, modelJudgeRequiredCount: null, verifiedCompletionRate: null, recoveryRate: null, bySource: {},
    };
  } finally {
    clearTimeout(timer);
  }
}
