/**
 * Where a user's sealed GitHub token lives.
 *
 * DELIBERATE DEPARTURE FROM store.ts's FAIL-SOFT RULE
 *
 * `api/_lib/store.ts` fails soft on purpose: losing an analytics row must never
 * cost somebody their login. This module fails CLOSED. A read that cannot reach
 * the database returns null, which means "no principal", which means every
 * GitHub action refuses. That is the safe direction — a database outage
 * degrades Quantora to read-only on GitHub, it does not degrade it to
 * unauthorized.
 *
 * Nothing here ever returns a sealed token to a caller that did not ask for the
 * principal, and no response shape in this repo carries the token outward.
 */

import { openGithubToken, resolveGithubSealSecret, sealGithubToken, type GithubPrincipal } from "./github-principal.js";

const REST_TIMEOUT_MS = 4_000;

export type GithubConnectionSummary = {
  connected: boolean;
  login: string;
  scopes: string[];
  connectedAt: string | null;
  /** Whether this user has opted in to Quantora pushing fixes / opening PRs on its own. */
  autoPrEnabled: boolean;
  /** Why a connection is unusable, when it is. Never a token, never a secret. */
  reason?: string;
};

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isGithubConnectionStoreConfigured(): boolean {
  return config() !== null && resolveGithubSealSecret() !== null;
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Supabase ${init.method || "GET"} ${path} -> ${response.status}`);
      return null;
    }
    return response;
  } catch (err: any) {
    console.warn(`Supabase ${init.method || "GET"} ${path} failed:`, err?.message || err);
    return null;
  }
}

export async function saveGithubConnection(input: {
  userSub: string;
  login: string;
  token: string;
  scopes: string[];
}): Promise<boolean> {
  const secret = resolveGithubSealSecret();
  if (!secret) return false;
  const now = new Date().toISOString();
  const response = await request("github_connections?on_conflict=user_sub", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_sub: input.userSub,
      github_login: input.login,
      sealed_token: sealGithubToken(input.token, secret),
      scopes: input.scopes,
      connected_at: now,
      updated_at: now,
    }]),
  });
  return Boolean(response);
}

export async function deleteGithubConnection(userSub: string): Promise<boolean> {
  const response = await request(`github_connections?user_sub=eq.${encodeURIComponent(userSub)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  return Boolean(response);
}

/**
 * Read the load-bearing connection fields first. Optional feature columns must
 * never make a valid GitHub token disappear from the UI merely because a DB
 * migration is rolling out behind the application deployment.
 */
async function readCoreRow(userSub: string): Promise<any | null> {
  if (!userSub) return null;
  const response = await request(
    `github_connections?user_sub=eq.${encodeURIComponent(userSub)}&select=github_login,sealed_token,scopes,connected_at&limit=1`,
    { method: "GET" },
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Enrich the core row with optional flags when their migration is present.
 * If the optional select fails (for example while production is one migration
 * behind), the connection remains usable and the feature safely defaults off.
 */
async function readRow(userSub: string): Promise<any | null> {
  const row = await readCoreRow(userSub);
  if (!row) return null;

  const optional = await request(
    `github_connections?user_sub=eq.${encodeURIComponent(userSub)}&select=auto_pr_enabled&limit=1`,
    { method: "GET" },
  );
  if (!optional) return { ...row, auto_pr_enabled: false };

  try {
    const rows = await optional.json();
    const featureRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    return { ...row, auto_pr_enabled: Boolean(featureRow?.auto_pr_enabled) };
  } catch {
    return { ...row, auto_pr_enabled: false };
  }
}

/**
 * Whether this user has opted in to autonomous GitHub writes. Read
 * independently of the principal so the tool-enablement check does not have
 * to decrypt a token just to answer "is the switch on".
 *
 * Fails closed: no row, no readable store, no opt-in — all read as false.
 */
export async function readGithubAutoPrEnabled(userSub: string): Promise<boolean> {
  const row = await readRow(userSub);
  return Boolean(row?.auto_pr_enabled);
}

/**
 * Set the opt-in flag. Requires a connection to already exist — turning this
 * on with no GitHub connected has nothing to attach it to.
 */
export async function setGithubAutoPrEnabled(userSub: string, enabled: boolean): Promise<boolean> {
  const response = await request(`github_connections?user_sub=eq.${encodeURIComponent(userSub)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ auto_pr_enabled: Boolean(enabled), updated_at: new Date().toISOString() }),
  });
  return Boolean(response);
}

/** The principal for this user, or null. Null always means "refuse". */
export async function readGithubPrincipal(userSub: string): Promise<GithubPrincipal | null> {
  const secret = resolveGithubSealSecret();
  if (!secret) return null;
  const row = await readRow(userSub);
  if (!row?.sealed_token) return null;
  const token = openGithubToken(String(row.sealed_token), secret);
  if (!token) return null;
  return {
    userSub,
    login: String(row.github_login || ""),
    token,
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    connectedAt: String(row.connected_at || ""),
  };
}

/** Connection state for the UI. Deliberately cannot leak the token. */
export async function readGithubConnectionSummary(userSub: string): Promise<GithubConnectionSummary> {
  if (!config()) {
    return { connected: false, login: "", scopes: [], connectedAt: null, autoPrEnabled: false, reason: "GitHub connections are not configured on this deployment (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." };
  }
  if (!resolveGithubSealSecret()) {
    return { connected: false, login: "", scopes: [], connectedAt: null, autoPrEnabled: false, reason: "GitHub connections are not configured on this deployment (GITHUB_CONNECTION_SECRET must be at least 32 characters)." };
  }
  const row = await readRow(userSub);
  if (!row?.sealed_token) {
    return { connected: false, login: "", scopes: [], connectedAt: null, autoPrEnabled: false };
  }
  const secret = resolveGithubSealSecret();
  const usable = secret ? openGithubToken(String(row.sealed_token), secret) : null;
  if (!usable) {
    return {
      connected: false,
      login: String(row.github_login || ""),
      scopes: [],
      connectedAt: row.connected_at ? String(row.connected_at) : null,
      autoPrEnabled: false,
      reason: "The stored GitHub authorization could not be opened with this deployment's key. Reconnect your GitHub account.",
    };
  }
  return {
    connected: true,
    login: String(row.github_login || ""),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    autoPrEnabled: Boolean(row.auto_pr_enabled),
  };
}
