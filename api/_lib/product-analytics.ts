import { isStoreConfigured } from "./store.js";

export type ProductModelRow = { model_id: string; requests: number };
export type ProductModeRow = { studio_mode: string; requests: number };
export type ProductDomainRow = { studio_domain: string; requests: number };
export type ProductChoiceEngagement = { choice_selections: number; total_requests: number };

export type ProductInsights = {
  models: ProductModelRow[];
  modes: ProductModeRow[];
  domains: ProductDomainRow[];
  choiceEngagement: ProductChoiceEngagement | null;
  promptsPerActiveUser7d: number | null;
};

async function fetchView<T>(viewName: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(`${url}/rest/v1/${viewName}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows as T[] : [];
  } catch {
    return [];
  }
}

export async function getProductInsights(growth: {
  requests7d?: number;
  activeUsers7d?: number;
} | null): Promise<ProductInsights | null> {
  if (!isStoreConfigured()) return null;

  const [models, modes, domains, choiceRows] = await Promise.all([
    fetchView<ProductModelRow>("product_model_usage_7d"),
    fetchView<ProductModeRow>("product_mode_usage_7d"),
    fetchView<ProductDomainRow>("product_domain_usage_7d"),
    fetchView<ProductChoiceEngagement>("product_choice_engagement_7d"),
  ]);

  const requests7d = growth?.requests7d ?? 0;
  const activeUsers7d = growth?.activeUsers7d ?? 0;
  const promptsPerActiveUser7d = activeUsers7d > 0
    ? Math.round((requests7d / activeUsers7d) * 10) / 10
    : null;

  return {
    models: models.slice(0, 10),
    modes,
    domains,
    choiceEngagement: choiceRows[0] ?? null,
    promptsPerActiveUser7d,
  };
}
