import { normalizeUserContextGraph, type UserContextNode } from "./user-context-graph.js";

const REST_TIMEOUT_MS = 4_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isUserContextStoreConfigured(): boolean {
  return config() !== null;
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
      console.warn(`Supabase ${init.method || "GET"} ${path} -> ${response.status}`, await response.text());
      return null;
    }
    return response;
  } catch (err: any) {
    console.warn(`Supabase ${init.method || "GET"} ${path} failed:`, err?.message || err);
    return null;
  }
}

/**
 * Read only active account-level context for the authenticated owner. The
 * service-role key stays server-side; callers must supply the verified session
 * subject, never a browser-provided account id.
 */
export async function readUserContextGraph(userSub: string): Promise<UserContextNode[]> {
  if (!userSub) return [];
  const response = await request(
    `user_context_nodes?select=id,category,context_key,value,provenance,confidence,status,source_ref,valid_from,valid_until,updated_at&user_sub=eq.${encodeURIComponent(userSub)}&status=eq.active&order=updated_at.desc&limit=240`,
    { method: "GET" },
  );
  if (!response) return [];
  try {
    const rows = await response.json();
    return normalizeUserContextGraph(Array.isArray(rows) ? rows : []);
  } catch {
    return [];
  }
}

export type UserContextWrite = Omit<UserContextNode, "id" | "status" | "updatedAt"> & {
  status?: "active" | "superseded";
};

/**
 * Server-only append used by trusted ingestion/tooling. V1 deliberately does
 * not allow caller-supplied row ids or cross-owner updates: every write creates
 * a new node owned by the verified session subject. Supersession can be added
 * later through an owner-scoped RPC once the ingestion workflow needs it.
 */
export async function saveUserContextNode(userSub: string, node: UserContextWrite): Promise<UserContextNode | null> {
  if (!userSub) return null;
  const normalized = normalizeUserContextGraph([{
    ...node,
    id: "pending",
    status: node.status || "active",
    updatedAt: new Date().toISOString(),
  }])[0];
  if (!normalized) return null;

  const response = await request("user_context_nodes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      user_sub: userSub,
      category: normalized.category,
      context_key: normalized.key,
      value: normalized.value,
      provenance: normalized.provenance,
      confidence: normalized.confidence,
      status: normalized.status,
      source_ref: normalized.sourceRef || null,
      valid_from: normalized.validFrom || null,
      valid_until: normalized.validUntil || null,
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!response) return null;

  try {
    const rows = await response.json();
    return normalizeUserContextGraph(Array.isArray(rows) ? rows : [rows])[0] || null;
  } catch {
    return null;
  }
}
