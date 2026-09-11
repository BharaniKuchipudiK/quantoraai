/*
 * Exclusive worker ownership for one durable QIR Run.
 *
 * A lease is deliberately separate from the Agent Run snapshot: the Run is
 * mission state, while a lease is short-lived operational ownership. A dead
 * process must lose ownership automatically without rewriting mission history.
 *
 * The Supabase implementation uses the service-role-only RPCs introduced by
 * 20260912030000_qir_worker_leases.sql. The local implementation exists only
 * for process-level contention/crash proofs and uses a tiny lock directory to
 * serialize competing writers across OS processes.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export type QirWorkerLeaseIdentity = {
  workerId: string;
  leaseToken: string;
};

export type QirWorkerLeaseRecord = QirWorkerLeaseIdentity & {
  leasedUntil: string;
  heartbeatAt: string;
};

export type QirWorkerLeaseClaimResult =
  | { status: "acquired"; lease: QirWorkerLeaseRecord }
  | { status: "busy"; lease: QirWorkerLeaseRecord | null }
  | { status: "unavailable"; diagnosis?: string | null };

export type QirWorkerLeaseHeartbeatResult =
  | { status: "renewed"; lease: QirWorkerLeaseRecord }
  | { status: "lost"; lease: QirWorkerLeaseRecord | null }
  | { status: "unavailable"; diagnosis?: string | null };

export type QirWorkerLeaseReleaseResult =
  | { status: "released" }
  | { status: "not-owner" }
  | { status: "unavailable"; diagnosis?: string | null };

export type QirWorkerLeasePort = {
  readonly kind: string;
  claim(input: {
    userSub: string;
    runId: string;
    workerId: string;
    leaseToken: string;
    ttlMs: number;
  }): Promise<QirWorkerLeaseClaimResult>;
  heartbeat(input: {
    userSub: string;
    runId: string;
    workerId: string;
    leaseToken: string;
    ttlMs: number;
  }): Promise<QirWorkerLeaseHeartbeatResult>;
  release(input: {
    userSub: string;
    runId: string;
    workerId: string;
    leaseToken: string;
  }): Promise<QirWorkerLeaseReleaseResult>;
};

function validIdentity(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 191;
}

function normalizeTtlMs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const ttl = Math.floor(value);
  if (ttl < 500 || ttl > 300_000) return null;
  return ttl;
}

function firstRow(payload: any): any | null {
  if (Array.isArray(payload)) return payload[0] || null;
  return payload && typeof payload === "object" ? payload : null;
}

function leaseFromRow(row: any): QirWorkerLeaseRecord | null {
  if (!row) return null;
  const workerId = String(row.worker_id || "");
  const leaseToken = String(row.lease_token || "");
  const leasedUntil = String(row.leased_until || "");
  const heartbeatAt = String(row.heartbeat_at || "");
  if (!validIdentity(workerId) || !validIdentity(leaseToken) || !leasedUntil || !heartbeatAt) return null;
  return { workerId, leaseToken, leasedUntil, heartbeatAt };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRpc(name: string, body: Record<string, unknown>): Promise<Response | null> {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    return await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error: any) {
    console.warn(`QIR worker lease ${name} failed:`, error?.message || error);
    return null;
  }
}

/** Production lease adapter. Nothing calls this unless worker.ts explicitly selects it. */
export function createSupabaseQirWorkerLeaseStore(): QirWorkerLeasePort {
  return {
    kind: "supabase-qir-worker-lease",

    async claim(input) {
      const ttlMs = normalizeTtlMs(input.ttlMs);
      if (!ttlMs || !validIdentity(input.workerId) || !validIdentity(input.leaseToken)) {
        return { status: "unavailable", diagnosis: "invalid-lease-input" };
      }
      const response = await supabaseRpc("claim_qir_worker_lease", {
        p_user_sub: input.userSub,
        p_run_id: input.runId,
        p_worker_id: input.workerId,
        p_lease_token: input.leaseToken,
        p_ttl_seconds: Math.max(5, Math.ceil(ttlMs / 1000)),
      });
      if (!response?.ok) {
        const detail = response ? await response.text().catch(() => "") : "";
        return { status: "unavailable", diagnosis: detail ? "lease-store-rejected" : "lease-store-unreachable" };
      }
      try {
        const row = firstRow(await response.json());
        const lease = leaseFromRow(row);
        return Boolean(row?.acquired)
          ? { status: "acquired", lease: lease! }
          : { status: "busy", lease };
      } catch {
        return { status: "unavailable", diagnosis: "lease-store-invalid-response" };
      }
    },

    async heartbeat(input) {
      const ttlMs = normalizeTtlMs(input.ttlMs);
      if (!ttlMs || !validIdentity(input.workerId) || !validIdentity(input.leaseToken)) {
        return { status: "unavailable", diagnosis: "invalid-lease-input" };
      }
      const response = await supabaseRpc("heartbeat_qir_worker_lease", {
        p_user_sub: input.userSub,
        p_run_id: input.runId,
        p_worker_id: input.workerId,
        p_lease_token: input.leaseToken,
        p_ttl_seconds: Math.max(5, Math.ceil(ttlMs / 1000)),
      });
      if (!response?.ok) return { status: "unavailable", diagnosis: response ? "lease-store-rejected" : "lease-store-unreachable" };
      try {
        const row = firstRow(await response.json());
        const lease = row ? {
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          leasedUntil: String(row.leased_until || ""),
          heartbeatAt: String(row.heartbeat_at || ""),
        } : null;
        return Boolean(row?.renewed)
          ? { status: "renewed", lease: lease! }
          : { status: "lost", lease };
      } catch {
        return { status: "unavailable", diagnosis: "lease-store-invalid-response" };
      }
    },

    async release(input) {
      if (!validIdentity(input.workerId) || !validIdentity(input.leaseToken)) return { status: "not-owner" };
      const response = await supabaseRpc("release_qir_worker_lease", {
        p_user_sub: input.userSub,
        p_run_id: input.runId,
        p_worker_id: input.workerId,
        p_lease_token: input.leaseToken,
      });
      if (!response?.ok) return { status: "unavailable", diagnosis: response ? "lease-store-rejected" : "lease-store-unreachable" };
      try {
        const payload = await response.json();
        const released = Array.isArray(payload) ? payload[0] : payload;
        return released === true ? { status: "released" } : { status: "not-owner" };
      } catch {
        return { status: "unavailable", diagnosis: "lease-store-invalid-response" };
      }
    },
  };
}

// ---- Local process-proof implementation ----------------------------------

type LocalLeaseRecord = QirWorkerLeaseRecord;

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function localPaths(dir: string, userSub: string, runId: string) {
  const base = `${safe(userSub)}__${safe(runId)}`;
  return {
    lease: join(dir, `${base}.lease.json`),
    lock: join(dir, `${base}.lock`),
  };
}

async function withLocalLock<T>(lockPath: string, fn: () => T | Promise<T>): Promise<T> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("local-worker-lease-lock-timeout");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function readLocalLease(path: string): LocalLeaseRecord | null {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (!leaseFromRow({
      worker_id: value.workerId,
      lease_token: value.leaseToken,
      leased_until: value.leasedUntil,
      heartbeat_at: value.heartbeatAt,
    })) return null;
    return value;
  } catch {
    return null;
  }
}

function writeLocalLease(path: string, value: LocalLeaseRecord) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), "utf8");
  renameSync(tmp, path);
}

/** Dev/proof-only lease implementation used by the two-process contention gate. */
export function createLocalFileQirWorkerLeaseStore(dir: string): QirWorkerLeasePort {
  mkdirSync(dir, { recursive: true });
  return {
    kind: "local-file-qir-worker-lease-proof-only",

    async claim(input) {
      const ttlMs = normalizeTtlMs(input.ttlMs);
      if (!ttlMs || !validIdentity(input.workerId) || !validIdentity(input.leaseToken)) {
        return { status: "unavailable", diagnosis: "invalid-lease-input" };
      }
      const paths = localPaths(dir, input.userSub, input.runId);
      return withLocalLock(paths.lock, () => {
        const now = Date.now();
        const current = readLocalLease(paths.lease);
        const currentExpiry = current ? Date.parse(current.leasedUntil) : 0;
        const sameOwner = current?.workerId === input.workerId && current?.leaseToken === input.leaseToken;
        if (current && !sameOwner && currentExpiry > now) return { status: "busy", lease: current } as const;
        const next: LocalLeaseRecord = {
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          heartbeatAt: new Date(now).toISOString(),
          leasedUntil: new Date(now + ttlMs).toISOString(),
        };
        writeLocalLease(paths.lease, next);
        return { status: "acquired", lease: next } as const;
      });
    },

    async heartbeat(input) {
      const ttlMs = normalizeTtlMs(input.ttlMs);
      if (!ttlMs) return { status: "unavailable", diagnosis: "invalid-lease-input" };
      const paths = localPaths(dir, input.userSub, input.runId);
      return withLocalLock(paths.lock, () => {
        const now = Date.now();
        const current = readLocalLease(paths.lease);
        if (!current
          || current.workerId !== input.workerId
          || current.leaseToken !== input.leaseToken
          || Date.parse(current.leasedUntil) <= now) {
          return { status: "lost", lease: current } as const;
        }
        const next: LocalLeaseRecord = {
          ...current,
          heartbeatAt: new Date(now).toISOString(),
          leasedUntil: new Date(now + ttlMs).toISOString(),
        };
        writeLocalLease(paths.lease, next);
        return { status: "renewed", lease: next } as const;
      });
    },

    async release(input) {
      const paths = localPaths(dir, input.userSub, input.runId);
      return withLocalLock(paths.lock, () => {
        const current = readLocalLease(paths.lease);
        if (!current || current.workerId !== input.workerId || current.leaseToken !== input.leaseToken) {
          return { status: "not-owner" } as const;
        }
        rmSync(paths.lease, { force: true });
        return { status: "released" } as const;
      });
    },
  };
}
