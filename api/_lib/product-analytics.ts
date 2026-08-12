import { isStoreConfigured } from "./store.js";

export type ProductGeoRow = { country_code: string; requests: number };
export type ProductGeoUsersRow = { country_code: string; active_users: number };

export type ProductModelRow = { model_id: string; requests: number };
export type ProductModeRow = { studio_mode: string; requests: number };
export type ProductDomainRow = { studio_domain: string; requests: number };
export type ProductChoiceEngagement = { choice_selections: number; total_requests: number };

export type ProductTrackingHealth = {
  configured: boolean;
  viewsReachable: boolean;
  hasUsage7d: boolean;
  hasModeBreakdown: boolean;
  hasDomainBreakdown: boolean;
  hasChoiceEngagement: boolean;
  hasGeoBreakdown: boolean;
};

export type ProductInsights = {
  models: ProductModelRow[];
  modes: ProductModeRow[];
  domains: ProductDomainRow[];
  geoRequests: ProductGeoRow[];
  geoUsers: ProductGeoUsersRow[];
  choiceEngagement: ProductChoiceEngagement | null;
  promptsPerActiveUser7d: number | null;
  tracking: ProductTrackingHealth;
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
    return { rows: Array.isArray(rows) ? rows as T[] : [], reachable: true };
  } catch {
    return { rows: [], reachable: false };
  }
}

function hasMeaningfulModeRows(rows: ProductModeRow[]) {
  return rows.some((row) => row.studio_mode && row.studio_mode !== "unknown" && Number(row.requests) > 0);
}

function hasMeaningfulDomainRows(rows: ProductDomainRow[]) {
  return rows.some((row) => row.studio_domain && row.studio_domain !== "general" && Number(row.requests) > 0);
}

function hasMeaningfulGeoRows(rows: ProductGeoRow[]) {
  return rows.some((row) => row.country_code && row.country_code !== "unknown" && Number(row.requests) > 0);
}

export async function getProductInsights(growth: {
  requests7d?: number;
  activeUsers7d?: number;
} | null): Promise<ProductInsights | null> {
  const configured = isStoreConfigured();
  if (!configured) return null;

  const [modelResult, modeResult, domainResult, choiceResult, geoReqResult, geoUserResult] = await Promise.all([
    fetchView<ProductModelRow>("product_model_usage_7d"),
    fetchView<ProductModeRow>("product_mode_usage_7d"),
    fetchView<ProductDomainRow>("product_domain_usage_7d"),
    fetchView<ProductChoiceEngagement>("product_choice_engagement_7d"),
    fetchView<ProductGeoRow>("product_geo_requests_7d"),
    fetchView<ProductGeoUsersRow>("product_geo_users_7d"),
  ]);

  const models = modelResult.rows;
  const modes = modeResult.rows;
  const domains = domainResult.rows;
  const geoRequests = geoReqResult.rows;
  const geoUsers = geoUserResult.rows;
  const choiceEngagement = choiceResult.rows[0] ?? null;
  const viewsReachable = modelResult.reachable && modeResult.reachable && domainResult.reachable
    && choiceResult.reachable && geoReqResult.reachable && geoUserResult.reachable;

  const requests7d = growth?.requests7d ?? 0;
  const activeUsers7d = growth?.activeUsers7d ?? 0;
  const promptsPerActiveUser7d = activeUsers7d > 0
    ? Math.round((requests7d / activeUsers7d) * 10) / 10
    : null;

  const tracking: ProductTrackingHealth = {
    configured: true,
    viewsReachable,
    hasUsage7d: requests7d > 0,
    hasModeBreakdown: hasMeaningfulModeRows(modes),
    hasDomainBreakdown: hasMeaningfulDomainRows(domains),
    hasChoiceEngagement: Number(choiceEngagement?.choice_selections || 0) > 0,
    hasGeoBreakdown: hasMeaningfulGeoRows(geoRequests),
  };

  return {
    models: models.slice(0, 10),
    modes,
    domains,
    geoRequests: geoRequests.slice(0, 12),
    geoUsers: geoUsers.slice(0, 12),
    choiceEngagement,
    promptsPerActiveUser7d,
    tracking,
  };
}
