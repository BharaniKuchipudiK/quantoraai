import { createHash } from "node:crypto";

/**
 * Watched questions: a standing research question the desk re-checks on the
 * daily scheduled run and flags when the evidence moved.
 *
 * Change detection is DETERMINISTIC — no model judges "did it change".
 * Each sweep runs one grounded lookup, reduces the reply to a snapshot
 * (which publishers spoke, how many findings they yielded), and compares
 * snapshots. The baseline is set by the FIRST sweep, never by the dossier
 * at watch time: comparing one grounded lookup with another keeps the
 * comparison like-for-like, so "the evidence changed" can never be an
 * artifact of comparing a whole investigation against a single reply.
 *
 * Storage follows store.ts: Supabase REST with the service-role key,
 * fail-soft everywhere — a watch the sweep could not check today is checked
 * tomorrow; it is never silently deleted and never fabricates a change.
 */

export const RESEARCH_WATCH_VERSION = "research-watch-2026-09-02.1";

const MIN_QUESTION_CHARS = 12;
const MAX_QUESTION_CHARS = 500;
/** A person watches a few questions, not a feed. */
export const MAX_WATCHES_PER_USER = 3;
/** Bound what one scheduled run can spend. */
const MAX_SWEEP_CHECKS = 10;
/** Due = never checked, or last checked over 20 hours ago. */
const SWEEP_DUE_MS = 20 * 60 * 60 * 1000;
const REST_TIMEOUT_MS = 4_000;

export type ResearchEvidenceSnapshot = {
  digest: string;
  hosts: string[];
  findingCount: number;
};

export type ResearchWatchRow = {
  id: string;
  user_sub: string;
  question: string;
  evidence_digest: string;
  evidence_hosts: string[];
  finding_count: number;
  changed: boolean;
  change_note: string;
  last_checked_at: string | null;
  created_at: string;
};

export function normalizeWatchQuestion(value: unknown): string {
  const question = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (question.length < MIN_QUESTION_CHARS || question.length > MAX_QUESTION_CHARS) return "";
  return question;
}

function hostOf(uri: string, title: string): string {
  try {
    const host = new URL(uri).hostname.replace(/^www\./, "").toLowerCase();
    // Grounding redirects say nothing about the publisher; the title does.
    if (host === "vertexaisearch.cloud.google.com" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title.trim())) {
      return title.trim().toLowerCase();
    }
    return host;
  } catch {
    return "";
  }
}

/**
 * Reduce one grounded reply to the snapshot the comparison runs on: which
 * publishers spoke, and how many finding-shaped bullets they yielded. The
 * bullet rule matches the dossier brief's (declarative, 30-240 chars, not a
 * question) so the two surfaces count the same things.
 */
export function snapshotFromGroundedReply(input: {
  answer: string;
  sources: Array<{ uri: string; title: string }>;
}): ResearchEvidenceSnapshot {
  const hosts = [...new Set(
    (input.sources || [])
      .map((source) => hostOf(String(source?.uri || ""), String(source?.title || "")))
      .filter(Boolean),
  )].sort();

  let findingCount = 0;
  for (const line of String(input.answer || "").split("\n")) {
    if (!/^\s{0,3}(?:[-*+]|\d+\.)\s+/.test(line)) continue;
    const text = line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
    if (text.length >= 30 && text.length <= 240 && !text.endsWith("?")) findingCount += 1;
  }

  const digest = createHash("sha256")
    .update(`${hosts.join("|")}::${findingCount}`)
    .digest("hex")
    .slice(0, 24);
  return { digest, hosts, findingCount };
}

/**
 * Deterministic wording for what moved. Equal digests are "unchanged" and
 * produce no note; anything else names the publishers that appeared or
 * fell away and the finding-count shift.
 */
export function describeEvidenceChange(
  previous: ResearchEvidenceSnapshot,
  next: ResearchEvidenceSnapshot,
): { changed: boolean; note: string } {
  if (previous.digest === next.digest) return { changed: false, note: "" };
  const parts: string[] = [];
  const appeared = next.hosts.filter((host) => !previous.hosts.includes(host));
  const dropped = previous.hosts.filter((host) => !next.hosts.includes(host));
  if (appeared.length) parts.push(`new source${appeared.length === 1 ? "" : "s"}: ${appeared.join(", ")}`);
  if (dropped.length) parts.push(`no longer cited: ${dropped.join(", ")}`);
  if (previous.findingCount !== next.findingCount) {
    parts.push(`findings went from ${previous.findingCount} to ${next.findingCount}`);
  }
  return { changed: true, note: parts.join("; ") || "the evidence composition shifted" };
}

/* ------------------------------------------------------------------ */
/* Storage (service-role REST, fail-soft, mirroring store.ts)          */
/* ------------------------------------------------------------------ */

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isResearchWatchStoreConfigured(): boolean {
  return config() !== null;
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
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

export async function listResearchWatches(userSub: string): Promise<ResearchWatchRow[]> {
  const response = await request(
    `research_watches?user_sub=eq.${encodeURIComponent(userSub)}&order=created_at.asc&limit=${MAX_WATCHES_PER_USER}`,
  );
  if (!response) return [];
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

export async function createResearchWatch(userSub: string, question: string): Promise<
  { ok: boolean; error?: string }
> {
  const existing = await listResearchWatches(userSub);
  if (existing.some((row) => row.question === question)) return { ok: true };
  if (existing.length >= MAX_WATCHES_PER_USER) {
    return { ok: false, error: `You can watch up to ${MAX_WATCHES_PER_USER} questions — unwatch one first.` };
  }
  const response = await request("research_watches", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_sub: userSub, question }),
  });
  return response ? { ok: true } : { ok: false, error: "The watch could not be saved right now." };
}

export async function deleteResearchWatch(userSub: string, question: string): Promise<boolean> {
  const response = await request(
    `research_watches?user_sub=eq.${encodeURIComponent(userSub)}&question=eq.${encodeURIComponent(question)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  return response !== null;
}

export async function acknowledgeResearchWatch(userSub: string, question: string): Promise<boolean> {
  const response = await request(
    `research_watches?user_sub=eq.${encodeURIComponent(userSub)}&question=eq.${encodeURIComponent(question)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ changed: false, change_note: "" }),
    },
  );
  return response !== null;
}

async function listDueWatches(now: Date): Promise<ResearchWatchRow[]> {
  const cutoff = new Date(now.getTime() - SWEEP_DUE_MS).toISOString();
  const response = await request(
    `research_watches?or=(last_checked_at.is.null,last_checked_at.lt.${encodeURIComponent(cutoff)})` +
      `&order=last_checked_at.asc.nullsfirst&limit=${MAX_SWEEP_CHECKS}`,
  );
  if (!response) return [];
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function saveSweepResult(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const response = await request(`research_watches?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return response !== null;
}

/**
 * The scheduled pass. For each due watch: one grounded lookup, snapshot,
 * compare, store. The first successful sweep only sets the baseline — it
 * never flags a change, because there is nothing like-for-like to compare
 * yet. A failed lookup leaves the row untouched for tomorrow. An already
 * flagged change stays flagged (and its note stays) until the person
 * acknowledges it, so a later quiet sweep cannot silently retract news.
 */
export async function sweepResearchWatches(input: {
  groundedAnswer: (question: string) => Promise<{ answer: string; sources: Array<{ uri: string; title: string }> }>;
  now?: Date;
  listDue?: (now: Date) => Promise<ResearchWatchRow[]>;
  save?: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
}): Promise<{ checked: number; changed: number }> {
  const now = input.now ?? new Date();
  const listDue = input.listDue ?? listDueWatches;
  const save = input.save ?? saveSweepResult;

  const due = await listDue(now);
  let checked = 0;
  let changed = 0;
  for (const watch of due) {
    let reply: { answer: string; sources: Array<{ uri: string; title: string }> };
    try {
      reply = await input.groundedAnswer(watch.question);
    } catch {
      continue; // unchecked today, due again tomorrow — never a fabricated result
    }
    const next = snapshotFromGroundedReply(reply);
    checked += 1;

    if (!watch.evidence_digest) {
      await save(watch.id, {
        evidence_digest: next.digest,
        evidence_hosts: next.hosts,
        finding_count: next.findingCount,
        last_checked_at: now.toISOString(),
      });
      continue;
    }

    const previous: ResearchEvidenceSnapshot = {
      digest: watch.evidence_digest,
      hosts: Array.isArray(watch.evidence_hosts) ? watch.evidence_hosts : [],
      findingCount: watch.finding_count ?? 0,
    };
    const verdict = describeEvidenceChange(previous, next);
    await save(watch.id, {
      evidence_digest: next.digest,
      evidence_hosts: next.hosts,
      finding_count: next.findingCount,
      last_checked_at: now.toISOString(),
      ...(verdict.changed
        ? { changed: true, change_note: verdict.note }
        : {}),
    });
    if (verdict.changed) changed += 1;
  }
  return { checked, changed };
}
