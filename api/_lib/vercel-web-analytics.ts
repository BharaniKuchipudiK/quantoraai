import { resolveCapabilityCredential } from "./credential-broker.js";

const API_BASE = "https://api.vercel.com/v1/query/web-analytics";
const WINDOW_DAYS = 7;
const CACHE_MS = 60_000;

export type GrowthTrafficSource = "measured" | "no-rows" | "not_configured" | "unavailable";

export type GrowthTrafficSummary = {
  windowDays: number;
  totalVisitors: number;
  anonymousVisitors: number;
  signedInVisitors: number;
  returningVisitors: number;
  firstTimeVisitors: number;
  studioActivations: number;
  anonymousToSignedInConversion: number | null;
  signedInToStudioActivation: number | null;
  source: GrowthTrafficSource;
};

type AnalyticsRow = {
  timestamp?: string;
  eventData?: string;
  visitors?: number;
  count?: number;
};

type AnalyticsResponse = { data?: AnalyticsRow[] };

export type AnalyticsConfig = {
  token: string;
  projectId: string;
  teamId?: string;
};

let cache: { expiresAt: number; value: GrowthTrafficSummary } | null = null;

async function config(): Promise<AnalyticsConfig | null> {
  const token = await resolveCapabilityCredential("deploy:vercel");
  const projectId = (
    process.env.VERCEL_WEB_ANALYTICS_PROJECT_ID
    || process.env.VERCEL_PROJECT_ID
  )?.trim();
  const teamId = (
    process.env.VERCEL_WEB_ANALYTICS_TEAM_ID
    || process.env.VERCEL_ORG_ID
  )?.trim();

  if (!token || !projectId) return null;
  return { token, projectId, ...(teamId ? { teamId } : {}) };
}

function dayStamp(value: Date) {
  return value.toISOString().slice(0, 10);
}

function reportingWindow(now = Date.now()) {
  const until = new Date(now);
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  return { since: dayStamp(since), until: dayStamp(until) };
}

function percentage(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1_000) / 10;
}

function visitors(rows: AnalyticsRow[] | undefined) {
  return (rows || []).reduce((sum, row) => sum + Math.max(0, Number(row.visitors) || 0), 0);
}

function visitorsByEventData(rows: AnalyticsRow[] | undefined) {
  const result = new Map<string, number>();
  for (const row of rows || []) {
    const key = String(row.eventData || "");
    if (!key || key === "Others") continue;
    result.set(key, (result.get(key) || 0) + Math.max(0, Number(row.visitors) || 0));
  }
  return result;
}

export function summarizeGrowthTraffic({
  visits,
  authStates,
  visitTypes,
  studioActivations,
}: {
  visits: AnalyticsResponse;
  authStates: AnalyticsResponse;
  visitTypes: AnalyticsResponse;
  studioActivations: AnalyticsResponse;
}): GrowthTrafficSummary {
  const totalVisitors = visitors(visits.data);
  const auth = visitorsByEventData(authStates.data);
  const lifecycle = visitorsByEventData(visitTypes.data);
  const anonymousVisitors = auth.get("signed_out") || 0;
  const signedInVisitors = auth.get("signed_in") || 0;
  const firstTimeVisitors = lifecycle.get("first_seen") || 0;
  const returningVisitors = lifecycle.get("returning") || 0;
  const activationVisitors = visitors(studioActivations.data);
  const classifiedAuthVisitors = anonymousVisitors + signedInVisitors;
  const hasRows = totalVisitors > 0 || classifiedAuthVisitors > 0
    || firstTimeVisitors > 0 || returningVisitors > 0 || activationVisitors > 0;

  return {
    windowDays: WINDOW_DAYS,
    totalVisitors,
    anonymousVisitors,
    signedInVisitors,
    returningVisitors,
    firstTimeVisitors,
    studioActivations: activationVisitors,
    anonymousToSignedInConversion: percentage(signedInVisitors, classifiedAuthVisitors),
    signedInToStudioActivation: percentage(activationVisitors, signedInVisitors),
    source: hasRows ? "measured" : "no-rows",
  };
}

async function query(
  cfg: AnalyticsConfig,
  dataset: "visits" | "events",
  by: string,
  filter: string,
  now: number,
  fetchFn: typeof fetch,
): Promise<AnalyticsResponse | null> {
  const { since, until } = reportingWindow(now);
  const params = new URLSearchParams({
    projectId: cfg.projectId,
    since,
    until,
    by,
    filter,
    limit: "20",
  });
  if (cfg.teamId) params.set("teamId", cfg.teamId);

  try {
    const response = await fetchFn(`${API_BASE}/${dataset}/aggregate?${params}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && Array.isArray(payload.data) ? payload as AnalyticsResponse : null;
  } catch {
    return null;
  }
}

export async function fetchGrowthTraffic(
  cfg: AnalyticsConfig,
  now = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<GrowthTrafficSummary> {
  const production = "environment eq 'production'";
  const [visitsResult, authResult, lifecycleResult, activationResult] = await Promise.all([
    query(cfg, "visits", "day", production, now, fetchFn),
    query(cfg, "events", "eventData/auth_state", `eventName eq 'quantora_visit' and ${production}`, now, fetchFn),
    query(cfg, "events", "eventData/visit_type", `eventName eq 'quantora_visit' and ${production}`, now, fetchFn),
    query(cfg, "events", "day", `eventName eq 'quantora_first_workspace_open' and ${production}`, now, fetchFn),
  ]);

  if (!visitsResult || !authResult || !lifecycleResult || !activationResult) {
    return {
      windowDays: WINDOW_DAYS,
      totalVisitors: 0,
      anonymousVisitors: 0,
      signedInVisitors: 0,
      returningVisitors: 0,
      firstTimeVisitors: 0,
      studioActivations: 0,
      anonymousToSignedInConversion: null,
      signedInToStudioActivation: null,
      source: "unavailable",
    };
  }

  return summarizeGrowthTraffic({
    visits: visitsResult,
    authStates: authResult,
    visitTypes: lifecycleResult,
    studioActivations: activationResult,
  });
}

export async function getGrowthTraffic(now = Date.now()): Promise<GrowthTrafficSummary> {
  if (cache && cache.expiresAt > now) return cache.value;

  const cfg = await config();
  if (!cfg) {
    const value: GrowthTrafficSummary = {
      windowDays: WINDOW_DAYS,
      totalVisitors: 0,
      anonymousVisitors: 0,
      signedInVisitors: 0,
      returningVisitors: 0,
      firstTimeVisitors: 0,
      studioActivations: 0,
      anonymousToSignedInConversion: null,
      signedInToStudioActivation: null,
      source: "not_configured",
    };
    cache = { expiresAt: now + CACHE_MS, value };
    return value;
  }

  const value = await fetchGrowthTraffic(cfg, now);
  cache = { expiresAt: now + CACHE_MS, value };
  return value;
}
