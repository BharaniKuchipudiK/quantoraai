import { applyCors, clientIp, isRateLimited } from "../_lib/rate-limit.js";
import { authenticateAdminRequest } from "../_lib/admin-auth.js";
import { getGrowthSummary, getDailySeries, isStoreConfigured } from "../_lib/store.js";

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Base fallback synthetic data
  let totalRequests = 0;
  let tokensGenerated = 0;
  let avgLatency = 0;
  let activeSessions = [];

  if (supabaseUrl && supabaseKey) {
    try {
      // Fetch exact count of requests
      const countRes = await fetch(`${supabaseUrl}/rest/v1/telemetry?select=id`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'count=exact'
        }
      });
      
      const countHeader = countRes.headers.get('content-range');
      const dbCount = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
      
      // Fetch latest 50 requests for aggregation
      const dataRes = await fetch(`${supabaseUrl}/rest/v1/telemetry?select=*&order=created_at.desc&limit=50`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      const latestData = await dataRes.json();

      if (Array.isArray(latestData) && latestData.length > 0) {
        totalRequests = dbCount;
        
        // Sum up tokens from db
        const recentTokens = latestData.reduce((acc, row) => acc + (row.tokens_generated || 0), 0);
        tokensGenerated = recentTokens; // We can only accurately sum the fetched rows. An estimate for all rows could be dbCount * 150, but we want real numbers. Let's just sum recent for now or rely on a DB aggregation.
        // For genuine numbers without a view, we'll just sum the 50 we fetched. This is a compromise without a heavy DB query.
        
        // Avg latency of last 50 requests
        avgLatency = Math.floor(latestData.reduce((acc, row) => acc + (row.latency_ms || 0), 0) / latestData.length);
        
        // Map to active sessions (real data only)
        activeSessions = latestData.slice(0, 10).map((row) => ({
          id: `req_${row.id}`,
          model: row.model_id || 'Unknown',
          duration: 'complete',
          tokens: row.tokens_generated || 0,
          latency: row.latency_ms || 0
        }));
      }
    } catch (e) {
      console.error("Supabase telemetry fetch failed:", e);
    }
  }

  /*
   * Everything below is measured or absent. Nothing is invented.
   *
   * Two things were still being reported dishonestly here. systemUptime was the
   * literal string '99.99%' — never measured, and exactly the sort of number an
   * operator would quote to someone. And tokensGenerated summed only the fifty
   * most recent rows while being displayed as a lifetime total, so it silently
   * stopped growing once the table passed fifty entries.
   *
   * Aggregates now come from the daily views, computed in Postgres over the
   * whole window rather than over whatever happened to be fetched.
   */
  const [growth, series] = await Promise.all([getGrowthSummary(), getDailySeries(14)]);

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

    /* Legacy telemetry table, kept while it still holds history. */
    legacyTelemetry: { totalRequests, avgLatency, tokensGenerated, activeSessions },

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
