/**
 * Where a user's sealed GitHub token lives.
 *
 * Connection reads fail closed for actions, while optional rollout columns are
 * read separately so a schema migration can never make a valid GitHub
 * connection disappear from the product.
 */

import { openGithubToken, resolveGithubSealSecret, sealGithubToken, type GithubPrincipal } from "./github-principal.js";

const REST_TIMEOUT_MS = 4_000;

export type GithubConnectionSummary = {
  connected: boolean;
  login: string;
  scopes: string[];
  connectedAt: string | null;
  /** User consent for unattended push + pull-request creation only. */
  autoPrEnabled: boolean;
  /** Separate higher-privilege consent for evidence-gated merge/deploy delivery. */
  autoDeliverEnabled: boolean;
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
 * Read optional consent columns independently from the load-bearing connection.
 * If production is one migration behind, both privileges default OFF while the
 * GitHub connection remains usable for reads.
 */
async function readRow(userSub: string): Promise<any | null> {
  const row = await readCoreRow(userSub);
  if (!row) return null;

  const optional = await request(
    `github_connections?user_sub=eq.${encodeURIComponent(userSub)}&select=auto_pr_enabled,auto_deliver_enabled&limit=1`,
    { method: "GET" },
  );
  if (!optional) return { ...row, auto_pr_enabled: false, auto_deliver_enabled: false };

  try {
    const rows = await optional.json();
    const featureRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    return {
      ...row,
      auto_pr_enabled: Boolean(featureRow?.auto_pr_enabled),
      auto_deliver_enabled: Boolean(featureRow?.auto_deliver_enabled),
    };
  } catch {
    return { ...row, auto_pr_enabled: false, auto_deliver_enabled: false };
  }
}

export async function readGithubAutoPrEnabled(userSub: string): Promise<boolean> {
  const row = await readRow(userSub);
  return Boolean(row?.auto_pr_enabled);
}

export async function setGithubAutoPrEnabled(userSub: string, enabled: boolean): Promise<boolean> {
  const response = await request(`github_connections?user_sub=eq.${encodeURIComponent(userSub)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ auto_pr_enabled: Boolean(enabled), updated_at: new Date().toISOString() }),
  });
  return Boolean(response);
}

/**
 * Higher-privilege delivery consent is deliberately independent of Auto PR.
 * A user may grant push/PR access without granting merge/deploy authority.
 */
export async function readGithubAutoDeliverEnabled(userSub: string): Promise<boolean> {
  const row = await readRow(userSub);
  return Boolean(row?.auto_deliver_enabled);
}

export async function setGithubAutoDeliverEnabled(userSub: string, enabled: boolean): Promise<boolean> {
  const response = await request(`github_connections?user_sub=eq.${encodeURIComponent(userSub)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ auto_deliver_enabled: Boolean(enabled), updated_at: new Date().toISOString() }),
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
    return {
      connected: false, login: "", scopes: [], connectedAt: null,
      autoPrEnabled: false, autoDeliverEnabled: false,
      reason: "GitHub connections are not configured on this deployment (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
  if (!resolveGithubSealSecret()) {
    return {
      connected: false, login: "", scopes: [], connectedAt: null,
      autoPrEnabled: false, autoDeliverEnabled: false,
      reason: "GitHub connections are not configured on this deployment (GITHUB_CONNECTION_SECRET must be at least 32 characters).",
    };
  }
  const row = await readRow(userSub);
  if (!row?.sealed_token) {
    return { connected: false, login: "", scopes: [], connectedAt: null, autoPrEnabled: false, autoDeliverEnabled: false };
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
      autoDeliverEnabled: false,
      reason: "The stored GitHub authorization could not be opened with this deployment's key. Reconnect your GitHub account.",
    };
  }
  return {
    connected: true,
    login: String(row.github_login || ""),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    autoPrEnabled: Boolean(row.auto_pr_enabled),
    autoDeliverEnabled: Boolean(row.auto_deliver_enabled),
  };
}
