import { normalizeOutcomeState, type OutcomeState, type OutcomeStateRecord } from "./outcome-state.js";
import { randomUUID } from "node:crypto";
import { normalizeAuthEmail, rowsMatchingAuthEmail } from "./auth-privacy.js";
import type { StudyMasteryEstimate } from "./study-mastery-estimator.js";
import type { StudyMasteryEvidenceEvent } from "./study-truth-layer.js";

/*
 * Server-side reads and writes against Supabase.
 *
 * Uses the SERVICE ROLE key, never the anon key. The anon key ships to every
 * browser and is public by design; the users table has row-level security on
 * with no policies, so the anon key can touch nothing here. Service role
 * bypasses RLS and therefore must never leave the server — no VITE_ prefix,
 * no returning it in any response.
 *
 * Every function here fails soft. Recording that somebody signed in is
 * bookkeeping; if the database is unreachable, a user must still be able to
 * sign in and use the product. Losing a row is annoying, refusing a login
 * because analytics is down is inexcusable.
 */

const REST_TIMEOUT_MS = 4_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isStoreConfigured(): boolean {
  return config() !== null;
}

async function requestRaw(path: string, init: RequestInit & { headers?: Record<string, string> }) {
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

    return response;
  } catch (err: any) {
    console.warn(`Supabase ${init.method || "GET"} ${path} failed:`, err?.message || err);
    return null;
  }
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const response = await requestRaw(path, init);
  if (!response) return null;
  if (!response.ok) {
    // Logged, never thrown — see the fail-soft note above.
    console.warn(`Supabase ${init.method || "GET"} ${path} -> ${response.status}`, await response.text());
    return null;
  }
  return response;
}

export type StoredUser = {
  google_sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  is_admin?: boolean | null;
  password_hash?: string | null;
  auth_provider?: string | null;
};

/*
 * Record a sign-in, and report whether the account is blocked.
 *
 * Upsert on google_sub: one row per person, created on first sign-in and
 * touched on every later one. Google's `sub` is the key rather than the email
 * address, because an email can change and keying on it would quietly split
 * one person into two accounts.
 *
 * Returns null when the store is unconfigured or unreachable, which callers
 * must treat as "carry on" rather than "deny".
 */
export async function recordSignIn(user: {
  sub: string; email: string; name: string; picture: string;
  geo?: { countryCode: string; region?: string | null; city?: string | null } | null;
}): Promise<StoredUser | null> {
  const now = new Date().toISOString();

  const response = await request("users?on_conflict=google_sub", {
    method: "POST",
    headers: {
      // merge-duplicates turns this into an upsert; representation returns the row
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([{
      google_sub: user.sub,
      email: normalizeAuthEmail(user.email),
      name: user.name,
      picture: user.picture,
      auth_provider: user.sub.startsWith("github:")
        ? "github"
        : user.sub.startsWith("email:")
          ? "email"
          : "google",
      last_seen_at: now,
      ...(user.geo ? {
        country_code: user.geo.countryCode,
        region: user.geo.region || null,
        city: user.geo.city || null,
        geo_updated_at: now,
      } : {}),
    }]),
  });
  if (!response) return null;

  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? (rows[0] as StoredUser) : null;
  } catch {
    return null;
  }
}

export async function readStoredUser(googleSub: string): Promise<StoredUser | null> {
  if (!googleSub) return null;
  const response = await request(
    `users?select=google_sub,email,name,picture,blocked_at,blocked_reason,is_admin,password_hash,auth_provider&google_sub=eq.${encodeURIComponent(googleSub)}&limit=1`,
    { method: "GET" },
  );
  if (!response) return null;

  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? (rows[0] as StoredUser) : null;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return null;
  const response = await request(
    `users?select=google_sub,email,name,picture,blocked_at,blocked_reason,is_admin,password_hash,auth_provider&email=ilike.${encodeURIComponent(normalized)}&limit=20`,
    { method: "GET" },
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    const matches = rowsMatchingAuthEmail(Array.isArray(rows) ? rows as StoredUser[] : [], normalized);
    return matches[0] || null;
  } catch {
    return null;
  }
}

export async function createEmailUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<StoredUser | null | "duplicate"> {
  const now = new Date().toISOString();
  const sub = `email:${randomUUID()}`;
  const response = await requestRaw("users", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      google_sub: sub,
      email: normalizeAuthEmail(input.email),
      name: input.name,
      picture: "",
      password_hash: input.passwordHash,
      auth_provider: "email",
      created_at: now,
      last_seen_at: now,
    }]),
  });
  if (!response) return null;
  if (response.status === 409) return "duplicate";
  if (!response.ok) {
    console.warn(`Supabase POST users -> ${response.status}`, await response.text());
    return null;
  }
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? (rows[0] as StoredUser) : null;
  } catch {
    return null;
  }
}

export async function updateUserPassword(sub: string, passwordHash: string): Promise<boolean> {
  if (!sub) return false;
  const response = await request(
    `users?google_sub=eq.${encodeURIComponent(sub)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ password_hash: passwordHash }),
    },
  );
  return Boolean(response);
}

/*
 * One row per AI request.
 *
 * `used_server_key` is the column that matters: it separates requests this
 * deployment paid for from requests a user funded with their own key. Without
 * it, "how much is this costing me" is unanswerable.
 *
 * Deliberately not awaited by callers — a chat response must never wait on
 * bookkeeping.
 */
export function recordUsage(entry: {
  userSub: string | null;
  provider: string;
  modelId: string;
  latencyMs: number;
  tokensEst: number;
  usedServerKey: boolean;
  studioMode?: string | null;
  studioDomain?: string | null;
  choiceSelected?: boolean;
  countryCode?: string | null;
}): void {
  void request("usage", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      user_sub: entry.userSub,
      provider: entry.provider,
      model_id: entry.modelId,
      latency_ms: entry.latencyMs,
      tokens_est: entry.tokensEst,
      used_server_key: entry.usedServerKey,
      studio_mode: entry.studioMode || null,
      studio_domain: entry.studioDomain || null,
      choice_selected: entry.choiceSelected === true,
      country_code: entry.countryCode || null,
    }]),
  });
}

export function recordProductEvent(entry: {
  userSub: string | null;
  eventType: "preview_opened" | "publish_completed";
  metadata?: Record<string, unknown>;
}): void {
  void request("product_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      user_sub: entry.userSub,
      event_type: entry.eventType,
      metadata: entry.metadata || {},
    }]),
  });
}

/*
 * Acceptance-Rate instrumentation (Roadmap 9.1). One row per proactive act:
 * shown / accepted / dismissed, per surface. Fire-and-forget bookkeeping — a
 * suggestion must never wait on, or fail because of, analytics. Stores no
 * prompt/response text, only surface + action.
 */
export function recordSuggestionEvent(entry: {
  userSub: string | null;
  surface: string;
  action: "shown" | "accepted" | "dismissed";
  meta?: Record<string, unknown>;
}): void {
  if (!entry.surface || !entry.action) return;
  void request("suggestion_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      user_sub: entry.userSub,
      surface: entry.surface,
      action: entry.action,
      meta: entry.meta || {},
    }]),
  });
}

/** Read the 7-day acceptance rate per surface for the admin dashboard. */
export async function getSuggestionAcceptance(): Promise<Array<{
  surface: string; shown: number; accepted: number; dismissed: number; acceptance_rate_pct: number | null;
}>> {
  const res = await request("suggestion_acceptance_7d?select=*", { method: "GET" });
  if (!res) return [];
  try {
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Persist the owner of a project before allowing later privileged mutations. */
export async function recordPublishedSite(entry: {
  userSub: string;
  projectName: string;
  deploymentId: string;
  deploymentUrl: string;
}): Promise<boolean> {
  const response = await request("published_sites?on_conflict=project_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_sub: entry.userSub,
      project_name: entry.projectName,
      deployment_id: entry.deploymentId,
      deployment_url: entry.deploymentUrl,
      updated_at: new Date().toISOString(),
    }]),
  });
  return response !== null;
}

/**
 * True only when the database positively confirms ownership. Null means the
 * store could not answer and privileged callers must fail closed.
 */
export async function isPublishedSiteOwner(userSub: string, projectName: string): Promise<boolean | null> {
  if (!config()) return null;
  const response = await request(
    `published_sites?select=project_name&project_name=eq.${encodeURIComponent(projectName)}&user_sub=eq.${encodeURIComponent(userSub)}&limit=1`,
    { method: "GET" },
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return null;
  }
}

function outcomeRecord(row: any): OutcomeStateRecord | null {
  if (!row || typeof row !== "object" || typeof row.version !== "number") return null;
  return {
    sessionId: row.session_id,
    version: row.version,
    state: normalizeOutcomeState(row.state),
    updatedAt: row.updated_at,
  };
}

export async function readOutcomeState(userSub: string, sessionId: string): Promise<OutcomeStateRecord | null> {
  const response = await request(
    `outcome_states?select=session_id,version,state,updated_at&user_sub=eq.${encodeURIComponent(userSub)}&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`,
    { method: "GET" },
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? outcomeRecord(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Atomic optimistic-concurrency save through migration 0014's RPC. */
export type OutcomeSaveResult =
  | { status: "saved"; record: OutcomeStateRecord }
  | { status: "conflict" }
  | { status: "unavailable" };

export async function saveOutcomeState(entry: {
  userSub: string;
  sessionId: string;
  expectedVersion: number;
  state: OutcomeState;
  sourceTurn?: string | null;
}): Promise<OutcomeSaveResult> {
  const response = await requestRaw("rpc/save_outcome_state", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_session_id: entry.sessionId,
      p_expected_version: entry.expectedVersion,
      p_state: entry.state,
      p_source_turn: entry.sourceTurn || null,
    }),
  });
  if (!response) return { status: "unavailable" };
  if (!response.ok) {
    const detail = await response.text();
    if (detail.includes("outcome_version_conflict")) return { status: "conflict" };
    console.warn(`Supabase POST rpc/save_outcome_state -> ${response.status}`, detail);
    return { status: "unavailable" };
  }
  try {
    const rows = await response.json();
    const record = outcomeRecord(Array.isArray(rows) ? rows[0] : rows);
    return record ? { status: "saved", record } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function deleteOutcomeState(userSub: string, sessionId: string): Promise<boolean> {
  const response = await request(
    `outcome_states?user_sub=eq.${encodeURIComponent(userSub)}&session_id=eq.${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  return response !== null;
}

export type StudyEvidenceWriteResult = {
  status: "saved" | "duplicate" | "unmapped" | "unavailable";
};

export type ActiveStudyConcept = {
  id: string;
  canonicalKey: string;
  label: string;
};

function studyConceptRecord(value: any): ActiveStudyConcept | null {
  const id = typeof value?.id === "string" ? value.id : "";
  const canonicalKey = typeof value?.canonical_key === "string" ? value.canonical_key : "";
  const label = typeof value?.label === "string" ? value.label : "";
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}

function studyLabel(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve only an active canonical concept; ambiguous browser labels stay unmapped. */
export async function resolveActiveStudyConcept(input: {
  conceptKey: string;
  conceptLabel: string;
}): Promise<ActiveStudyConcept | null | "unavailable"> {
  if (!config()) return "unavailable";
  const key = String(input.conceptKey || "").trim().toLowerCase();
  if (key) {
    const exact = await request(
      `study_concepts?select=id,canonical_key,label&canonical_key=eq.${encodeURIComponent(key)}&status=eq.active&order=updated_at.desc&limit=1`,
      { method: "GET" },
    );
    if (!exact) return "unavailable";
    try {
      const rows = await exact.json();
      const record = studyConceptRecord(Array.isArray(rows) ? rows[0] : null);
      if (record) return record;
    } catch { return "unavailable"; }
  }

  const label = studyLabel(input.conceptLabel);
  if (!label) return null;
  const candidatesResponse = await request(
    "study_concepts?select=id,canonical_key,label&status=eq.active&order=updated_at.desc&limit=200",
    { method: "GET" },
  );
  if (!candidatesResponse) return "unavailable";
  try {
    const candidates = (await candidatesResponse.json())
      .map(studyConceptRecord)
      .filter((row: ActiveStudyConcept | null): row is ActiveStudyConcept => Boolean(row));
    const matches = candidates.filter((candidate: ActiveStudyConcept) => {
      const candidateLabel = studyLabel(candidate.label);
      return label === candidateLabel
        || label.includes(candidateLabel)
        || (label.length >= 12 && candidateLabel.includes(label));
    });
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return "unavailable";
  }
}

export async function issueStudyAssessmentAttempt(entry: {
  userSub: string;
  sessionId: string;
  conceptId: string;
  itemKey: string;
  itemVersion: string;
  optionIds: string[];
  correctOptionId: string;
  misconceptionOptionIds: string[];
  difficulty: number;
  expiresAt: string;
}): Promise<{ status: "issued"; attemptId: string } | { status: "unavailable" }> {
  const attemptId = randomUUID();
  const response = await requestRaw("study_assessment_attempts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      id: attemptId,
      user_sub: entry.userSub,
      session_id: entry.sessionId,
      concept_id: entry.conceptId,
      item_key: entry.itemKey,
      item_version: entry.itemVersion,
      option_ids: entry.optionIds,
      correct_option_id: entry.correctOptionId,
      misconception_option_ids: entry.misconceptionOptionIds,
      difficulty: entry.difficulty,
      expires_at: entry.expiresAt,
    }]),
  });
  if (!response?.ok) {
    if (response) console.warn(`Supabase POST study_assessment_attempts -> ${response.status}`);
    return { status: "unavailable" };
  }
  return { status: "issued", attemptId };
}

export type StudyAssessmentGradeRecord = {
  status: "graded" | "already_submitted" | "expired" | "not_found" | "invalid_option";
  correct: boolean | null;
  score: number | null;
  conceptId: string | null;
  itemKey: string | null;
  itemVersion: string | null;
  misconception: boolean | null;
};

export async function completeStudyAssessmentAttempt(entry: {
  userSub: string;
  attemptId: string;
  optionId: string;
  observedAt: string;
}): Promise<StudyAssessmentGradeRecord | "unavailable"> {
  const response = await requestRaw("rpc/complete_study_assessment_attempt", {
    method: "POST",
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_attempt_id: entry.attemptId,
      p_option_id: entry.optionId,
      p_observed_at: entry.observedAt,
    }),
  });
  if (!response?.ok) {
    if (response) console.warn(`Supabase POST rpc/complete_study_assessment_attempt -> ${response.status}`);
    return "unavailable";
  }
  try {
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    const status = row?.result_status as StudyAssessmentGradeRecord["status"];
    if (!["graded", "already_submitted", "expired", "not_found", "invalid_option"].includes(status)) return "unavailable";
    return {
      status,
      correct: typeof row?.result_correct === "boolean" ? row.result_correct : null,
      score: typeof row?.result_score === "number" ? row.result_score : null,
      conceptId: typeof row?.result_concept_id === "string" ? row.result_concept_id : null,
      itemKey: typeof row?.result_item_key === "string" ? row.result_item_key : null,
      itemVersion: typeof row?.result_item_version === "string" ? row.result_item_version : null,
      misconception: typeof row?.result_misconception === "boolean" ? row.result_misconception : null,
    };
  } catch {
    return "unavailable";
  }
}

export async function readStudyMasteryEvidence(
  userSub: string,
  conceptId: string,
): Promise<StudyMasteryEvidenceEvent[] | null> {
  const response = await request(
    `study_mastery_events?select=event_key,event_kind,correct,score,difficulty,hints_used,response_ms,self_confidence,independent,misconception_signal,delay_days,provenance,source_ref,assessment_ref,item_ref,observed_at&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptId)}&order=observed_at.desc&limit=500`,
    { method: "GET" },
  );
  if (!response) return null;
  try {
    const rows = await response.json();
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: String(row.event_key || ""),
      conceptId,
      kind: row.event_kind,
      correct: typeof row.correct === "boolean" ? row.correct : null,
      score: typeof row.score === "number" ? row.score : null,
      difficulty: typeof row.difficulty === "number" ? row.difficulty : null,
      hintsUsed: Number(row.hints_used) || 0,
      responseMs: typeof row.response_ms === "number" ? row.response_ms : null,
      selfConfidence: typeof row.self_confidence === "number" ? row.self_confidence : null,
      independent: row.independent === true,
      misconceptionSignal: row.misconception_signal === true,
      delayDays: typeof row.delay_days === "number" ? row.delay_days : null,
      provenance: row.provenance,
      sourceRef: row.source_ref,
      assessmentRef: row.assessment_ref,
      itemRef: row.item_ref,
      observedAt: String(row.observed_at || ""),
    })) as StudyMasteryEvidenceEvent[];
  } catch {
    return null;
  }
}

export async function saveStudyMasteryEstimate(entry: {
  userSub: string;
  conceptId: string;
  estimate: StudyMasteryEstimate;
}): Promise<boolean> {
  const estimate = entry.estimate;
  const response = await requestRaw("study_mastery_estimates?on_conflict=user_sub,concept_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_sub: entry.userSub,
      concept_id: entry.conceptId,
      status: estimate.status,
      mastery: estimate.mastery,
      confidence: estimate.confidence,
      retention: estimate.retention,
      misconception_risk: estimate.misconceptionRisk,
      evidence_count: estimate.evidenceCount,
      effective_evidence_weight: estimate.effectiveEvidenceWeight,
      estimator_version: estimate.reasonCodes[0],
      reason_codes: estimate.reasonCodes,
      observed_through: estimate.observedThrough,
      updated_at: new Date().toISOString(),
    }]),
  });
  return Boolean(response?.ok);
}

/**
 * Append a learner-owned self-confidence signal to the Study evidence ledger.
 * It intentionally stores neither `correct` nor `score`: a browser self-report
 * is useful context, but it must never become proof of mastery.
 */
export async function recordStudySelfConfidenceEvent(entry: {
  userSub: string;
  eventKey: string;
  conceptKey: string;
  conceptLabel: string;
  sessionId: string;
  selfConfidence: number;
  observedAt: string;
}): Promise<StudyEvidenceWriteResult> {
  if (!config()) return { status: "unavailable" };

  const byKey = await request(
    `study_concepts?select=id&canonical_key=eq.${encodeURIComponent(entry.conceptKey)}&status=eq.active&order=updated_at.desc&limit=1`,
    { method: "GET" },
  );
  let conceptId = "";
  if (byKey) {
    try {
      const rows = await byKey.json();
      conceptId = Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : "";
    } catch { /* try the canonical label below */ }
  }

  if (!conceptId) {
    const byLabel = await request(
      `study_concepts?select=id&label=ilike.${encodeURIComponent(entry.conceptLabel)}&status=eq.active&order=updated_at.desc&limit=1`,
      { method: "GET" },
    );
    if (!byLabel) return { status: "unavailable" };
    try {
      const rows = await byLabel.json();
      conceptId = Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : "";
    } catch { return { status: "unavailable" }; }
  }
  if (!conceptId) return { status: "unmapped" };

  const response = await requestRaw("study_mastery_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      event_key: entry.eventKey,
      user_sub: entry.userSub,
      concept_id: conceptId,
      event_kind: "self_confidence",
      correct: null,
      score: null,
      self_confidence: entry.selfConfidence,
      independent: true,
      provenance: "connected_source",
      source_ref: "quantora:study-tutor:self-report",
      assessment_ref: `session:${entry.sessionId}`,
      observed_at: entry.observedAt,
    }]),
  });
  if (!response) return { status: "unavailable" };
  if (response.ok) return { status: "saved" };
  if (response.status === 409) return { status: "duplicate" };
  console.warn(`Supabase POST study_mastery_events -> ${response.status}`, await response.text());
  return { status: "unavailable" };
}

/*
 * Anonymous model-quality signal. No account id, prompt, response, API key or
 * IP address is stored. This is intentionally operational data only: did a
 * model complete, was a fallback needed, and did the user mark it useful?
 */
export function recordModelQualityEvent(entry: {
  requestId: string;
  modelId: string;
  taskCategory: string;
  outcome: "success" | "failure" | "helpful" | "not_helpful";
  latencyMs?: number | null;
  fallbackFrom?: string | null;
}): void {
  void request("model_quality_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      request_id: entry.requestId,
      model_id: entry.modelId,
      task_category: entry.taskCategory,
      outcome: entry.outcome,
      latency_ms: entry.latencyMs ?? null,
      fallback_from: entry.fallbackFrom || null,
    }]),
  });
}

/* Real counts for the admin dashboard, replacing fabricated values. */
export async function getGrowthSummary(): Promise<{
  totalUsers: number; newUsers7d: number; activeUsers7d: number;
  requests7d: number; billableRequests7d: number;
} | null> {
  const cfg = config();
  if (!cfg) return null;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const countOf = async (path: string) => {
    const res = await request(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
    if (!res) return 0;
    const range = res.headers.get("content-range");
    return range ? Number(range.split("/")[1]) || 0 : 0;
  };

  const [totalUsers, newUsers7d, requests7d, billableRequests7d] = await Promise.all([
    countOf("users?select=google_sub"),
    countOf(`users?select=google_sub&created_at=gte.${since}`),
    countOf(`usage?select=id&created_at=gte.${since}`),
    countOf(`usage?select=id&created_at=gte.${since}&used_server_key=is.true`),
  ]);

  // Distinct actives needs rows rather than a count header.
  let activeUsers7d = 0;
  const activeRes = await request(`usage?select=user_sub&created_at=gte.${since}&user_sub=not.is.null`, { method: "GET" });
  if (activeRes) {
    try {
      const rows = (await activeRes.json()) as Array<{ user_sub: string }>;
      activeUsers7d = new Set(rows.map((r) => r.user_sub)).size;
    } catch { /* leave at 0 */ }
  }

  return { totalUsers, newUsers7d, activeUsers7d, requests7d, billableRequests7d };
}

/*
 * Daily aggregates, straight from the views.
 *
 * Aggregating in Postgres rather than pulling rows and summing in JavaScript.
 * The previous dashboard fetched the most recent 50 telemetry rows and
 * presented their token sum as a lifetime total — a number that was neither
 * the total nor labelled as a sample, and which stopped growing once the table
 * passed fifty rows.
 */
export async function getDailySeries(days = 14): Promise<{
  growth: Array<{ day: string; signups: number }>;
  usage: Array<{
    day: string; requests: number; active_users: number;
    billable_requests: number; tokens_est: number; avg_latency_ms: number;
  }>;
} | null> {
  if (!config()) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [growthRes, usageRes] = await Promise.all([
    request(`growth_daily?select=*&day=gte.${since}&order=day.desc`, { method: "GET" }),
    request(`usage_daily?select=*&day=gte.${since}&order=day.desc`, { method: "GET" }),
  ]);

  const parse = async (res: Response | null) => {
    if (!res) return [];
    try { return (await res.json()) as any[]; } catch { return []; }
  };

  return { growth: await parse(growthRes), usage: await parse(usageRes) };
}

/* Is this account flagged as an admin? Null when the store is unreachable. */
export async function isAdminUser(googleSub: string): Promise<boolean | null> {
  if (!config()) return null;
  const res = await request(`users?select=is_admin&google_sub=eq.${encodeURIComponent(googleSub)}`, { method: "GET" });
  if (!res) return null;
  try {
    const rows = (await res.json()) as Array<{ is_admin: boolean }>;
    return rows.length ? rows[0].is_admin === true : false;
  } catch {
    return null;
  }
}

/* ── Privacy / data control (Roadmap 0.2) ─────────────────────────────────────
 * A user owns their footprint: they can export everything we hold about them
 * and erase it. These do NOT fail soft — a privacy action that silently no-ops
 * would be worse than an honest error, so callers surface unavailability.
 */

/** Everything we store keyed to this account, for a "download my data" export. */
export async function exportUserData(googleSub: string): Promise<Record<string, unknown> | null> {
  if (!config() || !googleSub) return null;
  const sub = encodeURIComponent(googleSub);
  const get = async (path: string) => {
    const res = await requestRaw(path, { method: "GET" });
    if (!res || !res.ok) return null; // null = a query failed; caller aborts
    try { return (await res.json()) as any[]; } catch { return null; }
  };

  const [profile, usage, events, sites, states] = await Promise.all([
    get(`users?select=google_sub,email,name,picture,created_at,last_seen_at,sign_in_count&google_sub=eq.${sub}`),
    get(`usage?select=provider,model_id,latency_ms,tokens_est,used_server_key,created_at&user_sub=eq.${sub}&order=created_at.desc`),
    get(`product_events?select=event_type,metadata,created_at&user_sub=eq.${sub}&order=created_at.desc`),
    get(`published_sites?select=project_name,deployment_url,created_at,updated_at&user_sub=eq.${sub}&order=created_at.desc`),
    get(`outcome_states?select=session_id,version,state,created_at,updated_at&user_sub=eq.${sub}&order=updated_at.desc`),
  ]);

  // If any table read failed outright, refuse to hand back a partial export
  // that the user might mistake for complete.
  if ([profile, usage, events, sites, states].some((v) => v === null)) return null;

  return {
    exported_at: new Date().toISOString(),
    account: profile![0] ?? null,
    usage: usage!,
    product_events: events!,
    published_sites: sites!,
    outcome_states: states!,
  };
}

/**
 * Hard-delete this account's footprint. Deleting the users row cascades to
 * outcome_states (living memory) and published_sites (ownership records), and
 * nulls user_sub on usage / product_events (anonymized, not lost). Live
 * published deployments are intentionally left running — dropping ownership
 * does not take a visitor-facing URL offline.
 * Returns true on success, false if the store is unreachable / the delete failed.
 */
export async function deleteUserData(googleSub: string): Promise<boolean> {
  if (!config() || !googleSub) return false;
  const res = await requestRaw(
    `users?google_sub=eq.${encodeURIComponent(googleSub)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  return Boolean(res && res.ok);
}

/**
 * Retention TTL: purge telemetry rows older than `days`. Run from a cron.
 * Returns null if the store is unreachable. usage / product_events hold no
 * prompt or response bodies — only operational metadata — so this is a
 * footprint-minimization sweep, not a functional dependency.
 */
export async function purgeOldTelemetry(days: number): Promise<{ ok: boolean }> {
  if (!config()) return { ok: false };
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const before = `created_at=lt.${encodeURIComponent(cutoff)}`;
  const [u, e, s] = await Promise.all([
    requestRaw(`usage?${before}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
    requestRaw(`product_events?${before}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
    requestRaw(`suggestion_events?${before}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
  ]);
  return { ok: Boolean(u && u.ok && e && e.ok && s && s.ok) };
}
