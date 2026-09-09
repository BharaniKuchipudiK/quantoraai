import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { authenticateAdminRequest } from "../admin-auth.js";
import { getGrowthSummary, getDailySeries, getSuggestionAcceptance, isStoreConfigured, readRecentFailures, readRecentUsage, readTurnPlanEvents } from "../store.js";
import { summarizeWorkspaceUse } from "../workspace-analytics.js";

/** How far back the usage picture reaches. Stated with every number it produces. */
const USAGE_WINDOW_HOURS = 24;
import { FAILURE_WINDOW_HOURS, summarizeTurnFailures } from "../turn-failure-digest.js";
import { TURN_PLAN_WINDOW_HOURS, describeTurnPlans, summarizeTurnPlans, type LedgerSource } from "../turn-plan-ledger.js";
import { getProductInsights } from "../product-analytics.js";
import { getTechnicalInsights } from "../technical-analytics.js";
import { reportStudyRepresentationCoverage } from "../study-representation-coverage.js";
import { getGrowthTraffic } from "../vercel-web-analytics.js";

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

  const [growth, series, suggestionAcceptance, turnPlanRows, failureRead, usageRead] = await Promise.all([
    getGrowthSummary(),
    getDailySeries(14),
    getSuggestionAcceptance(),
    readTurnPlanEvents(new Date(Date.now() - TURN_PLAN_WINDOW_HOURS * 3_600_000).toISOString()),
    /*
     * What users actually hit, without waiting for a screenshot.
     *
     * Every failed turn was already recorded and only readable if you held its
     * reference id -- which people learn from a screenshot of it. Read-only,
     * additive, and on the shared admin entrypoint so it costs no new
     * serverless function.
     */
    readRecentFailures(new Date(Date.now() - FAILURE_WINDOW_HOURS * 3_600_000).toISOString()),
    /*
     * What the platform is being used FOR, and what it costs. The usage table
     * has carried model, provider, workspace mode and whether the platform's
     * key paid since migration 0001; this screen asked it nothing.
     */
    readRecentUsage(new Date(Date.now() - USAGE_WINDOW_HOURS * 3_600_000).toISOString()),
  ]);
  /*
   * FOUR STATES, BECAUSE THREE OF THEM LOOK LIKE ZERO.
   *
   * A reader returns null when the store did not answer and [] when it
   * answered with nothing. Told apart here so a query that timed out is never
   * reported as a quiet day -- the one misreading that turns a total outage
   * into the best numbers the platform has ever shown. Shared by both ledgers
   * on this screen so they cannot describe the same silence differently.
   */
  const sourceOf = (rows: unknown[] | null): LedgerSource => {
    if (!isStoreConfigured()) return 'not_configured';
    if (rows === null) return 'unavailable';
    return rows.length ? 'measured' : 'no-rows';
  };
  const failures = summarizeTurnFailures(failureRead?.rows ?? [], FAILURE_WINDOW_HOURS, failureRead?.truncated ?? false);
  const failureSource = sourceOf(failureRead ? failureRead.rows : null);
  const turnPlanSummary = summarizeTurnPlans(turnPlanRows ?? []);
  const turnPlanSource = sourceOf(turnPlanRows);
  const workspaceUse = summarizeWorkspaceUse(usageRead?.rows ?? [], USAGE_WINDOW_HOURS, { truncated: usageRead?.truncated ?? false });
  const usageSource = sourceOf(usageRead ? usageRead.rows : null);
  const [product, technical, growthTraffic] = await Promise.all([
    getProductInsights(growth),
    getTechnicalInsights(growth?.requests7d ?? 0),
    getGrowthTraffic(),
  ]);

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

    /* Seven-day production visitor and activation aggregates from the same
     * Vercel Web Analytics stream emitted by ProductTelemetry. */
    growthTraffic,

    technical: technical ?? null,

    /* PCL North-Star (Roadmap 9.1): per-surface 7-day proactive-suggestion
     * acceptance rate — the honest measure of whether the PCL adds value. */
    suggestionAcceptance: suggestionAcceptance ?? [],

    /* Phase 7, measured: what the turn planner did in the last 24 hours —
     * how often it decided, how often it agreed with the rules it replaced,
     * where it overruled them, and its latency. 'no-rows' says the table is
     * empty or missing; it is never reported as a perfect planner. */
    turnPlans: { ...turnPlanSummary, windowHours: TURN_PLAN_WINDOW_HOURS, source: turnPlanSource, line: describeTurnPlans(turnPlanSummary, turnPlanSource) },
    /*
     * `source` matters as much as the counts: "no failures recorded" and "the
     * store never answered" look identical as an empty list and mean opposite
     * things. An operator reading zero must be able to tell which.
     */
    turnFailures: { ...failures, source: failureSource },
    /*
     * Top models, use by workspace, and which accounts are spending the
     * platform's own key. Tokens, never dollars: OpenRouter exposes one
     * lifetime total for the whole key and Gemini exposes nothing, so a
     * per-model currency figure does not exist to be shown.
     */
    workspaceUse: { ...workspaceUse, source: usageSource },

    /*
     * Capability catalog, not live traffic. Operators can see which Study
     * renderer families exist and that unsupported requests stay unavailable,
     * without learner text or identity. Live representation_coverage events
     * remain privacy-safe log lines.
     */
    studyRepresentationCoverage: reportStudyRepresentationCoverage(),

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
