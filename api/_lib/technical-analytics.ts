import { isStoreConfigured } from "./store.js";

export type TechnicalKeyMix = {
  server_key_requests: number;
  byok_requests: number;
  total_requests: number;
  server_key_tokens_est: number;
};

export type TechnicalLatencySummary = {
  requests: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
};

export type TechnicalModelLatencyRow = {
  model_id: string;
  requests: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
};

export type ProductCompletionSummary = {
  previews_opened: number;
  publishes_completed: number;
  users_with_preview: number;
  users_with_publish: number;
};

export type RecentUsageRow = {
  id: number;
  model_id: string | null;
  latency_ms: number | null;
  tokens_est: number | null;
  used_server_key: boolean;
  studio_mode: string | null;
  provider: string | null;
  created_at: string;
};

export type RecentConversationInsightRow = {
  id: string;
  model_id: string | null;
  provider: string | null;
  studio_mode: string | null;
  latency_ms: number | null;
  used_server_key: boolean;
  conversation: {
    move?: string;
    reasonCode?: string;
    policyVersion?: string;
    routing?: {
      reason?: string;
      provider?: string;
      selectionSource?: string;
    };
    evaluation?: {
      verifierStatus?: string;
      qualitySignal?: string;
      score?: number;
    };
    responseContract?: {
      action?: string;
      tone?: string;
      depth?: string;
      safetyLevel?: string;
    };
  } | null;
  created_at: string;
};

export type TechnicalTrackingHealth = {
  configured: boolean;
  viewsReachable: boolean;
  hasUsage7d: boolean;
  hasCompletionEvents: boolean;
};

export type TechnicalInsights = {
  keyMix: TechnicalKeyMix | null;
  latencySummary: TechnicalLatencySummary | null;
  modelLatency: TechnicalModelLatencyRow[];
  completion: ProductCompletionSummary | null;
  recentRequests: RecentUsageRow[];
  recentConversationInsights: RecentConversationInsightRow[];
  tracking: TechnicalTrackingHealth;
};

async function fetchView<T>(viewName: string): Promise<{ rows: T[]; reachable: boolean }> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { rows: [], reachable: false };

  try {
    const response = await fetch(`${url}/rest/v1/${viewName}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { rows: [], reachable: false };
    const rows = await response.json();
    return { rows: Array.isArray(rows) ? (rows as T[]) : [], reachable: true };
  } catch {
    return { rows: [], reachable: false };
  }
}

async function fetchRecentUsage(): Promise<RecentUsageRow[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(
      `${url}/rest/v1/usage?select=id,model_id,latency_ms,tokens_est,used_server_key,studio_mode,provider,created_at&order=created_at.desc&limit=12`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? (rows as RecentUsageRow[]) : [];
  } catch {
    return [];
  }
}

async function fetchRecentConversationInsights(): Promise<RecentConversationInsightRow[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(
      `${url}/rest/v1/usage?select=id,model_id,provider,studio_mode,latency_ms,used_server_key,conversation,created_at&conversation=not.is.null&order=created_at.desc&limit=10`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? (rows as RecentConversationInsightRow[]) : [];
  } catch {
    return [];
  }
}

export async function getTechnicalInsights(windowRequests7d = 0): Promise<TechnicalInsights | null> {
  const configured = isStoreConfigured();
  if (!configured) return null;

  const [keyMixResult, latencyResult, modelResult, completionResult, recentRequests, recentConversationInsights] = await Promise.all([
    fetchView<TechnicalKeyMix>("technical_key_mix_7d"),
    fetchView<TechnicalLatencySummary>("technical_latency_summary_7d"),
    fetchView<TechnicalModelLatencyRow>("technical_model_latency_7d"),
    fetchView<ProductCompletionSummary>("product_completion_7d"),
    fetchRecentUsage(),
    fetchRecentConversationInsights(),
  ]);

  const viewsReachable = keyMixResult.reachable
    && latencyResult.reachable
    && modelResult.reachable
    && completionResult.reachable;

  const keyMix = keyMixResult.rows[0] ?? null;
  const latencySummary = latencyResult.rows[0] ?? null;
  const completion = completionResult.rows[0] ?? null;

  const tracking: TechnicalTrackingHealth = {
    configured: true,
    viewsReachable,
    hasUsage7d: windowRequests7d > 0 || Number(keyMix?.total_requests || 0) > 0,
    hasCompletionEvents: Number(completion?.previews_opened || 0) > 0
      || Number(completion?.publishes_completed || 0) > 0,
  };

  return {
    keyMix,
    latencySummary,
    modelLatency: modelResult.rows,
    completion,
    recentRequests,
    recentConversationInsights,
    tracking,
  };
}
