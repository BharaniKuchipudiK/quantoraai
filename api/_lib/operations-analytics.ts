import { resolveCapabilityCredential } from './credential-broker.js';

export type OperationsSource = 'measured' | 'partial' | 'no-rows' | 'unavailable' | 'not_configured';

export type ConsumptionSummary = {
  requests: number;
  exact_requests: number;
  estimated_requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  provider_reported_cost_usd: number;
  quantora_funded_cost_usd: number;
};

export type ModelConsumptionRow = {
  provider: string;
  model_id: string;
  requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  provider_reported_cost_usd: number;
};

export type ModelQualityRow = {
  model_id: string;
  task_category: string;
  successful_responses: number;
  failed_responses: number;
  helpful_votes: number;
  not_helpful_votes: number;
  fallback_rescues: number;
  avg_latency_ms: number;
  last_event_at: string | null;
};

export type ModelReliabilityRow = {
  modelId: string;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number | null;
  fallbackRescues: number;
  avgLatencyMs: number | null;
  lastEventAt: string | null;
};

export type ProviderCircuitRow = {
  circuit_key: string;
  failures: number;
  opened_until: string | null;
  last_failure_at: string | null;
  last_success_at: string | null;
  updated_at: string | null;
};

export type CircuitHealthRow = ProviderCircuitRow & {
  status: 'open' | 'impaired' | 'healthy';
};

export type OpenRouterOperations = {
  source: OperationsSource;
  usage: {
    total: number | null;
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
    limit: number | null;
    limitRemaining: number | null;
    isFreeTier: boolean | null;
  };
  credits: {
    totalCredits: number | null;
    totalUsage: number | null;
    remaining: number | null;
  };
  checkedAt: number;
};

export type VercelDeploymentRow = {
  id: string;
  state: string;
  createdAt: number | null;
  url: string | null;
  commitSha: string | null;
  commitMessage: string | null;
};

export type VercelOperations = {
  source: OperationsSource;
  environment: string | null;
  region: string | null;
  deploymentId: string | null;
  projectId: string | null;
  productionUrl: string | null;
  commitSha: string | null;
  current: VercelDeploymentRow | null;
  recent: VercelDeploymentRow[];
  finishedDeployments: number;
  readyDeployments: number;
  failedDeployments: number;
  successRate: number | null;
  checkedAt: number;
};

export type OperationsInsights = {
  source: OperationsSource;
  consumption: ConsumptionSummary | null;
  modelConsumption: ModelConsumptionRow[];
  costAttributionCoveragePct: number | null;
  reliability: {
    attempts: number;
    successes: number;
    failures: number;
    successRate: number | null;
    fallbackRescues: number;
  };
  models: ModelReliabilityRow[];
  circuits: {
    source: OperationsSource;
    open: number;
    impaired: number;
    healthy: number;
    rows: CircuitHealthRow[];
  };
  openRouter: OpenRouterOperations;
  vercel: VercelOperations;
};

type CachedValue<T> = { expiresAt: number; promise: Promise<T> };
const externalCache = new Map<string, CachedValue<unknown>>();
const EXTERNAL_CACHE_MS = 60_000;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

async function cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = externalCache.get(key) as CachedValue<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.promise;
  const promise = producer();
  externalCache.set(key, { expiresAt: now + EXTERNAL_CACHE_MS, promise });
  try {
    return await promise;
  } catch (error) {
    externalCache.delete(key);
    throw error;
  }
}

async function fetchSupabase<T>(path: string): Promise<{ rows: T[]; reachable: boolean }> {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { rows: [], reachable: false };
  try {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { rows: [], reachable: false };
    const payload = await response.json();
    return { rows: Array.isArray(payload) ? payload as T[] : [], reachable: true };
  } catch {
    return { rows: [], reachable: false };
  }
}

export function summarizeModelQuality(rows: ModelQualityRow[]) {
  const grouped = new Map<string, {
    successes: number;
    failures: number;
    fallbackRescues: number;
    latencyWeighted: number;
    latencySamples: number;
    lastEventAt: string | null;
  }>();

  for (const row of rows) {
    const modelId = String(row.model_id || '').trim();
    if (!modelId || modelId === 'auto') continue;
    const existing = grouped.get(modelId) || {
      successes: 0,
      failures: 0,
      fallbackRescues: 0,
      latencyWeighted: 0,
      latencySamples: 0,
      lastEventAt: null,
    };
    const successes = Number(row.successful_responses) || 0;
    const failures = Number(row.failed_responses) || 0;
    const latency = Number(row.avg_latency_ms) || 0;
    existing.successes += successes;
    existing.failures += failures;
    existing.fallbackRescues += Number(row.fallback_rescues) || 0;
    if (latency > 0 && successes > 0) {
      existing.latencyWeighted += latency * successes;
      existing.latencySamples += successes;
    }
    if (row.last_event_at && (!existing.lastEventAt || row.last_event_at > existing.lastEventAt)) {
      existing.lastEventAt = row.last_event_at;
    }
    grouped.set(modelId, existing);
  }

  const models: ModelReliabilityRow[] = Array.from(grouped.entries()).map(([modelId, row]) => {
    const attempts = row.successes + row.failures;
    return {
      modelId,
      attempts,
      successes: row.successes,
      failures: row.failures,
      successRate: percent(row.successes, attempts),
      fallbackRescues: row.fallbackRescues,
      avgLatencyMs: row.latencySamples ? Math.round(row.latencyWeighted / row.latencySamples) : null,
      lastEventAt: row.lastEventAt,
    };
  }).sort((a, b) => b.attempts - a.attempts || a.modelId.localeCompare(b.modelId));

  const successes = models.reduce((sum, row) => sum + row.successes, 0);
  const failures = models.reduce((sum, row) => sum + row.failures, 0);
  const attempts = successes + failures;
  const fallbackRescues = models.reduce((sum, row) => sum + row.fallbackRescues, 0);

  return {
    attempts,
    successes,
    failures,
    successRate: percent(successes, attempts),
    fallbackRescues,
    models,
  };
}

export function summarizeCircuits(rows: ProviderCircuitRow[], nowMs = Date.now()) {
  const inferenceRows = rows.filter((row) => String(row.circuit_key || '').startsWith('inference:'));
  const enriched: CircuitHealthRow[] = inferenceRows.map((row) => {
    const openedUntil = row.opened_until ? Date.parse(row.opened_until) : Number.NaN;
    const lastFailure = row.last_failure_at ? Date.parse(row.last_failure_at) : Number.NaN;
    const lastSuccess = row.last_success_at ? Date.parse(row.last_success_at) : Number.NaN;
    let status: CircuitHealthRow['status'] = 'healthy';
    if (Number.isFinite(openedUntil) && openedUntil > nowMs) status = 'open';
    else if ((Number(row.failures) || 0) > 0 && (!Number.isFinite(lastSuccess) || (Number.isFinite(lastFailure) && lastFailure > lastSuccess))) status = 'impaired';
    return { ...row, status };
  }).sort((a, b) => {
    const rank = { open: 0, impaired: 1, healthy: 2 } as const;
    return rank[a.status] - rank[b.status] || (Number(b.failures) || 0) - (Number(a.failures) || 0);
  });

  return {
    open: enriched.filter((row) => row.status === 'open').length,
    impaired: enriched.filter((row) => row.status === 'impaired').length,
    healthy: enriched.filter((row) => row.status === 'healthy').length,
    rows: enriched,
  };
}

function normalizeOpenRouterKey(payload: any) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  return {
    total: numberOrNull(data.usage),
    daily: numberOrNull(data.usage_daily),
    weekly: numberOrNull(data.usage_weekly),
    monthly: numberOrNull(data.usage_monthly),
    limit: numberOrNull(data.limit),
    limitRemaining: numberOrNull(data.limit_remaining),
    isFreeTier: typeof data.is_free_tier === 'boolean' ? data.is_free_tier : null,
  };
}

function normalizeOpenRouterCredits(payload: any) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const totalCredits = numberOrNull(data.total_credits ?? data.totalCredits);
  const totalUsage = numberOrNull(data.total_usage ?? data.totalUsage);
  const remaining = totalCredits != null && totalUsage != null ? Math.max(0, totalCredits - totalUsage) : null;
  return { totalCredits, totalUsage, remaining };
}

async function fetchOpenRouterOperations(): Promise<OpenRouterOperations> {
  const checkedAt = Date.now();
  const credential = await resolveCapabilityCredential('model:openrouter');
  if (!credential) {
    return {
      source: 'not_configured',
      usage: { total: null, daily: null, weekly: null, monthly: null, limit: null, limitRemaining: null, isFreeTier: null },
      credits: { totalCredits: null, totalUsage: null, remaining: null },
      checkedAt,
    };
  }

  const headers = { Authorization: `Bearer ${credential}` };
  const read = async (url: string) => {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(4_000) });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };

  const [keyPayload, creditPayload] = await Promise.all([
    read('https://openrouter.ai/api/v1/key'),
    read('https://openrouter.ai/api/v1/credits'),
  ]);

  const usage = normalizeOpenRouterKey(keyPayload);
  const credits = normalizeOpenRouterCredits(creditPayload);
  const anyKeyMetric = Object.values(usage).some((value) => value !== null);
  const anyCreditMetric = Object.values(credits).some((value) => value !== null);
  return {
    source: keyPayload && creditPayload ? 'measured' : (anyKeyMetric || anyCreditMetric ? 'partial' : 'unavailable'),
    usage,
    credits,
    checkedAt,
  };
}

export function summarizeVercelDeployments(rows: any[]): Pick<VercelOperations, 'current' | 'recent' | 'finishedDeployments' | 'readyDeployments' | 'failedDeployments' | 'successRate'> {
  const deployments: VercelDeploymentRow[] = rows.map((row) => ({
    id: String(row.uid || row.id || ''),
    state: String(row.state || row.readyState || 'UNKNOWN').toUpperCase(),
    createdAt: numberOrNull(row.created ?? row.createdAt),
    url: row.url ? String(row.url) : null,
    commitSha: row.meta?.githubCommitSha ? String(row.meta.githubCommitSha) : null,
    commitMessage: row.meta?.githubCommitMessage ? String(row.meta.githubCommitMessage) : null,
  })).filter((row) => row.id);
  const terminal = new Set(['READY', 'ERROR', 'CANCELED', 'BLOCKED']);
  const finished = deployments.filter((row) => terminal.has(row.state));
  const ready = finished.filter((row) => row.state === 'READY');
  const failed = finished.filter((row) => row.state !== 'READY');
  return {
    current: deployments[0] ?? null,
    recent: deployments.slice(0, 6),
    finishedDeployments: finished.length,
    readyDeployments: ready.length,
    failedDeployments: failed.length,
    successRate: percent(ready.length, finished.length),
  };
}

async function fetchVercelOperations(): Promise<VercelOperations> {
  const checkedAt = Date.now();
  const environment = process.env.VERCEL_ENV || null;
  const region = process.env.VERCEL_REGION || null;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || null;
  const projectId = process.env.VERCEL_PROJECT_ID || null;
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || null;
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const base = {
    environment,
    region,
    deploymentId,
    projectId,
    productionUrl,
    commitSha,
    checkedAt,
  };

  const credential = await resolveCapabilityCredential('deploy:vercel');
  if (!credential || !projectId) {
    return {
      source: environment || deploymentId || commitSha ? 'partial' : 'not_configured',
      ...base,
      current: null,
      recent: [],
      finishedDeployments: 0,
      readyDeployments: 0,
      failedDeployments: 0,
      successRate: null,
    };
  }

  try {
    const url = new URL('https://api.vercel.com/v6/deployments');
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('target', 'production');
    url.searchParams.set('limit', '20');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`vercel_${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.deployments) ? payload.deployments : [];
    return { source: rows.length ? 'measured' : 'no-rows', ...base, ...summarizeVercelDeployments(rows) };
  } catch {
    return {
      source: 'partial',
      ...base,
      current: null,
      recent: [],
      finishedDeployments: 0,
      readyDeployments: 0,
      failedDeployments: 0,
      successRate: null,
    };
  }
}

export async function getOperationsInsights(): Promise<OperationsInsights> {
  const [consumptionResult, modelConsumptionResult, modelQualityResult, circuitResult, openRouter, vercel] = await Promise.all([
    fetchSupabase<ConsumptionSummary>('usage_consumption_7d?select=*'),
    fetchSupabase<ModelConsumptionRow>('usage_model_consumption_7d?select=*&order=provider_reported_cost_usd.desc,total_tokens.desc&limit=12'),
    fetchSupabase<ModelQualityRow>('model_quality_recent_summary?select=*'),
    fetchSupabase<ProviderCircuitRow>('provider_circuits?select=circuit_key,failures,opened_until,last_failure_at,last_success_at,updated_at&order=updated_at.desc&limit=100'),
    cached('openrouter-operations', fetchOpenRouterOperations),
    cached('vercel-operations', fetchVercelOperations),
  ]);

  const reliability = summarizeModelQuality(modelQualityResult.rows);
  const circuitSummary = summarizeCircuits(circuitResult.rows);
  const consumption = consumptionResult.rows[0] ?? null;
  const requestCount = Number(consumption?.requests || 0);
  const exactCount = Number(consumption?.exact_requests || 0);
  const supabaseReachable = consumptionResult.reachable && modelConsumptionResult.reachable && modelQualityResult.reachable && circuitResult.reachable;

  return {
    source: supabaseReachable ? 'measured' : 'partial',
    consumption,
    modelConsumption: modelConsumptionResult.rows,
    costAttributionCoveragePct: requestCount > 0 ? percent(exactCount, requestCount) : null,
    reliability: {
      attempts: reliability.attempts,
      successes: reliability.successes,
      failures: reliability.failures,
      successRate: reliability.successRate,
      fallbackRescues: reliability.fallbackRescues,
    },
    models: reliability.models,
    circuits: {
      source: circuitResult.reachable ? (circuitSummary.rows.length ? 'measured' : 'no-rows') : 'unavailable',
      open: circuitSummary.open,
      impaired: circuitSummary.impaired,
      healthy: circuitSummary.healthy,
      rows: circuitSummary.rows,
    },
    openRouter,
    vercel,
  };
}
