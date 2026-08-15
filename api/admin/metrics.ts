import { applyCors, clientIp, isRateLimited } from "../_lib/rate-limit.js";
import { authenticateAdminRequest } from "../_lib/admin-auth.js";
import { getGrowthSummary, getDailySeries, isStoreConfigured } from "../_lib/store.js";
import { getProductInsights } from "../_lib/product-analytics.js";
import { getTechnicalInsights } from "../_lib/technical-analytics.js";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate-limited ahead of the auth check so credential guessing is throttled
  // too. Set well above the dashboard's own 2s poll interval (30/min) so
  // normal viewing is never affected.
  if (isRateLimited(`admin-metrics:${clientIp(req)}`, 90, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const authFailure = await authenticateAdminRequest(req);
  if (authFailure) {
    return res.status(authFailure.status).json({ error: authFailure.error });
  }

  const [growth, series] = await Promise.all([getGrowthSummary(), getDailySeries(14)]);
  const product = await getProductInsights(growth);
  const technical = await getTechnicalInsights(growth?.requests7d ?? 0);

  const usageDays = series?.usage ?? [];
  const measured = {
    requests: usageDays.reduce((a, d) => a + Number(d.requests || 0), 0),
    billableRequests: usageDays.reduce((a, d) => a + Number(d.billable_requests || 0), 0),
    tokens: usageDays.reduce((a, d) => a + Number(d.tokens_est || 0), 0),
  };

  // Latency weighted by request volume — a straight mean of daily averages
  // would let a quiet day with two slow calls outweigh a busy one.
  const weightedLatency = usageDays.reduce((a, d) => a + Number(d.avg_latency_ms || 0) * Number(d.requests || 0), 0);
  const avgLatencyMs = measured.requests ? Math.round(weightedLatency / measured.requests) : null;

  return res.status(200).json({
    /* 'measured' | 'unavailable' | 'not_configured' — say which, always. */
    source: growth ? 'measured' : (isStoreConfigured() ? 'unavailable' : 'not_configured'),

    growth: growth ?? null,

    window: {
      days: 14,
      requests: series ? measured.requests : null,
      billableRequests: series ? measured.billableRequests : null,
      tokensEstimated: series ? measured.tokens : null,
      avgLatencyMs,
    },

    daily: series ? { growth: series.growth, usage: series.usage } : null,

    product: product ?? null,

    technical: technical ?? null,

    /*
     * Deliberately absent rather than fabricated: uptime, CPU, memory and
     * cache hit ratio are not instrumented. A dashboard that invents them
     * teaches its reader to distrust the numbers that are real.
     */
    notMeasured: ['systemUptime', 'cpuUsage', 'memoryUsage', 'cacheHitRatio'],

    timestamp: Date.now(),
    isLiveConnected: isStoreConfigured()
  });
}
