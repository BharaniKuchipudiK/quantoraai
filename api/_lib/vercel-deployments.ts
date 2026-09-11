/**
 * Vercel deployment reads — the data a diagnosis needs, not yet a fix.
 *
 * THE GAP THIS CLOSES
 *
 * Quantora already held a `deploy:vercel` credential, but the only thing built
 * on it was web analytics (visitor counts). Nothing here could answer "why did
 * this deployment fail?" — the model had no way to see a build's state, its
 * error, or its log, so a question about a broken Vercel build was answered
 * from a guess about file names rather than a read of what actually happened.
 *
 * WHAT AUTHORIZES THIS
 *
 * The platform's own shared `VERCEL_ACCESS_TOKEN` (via `resolveCapabilityCredential`),
 * the same one `vercel-web-analytics.ts` already uses. This is a single
 * account's token, not a per-user OAuth connection like GitHub: it can only see
 * projects that account can see. Callers pass the project explicitly rather
 * than reading it from an env default, so this is not locked to Quantora's own
 * project the way the analytics config is.
 *
 * READ-ONLY, DELIBERATELY
 *
 * Nothing here redeploys, cancels, or changes a project's configuration. That
 * mirrors `github-agent-tools.ts`: a write is a different product decision,
 * with its own consent step, and lands separately.
 */
import { resolveCapabilityCredential } from "./credential-broker.js";

const API_BASE = "https://api.vercel.com";

export type FetchLike = typeof fetch;

export async function resolveVercelToken(): Promise<string | null> {
  return resolveCapabilityCredential("deploy:vercel");
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const built = search.toString();
  return built ? `?${built}` : "";
}

async function vercelRequest(
  path: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  } as any);
  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data };
}

function vercelErrorMessage(result: { status: number; data: any }, fallback: string): string {
  const message = typeof result.data?.error?.message === "string" ? result.data.error.message : "";
  return message ? `${message} (HTTP ${result.status})` : `${fallback} (HTTP ${result.status})`;
}

export type DeploymentSummary = {
  id: string;
  url: string;
  name: string;
  /** READY | ERROR | BUILDING | QUEUED | CANCELED | UNKNOWN — Vercel's own vocabulary, uppercased. */
  state: string;
  target: string | null;
  createdAt: string | null;
  inspectorUrl: string | null;
};

function normalizeDeploymentSummary(raw: any): DeploymentSummary {
  const created = raw?.createdAt ?? raw?.created;
  return {
    id: String(raw?.uid || raw?.id || ""),
    url: raw?.url ? `https://${String(raw.url).replace(/^https?:\/\//, "")}` : "",
    name: String(raw?.name || ""),
    state: String(raw?.state || raw?.readyState || "UNKNOWN").toUpperCase(),
    target: raw?.target ? String(raw.target) : null,
    createdAt: created ? new Date(Number(created) || created).toISOString() : null,
    inspectorUrl: raw?.inspectorUrl ? String(raw.inspectorUrl) : null,
  };
}

export async function listDeployments(input: {
  token: string;
  project: string;
  teamId?: string;
  target?: string;
  limit?: number;
  fetchImpl?: FetchLike;
}): Promise<DeploymentSummary[]> {
  const token = String(input.token || "").trim();
  if (!token) throw new Error("Vercel is not connected on this platform.");

  const project = String(input.project || "").trim();
  if (!project) throw new Error("A Vercel project name or ID is required.");

  const limit = Math.min(Math.max(Math.trunc(Number(input.limit) || 10), 1), 50);
  const path = `/v6/deployments${query({
    projectId: project,
    teamId: input.teamId,
    target: input.target,
    limit,
  })}`;

  const result = await vercelRequest(path, token, input.fetchImpl);
  if (!result.ok) throw new Error(vercelErrorMessage(result, "Vercel could not list deployments."));

  const deployments = Array.isArray(result.data?.deployments) ? result.data.deployments : [];
  return deployments.map(normalizeDeploymentSummary);
}

export type DeploymentDetail = DeploymentSummary & {
  errorMessage: string | null;
  errorCode: string | null;
  gitBranch: string | null;
  gitCommitSha: string | null;
};

export async function getDeployment(input: {
  token: string;
  deploymentId: string;
  teamId?: string;
  fetchImpl?: FetchLike;
}): Promise<DeploymentDetail> {
  const token = String(input.token || "").trim();
  if (!token) throw new Error("Vercel is not connected on this platform.");

  const deploymentId = String(input.deploymentId || "").trim();
  if (!deploymentId) throw new Error("A deployment ID is required.");

  const path = `/v13/deployments/${encodeURIComponent(deploymentId)}${query({ teamId: input.teamId })}`;
  const result = await vercelRequest(path, token, input.fetchImpl);
  if (!result.ok) throw new Error(vercelErrorMessage(result, "Vercel could not read this deployment."));

  const raw = result.data || {};
  return {
    ...normalizeDeploymentSummary(raw),
    errorMessage: raw?.errorMessage?.message
      ? String(raw.errorMessage.message)
      : (typeof raw?.errorMessage === "string" ? raw.errorMessage : null),
    errorCode: raw?.errorMessage?.code ? String(raw.errorMessage.code) : (raw?.errorCode ? String(raw.errorCode) : null),
    gitBranch: raw?.meta?.githubCommitRef || raw?.gitSource?.ref || null,
    gitCommitSha: raw?.meta?.githubCommitSha || raw?.gitSource?.sha || null,
  };
}

/*
 * Both caps exist because a build log can run to tens of thousands of lines,
 * and handing all of it to the model would burn its context on scaffolding
 * output instead of the failure. The line cap keeps recency; the char cap is
 * a second floor under it in case a handful of lines are each enormous
 * (a minified stack trace, for instance).
 */
const MAX_LOG_LINES = 400;
const MAX_LOG_CHARS = 20_000;

export type BuildLogResult = {
  lines: string[];
  truncated: boolean;
};

export async function getDeploymentBuildLog(input: {
  token: string;
  deploymentId: string;
  teamId?: string;
  onlyErrors?: boolean;
  fetchImpl?: FetchLike;
}): Promise<BuildLogResult> {
  const token = String(input.token || "").trim();
  if (!token) throw new Error("Vercel is not connected on this platform.");

  const deploymentId = String(input.deploymentId || "").trim();
  if (!deploymentId) throw new Error("A deployment ID is required.");

  const path = `/v3/deployments/${encodeURIComponent(deploymentId)}/events${query({
    teamId: input.teamId,
    builds: 1,
  })}`;
  const result = await vercelRequest(path, token, input.fetchImpl);
  if (!result.ok) throw new Error(vercelErrorMessage(result, "Vercel could not read the build log for this deployment."));

  const events: any[] = Array.isArray(result.data) ? result.data : [];
  let lines = events
    .map((event) => {
      const text = event?.payload?.text ?? event?.text;
      return typeof text === "string" ? text : "";
    })
    .filter((line) => line.trim().length > 0);

  // Filter for error-shaped lines BEFORE taking the tail, so "only errors"
  // means the last errors, not errors that happened to survive a generic tail.
  if (input.onlyErrors) {
    lines = lines.filter((line) => /error|fail(?:ed|ure)?|exception|cannot|unable|traceback/i.test(line));
  }

  const truncatedByCount = lines.length > MAX_LOG_LINES;
  lines = lines.slice(-MAX_LOG_LINES);

  let charTotal = 0;
  let truncatedByChars = false;
  const capped: string[] = [];
  for (const line of lines) {
    charTotal += line.length + 1;
    if (charTotal > MAX_LOG_CHARS) {
      truncatedByChars = true;
      break;
    }
    capped.push(line);
  }

  return { lines: capped, truncated: truncatedByCount || truncatedByChars };
}
