import {
  normalizeStudyMasteryEvidenceEvent,
  normalizeStudyMasteryEvidenceEvents,
  normalizeStudyTruthSnapshot,
  prerequisiteIdsFor,
  curriculumRefsFor,
  validateStudyTruthSnapshot,
  type StudyMasteryEvidenceEvent,
  type StudyTruthSnapshot,
} from "./study-truth-layer.js";
import {
  estimateStudyMastery,
  type StudyMasteryEstimate,
} from "./study-mastery-estimator.js";
import {
  buildStudyAdvisorCandidate,
  type StudyConcept,
  type StudyMasteryEvidence,
} from "./study-mastery-intelligence.js";
import type { AdvisorAssessmentCandidate, AdvisorDomainAdapter, AdvisorRequest } from "./pcl-advisor-intelligence.js";

export const STUDY_REPOSITORY_VERSION = "study-repository-2026-08-20.1";

const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_GRAPH_ROWS = 5_000;
const MAX_EDGE_ROWS = 12_000;
const MAX_MAPPING_ROWS = 12_000;
const MAX_EVENTS_PER_CONCEPT = 2_000;

export type StudyRepositoryDependencies = {
  fetchFn?: typeof fetch;
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
  timeoutMs?: number;
  now?: () => Date;
};

export type StudyTruthReadResult =
  | { status: "ready"; snapshot: StudyTruthSnapshot; issues: [] }
  | { status: "invalid"; snapshot: StudyTruthSnapshot | null; issues: string[] }
  | { status: "unavailable"; snapshot: null; issues: string[] };

export type StudyEvidenceAppendResult = {
  status: "stored" | "duplicate" | "invalid" | "unavailable";
  eventKey?: string | null;
  conceptId?: string | null;
  reason?: string | null;
};

export type StudyMasteryRecomputeResult = {
  status: "stored" | "invalid" | "unavailable";
  estimate?: StudyMasteryEstimate | null;
  reason?: string | null;
};

export type StudyRepositoryAdvisorContext = {
  userSub: string;
  targetConceptIds: string[];
  horizon?: string | null;
  estimatedMinutesByConcept?: Record<string, number>;
};

type StudyConceptRow = {
  id: string;
  canonical_key: string;
  content_version: string;
  subject: string;
  label: string;
  description?: string | null;
  status: string;
  provenance: string;
  confidence: number;
  source_ref?: string | null;
  license_ref?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  updated_at?: string | null;
};

type StudyEdgeRow = {
  source_concept_id: string;
  target_concept_id: string;
  relation: string;
  confidence: number;
  provenance: string;
  source_ref?: string | null;
};

type StudyCurriculumRow = {
  id: string;
  curriculum_key: string;
  jurisdiction: string;
  authority: string;
  name: string;
  version: string;
  status: string;
  source_ref: string;
  effective_from?: string | null;
  effective_until?: string | null;
};

type StudyMappingRow = {
  curriculum_id: string;
  concept_id: string;
  objective_code?: string | null;
  stage?: string | null;
  depth: number;
  exam_weight?: number | null;
  confidence: number;
  source_ref: string;
};

type StudyEstimateRow = {
  concept_id: string;
  status: string;
  mastery?: number | null;
  confidence: number;
  retention?: number | null;
  misconception_risk: number;
  evidence_count: number;
  effective_evidence_weight: number;
  estimator_version: string;
  reason_codes?: string[] | null;
  observed_through?: string | null;
};

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanUserSub(value: unknown): string | null {
  const userSub = clean(value, 300);
  return userSub && !/[\u0000-\u001f]/.test(userSub) ? userSub : null;
}

function cleanCanonicalId(value: unknown): string | null {
  const id = clean(value, 160).toLowerCase();
  return id && /^[a-z0-9][a-z0-9._:-]*$/.test(id) ? id : null;
}

function cleanEventKey(value: unknown): string | null {
  const key = clean(value, 200).toLowerCase();
  return key && /^[a-z0-9][a-z0-9._:-]*$/.test(key) ? key : null;
}

function config(dependencies: StudyRepositoryDependencies = {}) {
  const url = dependencies.supabaseUrl ?? process.env.SUPABASE_URL ?? null;
  const key = dependencies.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  if (!url || !key) return null;
  return {
    url: url.replace(/\/+$/, ""),
    key,
    fetchFn: dependencies.fetchFn || fetch,
    timeoutMs: Math.min(15_000, Math.max(500, dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
    now: dependencies.now || (() => new Date()),
  };
}

export function isStudyRepositoryConfigured(dependencies: StudyRepositoryDependencies = {}): boolean {
  return config(dependencies) !== null;
}

async function request(
  operation: string,
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
  dependencies: StudyRepositoryDependencies,
): Promise<Response | null> {
  const cfg = config(dependencies);
  if (!cfg) return null;
  try {
    const response = await cfg.fetchFn(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(cfg.timeoutMs)])
        : AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!response.ok) {
      console.warn(`[StudyRepository] ${operation} -> ${response.status}`);
      return null;
    }
    return response;
  } catch (error: any) {
    console.warn(`[StudyRepository] ${operation} unavailable:`, clean(error?.message, 160) || "request_failed");
    return null;
  }
}

async function jsonArray(response: Response | null): Promise<any[] | null> {
  if (!response) return null;
  try {
    const value = await response.json();
    return Array.isArray(value) ? value : value ? [value] : [];
  } catch {
    return null;
  }
}

function latestConceptRows(rows: StudyConceptRow[]): StudyConceptRow[] {
  const byKey = new Map<string, StudyConceptRow>();
  for (const row of rows) {
    const key = cleanCanonicalId(row?.canonical_key);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingAt = Date.parse(existing.updated_at || "") || 0;
    const nextAt = Date.parse(row.updated_at || "") || 0;
    if (nextAt >= existingAt) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * Reads the server-managed canonical graph and curriculum overlays. Database
 * UUIDs never leave this repository seam; PCL and domain logic use canonical
 * concept/curriculum keys only.
 */
export async function readStudyTruthSnapshot(
  dependencies: StudyRepositoryDependencies = {},
): Promise<StudyTruthReadResult> {
  if (!config(dependencies)) return { status: "unavailable", snapshot: null, issues: ["repository_not_configured"] };

  const [conceptRows, edgeRows, curriculumRows, mappingRows] = await Promise.all([
    jsonArray(await request(
      "read_concepts",
      `study_concepts?select=id,canonical_key,content_version,subject,label,description,status,provenance,confidence,source_ref,license_ref,valid_from,valid_until,updated_at&status=eq.active&order=canonical_key.asc,updated_at.desc&limit=${MAX_GRAPH_ROWS}`,
      { method: "GET" },
      dependencies,
    )),
    jsonArray(await request(
      "read_edges",
      `study_concept_edges?select=source_concept_id,target_concept_id,relation,confidence,provenance,source_ref&limit=${MAX_EDGE_ROWS}`,
      { method: "GET" },
      dependencies,
    )),
    jsonArray(await request(
      "read_curricula",
      `study_curricula?select=id,curriculum_key,jurisdiction,authority,name,version,status,source_ref,effective_from,effective_until&status=eq.active&order=curriculum_key.asc&limit=${MAX_GRAPH_ROWS}`,
      { method: "GET" },
      dependencies,
    )),
    jsonArray(await request(
      "read_curriculum_mappings",
      `study_curriculum_mappings?select=curriculum_id,concept_id,objective_code,stage,depth,exam_weight,confidence,source_ref&limit=${MAX_MAPPING_ROWS}`,
      { method: "GET" },
      dependencies,
    )),
  ]);

  if (!conceptRows || !edgeRows || !curriculumRows || !mappingRows) {
    return { status: "unavailable", snapshot: null, issues: ["study_truth_read_failed"] };
  }

  const concepts = latestConceptRows(conceptRows as StudyConceptRow[]);
  const conceptByUuid = new Map(concepts.map((row) => [clean(row.id, 80), cleanCanonicalId(row.canonical_key)] as const));
  const curricula = curriculumRows as StudyCurriculumRow[];
  const curriculumByUuid = new Map(curricula.map((row) => [clean(row.id, 80), cleanCanonicalId(row.curriculum_key)] as const));

  const snapshot = normalizeStudyTruthSnapshot({
    version: STUDY_REPOSITORY_VERSION,
    concepts: concepts.map((row) => ({
      canonicalId: row.canonical_key,
      contentVersion: row.content_version,
      subject: row.subject,
      label: row.label,
      description: row.description,
      status: row.status,
      provenance: row.provenance,
      confidence: row.confidence,
      sourceRef: row.source_ref,
      licenseRef: row.license_ref,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
    })),
    edges: (edgeRows as StudyEdgeRow[]).flatMap((row) => {
      const sourceConceptId = conceptByUuid.get(clean(row.source_concept_id, 80));
      const targetConceptId = conceptByUuid.get(clean(row.target_concept_id, 80));
      return sourceConceptId && targetConceptId ? [{
        sourceConceptId,
        targetConceptId,
        relation: row.relation,
        confidence: row.confidence,
        provenance: row.provenance,
        sourceRef: row.source_ref,
      }] : [];
    }),
    curricula: curricula.map((row) => ({
      id: row.curriculum_key,
      jurisdiction: row.jurisdiction,
      authority: row.authority,
      name: row.name,
      version: row.version,
      status: row.status,
      sourceRef: row.source_ref,
      effectiveFrom: row.effective_from,
      effectiveUntil: row.effective_until,
    })),
    mappings: (mappingRows as StudyMappingRow[]).flatMap((row) => {
      const curriculumId = curriculumByUuid.get(clean(row.curriculum_id, 80));
      const conceptId = conceptByUuid.get(clean(row.concept_id, 80));
      return curriculumId && conceptId ? [{
        curriculumId,
        conceptId,
        objectiveCode: row.objective_code,
        stage: row.stage,
        depth: row.depth,
        examWeight: row.exam_weight,
        confidence: row.confidence,
        sourceRef: row.source_ref,
      }] : [];
    }),
  });

  const validation = validateStudyTruthSnapshot(snapshot);
  if (!validation.valid) return { status: "invalid", snapshot, issues: validation.issues };
  return { status: "ready", snapshot, issues: [] };
}

async function activeConceptDbId(
  canonicalId: string,
  dependencies: StudyRepositoryDependencies,
): Promise<string | null> {
  const id = cleanCanonicalId(canonicalId);
  if (!id) return null;
  const rows = await jsonArray(await request(
    "resolve_concept",
    `study_concepts?select=id,canonical_key&canonical_key=eq.${encodeURIComponent(id)}&status=eq.active&order=updated_at.desc&limit=1`,
    { method: "GET" },
    dependencies,
  ));
  const dbId = rows?.[0]?.id;
  return typeof dbId === "string" && dbId.trim() ? dbId.trim() : null;
}

/**
 * Append exactly one structured learner observation owned by the verified
 * server-side subject. event.id becomes the per-owner idempotency key; database
 * row ids remain internal. Duplicate retries are intentionally no-ops.
 */
export async function appendStudyMasteryEvidence(
  userSubInput: string,
  rawEvent: StudyMasteryEvidenceEvent,
  dependencies: StudyRepositoryDependencies = {},
): Promise<StudyEvidenceAppendResult> {
  const userSub = cleanUserSub(userSubInput);
  const event = normalizeStudyMasteryEvidenceEvent(rawEvent);
  const eventKey = cleanEventKey(event?.id);
  if (!userSub || !event || !eventKey) return { status: "invalid", reason: "invalid_evidence_or_owner" };
  const conceptDbId = await activeConceptDbId(event.conceptId, dependencies);
  if (!conceptDbId) return { status: "unavailable", eventKey, conceptId: event.conceptId, reason: "concept_not_available" };

  const response = await request(
    "append_mastery_evidence",
    "study_mastery_events?on_conflict=user_sub,event_key",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify([{
        user_sub: userSub,
        concept_id: conceptDbId,
        event_key: eventKey,
        event_kind: event.kind,
        correct: event.correct ?? null,
        score: event.score ?? null,
        difficulty: event.difficulty ?? null,
        hints_used: event.hintsUsed,
        response_ms: event.responseMs ?? null,
        self_confidence: event.selfConfidence ?? null,
        independent: event.independent,
        misconception_signal: event.misconceptionSignal,
        delay_days: event.delayDays ?? null,
        provenance: event.provenance,
        source_ref: event.sourceRef || null,
        assessment_ref: event.assessmentRef || null,
        item_ref: event.itemRef || null,
        observed_at: event.observedAt,
      }]),
    },
    dependencies,
  );
  const rows = await jsonArray(response);
  if (!rows) return { status: "unavailable", eventKey, conceptId: event.conceptId, reason: "evidence_write_failed" };
  return {
    status: rows.length ? "stored" : "duplicate",
    eventKey,
    conceptId: event.conceptId,
    reason: rows.length ? null : "idempotent_duplicate_ignored",
  };
}

export async function readStudyMasteryEvidence(
  userSubInput: string,
  conceptIdInput: string,
  dependencies: StudyRepositoryDependencies = {},
): Promise<StudyMasteryEvidenceEvent[]> {
  const userSub = cleanUserSub(userSubInput);
  const conceptId = cleanCanonicalId(conceptIdInput);
  if (!userSub || !conceptId) return [];
  const conceptDbId = await activeConceptDbId(conceptId, dependencies);
  if (!conceptDbId) return [];
  const rows = await jsonArray(await request(
    "read_mastery_evidence",
    `study_mastery_events?select=event_key,event_kind,correct,score,difficulty,hints_used,response_ms,self_confidence,independent,misconception_signal,delay_days,provenance,source_ref,assessment_ref,item_ref,observed_at&user_sub=eq.${encodeURIComponent(userSub)}&concept_id=eq.${encodeURIComponent(conceptDbId)}&order=observed_at.asc&limit=${MAX_EVENTS_PER_CONCEPT}`,
    { method: "GET" },
    dependencies,
  ));
  if (!rows) return [];
  return normalizeStudyMasteryEvidenceEvents(rows.map((row: any) => ({
    id: row.event_key,
    conceptId,
    kind: row.event_kind,
    correct: row.correct,
    score: row.score,
    difficulty: row.difficulty,
    hintsUsed: row.hints_used,
    responseMs: row.response_ms,
    selfConfidence: row.self_confidence,
    independent: row.independent,
    misconceptionSignal: row.misconception_signal,
    delayDays: row.delay_days,
    provenance: row.provenance,
    sourceRef: row.source_ref,
    assessmentRef: row.assessment_ref,
    itemRef: row.item_ref,
    observedAt: row.observed_at,
  })));
}

/** Recompute derived mastery from the append-only ledger, then upsert the cache. */
export async function recomputeStudyMastery(
  userSubInput: string,
  conceptIdInput: string,
  dependencies: StudyRepositoryDependencies = {},
): Promise<StudyMasteryRecomputeResult> {
  const userSub = cleanUserSub(userSubInput);
  const conceptId = cleanCanonicalId(conceptIdInput);
  if (!userSub || !conceptId) return { status: "invalid", reason: "invalid_owner_or_concept" };
  const conceptDbId = await activeConceptDbId(conceptId, dependencies);
  if (!conceptDbId) return { status: "unavailable", reason: "concept_not_available" };
  const events = await readStudyMasteryEvidence(userSub, conceptId, dependencies);
  const now = config(dependencies)?.now() || new Date();
  const estimate = estimateStudyMastery({ conceptId, events, now });

  const response = await request(
    "upsert_mastery_estimate",
    "study_mastery_estimates?on_conflict=user_sub,concept_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        user_sub: userSub,
        concept_id: conceptDbId,
        status: estimate.status,
        mastery: estimate.mastery,
        confidence: estimate.confidence,
        retention: estimate.retention,
        misconception_risk: estimate.misconceptionRisk,
        evidence_count: estimate.evidenceCount,
        effective_evidence_weight: estimate.effectiveEvidenceWeight,
        estimator_version: estimate.estimatorVersion,
        reason_codes: estimate.reasonCodes,
        observed_through: estimate.observedThrough,
        updated_at: now.toISOString(),
      }]),
    },
    dependencies,
  );
  if (!response) return { status: "unavailable", estimate, reason: "mastery_cache_write_failed" };
  return { status: "stored", estimate, reason: null };
}

async function readStoredMasteryEstimates(
  userSubInput: string,
  snapshot: StudyTruthSnapshot,
  dependencies: StudyRepositoryDependencies,
): Promise<StudyMasteryEvidence[]> {
  const userSub = cleanUserSub(userSubInput);
  if (!userSub) return [];
  const rows = await jsonArray(await request(
    "read_mastery_estimates",
    `study_mastery_estimates?select=concept_id,status,mastery,confidence,retention,misconception_risk,evidence_count,effective_evidence_weight,estimator_version,reason_codes,observed_through&user_sub=eq.${encodeURIComponent(userSub)}&limit=${MAX_GRAPH_ROWS}`,
    { method: "GET" },
    dependencies,
  ));
  if (!rows?.length) return [];

  const conceptRows = await jsonArray(await request(
    "resolve_mastery_concepts",
    `study_concepts?select=id,canonical_key&status=eq.active&limit=${MAX_GRAPH_ROWS}`,
    { method: "GET" },
    dependencies,
  ));
  if (!conceptRows) return [];
  const byUuid = new Map(conceptRows.map((row: any) => [clean(row.id, 80), cleanCanonicalId(row.canonical_key)] as const));
  const validConcepts = new Set(snapshot.concepts.map((item) => item.canonicalId));

  return (rows as StudyEstimateRow[]).flatMap((row) => {
    const conceptId = byUuid.get(clean(row.concept_id, 80));
    if (!conceptId || !validConcepts.has(conceptId) || row.status === "insufficient_evidence" || row.mastery == null) return [];
    return [{
      conceptId,
      mastery: Math.max(0, Math.min(1, Number(row.mastery) || 0)),
      confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
      retention: row.retention == null ? null : Math.max(0, Math.min(1, Number(row.retention) || 0)),
      selfConfidence: null,
      misconception: Number(row.misconception_risk) >= 0.7,
      attempts: Math.max(0, Number(row.evidence_count) || 0),
      sourceRefs: [],
      observedAt: row.observed_through || null,
    } satisfies StudyMasteryEvidence];
  });
}

function studyConceptsForAdvisor(snapshot: StudyTruthSnapshot): StudyConcept[] {
  return snapshot.concepts.map((concept) => {
    const mappings = snapshot.mappings.filter((mapping) => mapping.conceptId === concept.canonicalId);
    const examWeight = mappings.reduce((max, mapping) => Math.max(max, mapping.examWeight ?? 0), 0);
    return {
      id: concept.canonicalId,
      label: concept.label,
      prerequisiteIds: prerequisiteIdsFor(snapshot, concept.canonicalId),
      curriculumRefs: curriculumRefsFor(snapshot, concept.canonicalId),
      examWeight: examWeight || 0.5,
    };
  });
}

export async function buildStudyAdvisorCandidateFromRepository(
  request: AdvisorRequest,
  dependencies: StudyRepositoryDependencies = {},
): Promise<AdvisorAssessmentCandidate> {
  const context = request.context && typeof request.context === "object"
    ? request.context as Partial<StudyRepositoryAdvisorContext>
    : {};
  const userSub = cleanUserSub(context.userSub);
  const targetConceptIds = Array.isArray(context.targetConceptIds)
    ? [...new Set(context.targetConceptIds.map(cleanCanonicalId).filter((value): value is string => Boolean(value)))].slice(0, 20)
    : [];
  if (!userSub || !targetConceptIds.length) throw new Error("study_advisor_requires_verified_owner_and_target_concepts");

  const truth = await readStudyTruthSnapshot(dependencies);
  if (truth.status !== "ready") throw new Error(truth.status === "invalid" ? "study_truth_invalid" : "study_truth_unavailable");
  const mastery = await readStoredMasteryEstimates(userSub, truth.snapshot, dependencies);
  return buildStudyAdvisorCandidate({
    goalLabel: clean(request.goal, 400) || "Improve learning mastery",
    targetConceptIds,
    concepts: studyConceptsForAdvisor(truth.snapshot),
    evidence: mastery,
    horizon: clean(context.horizon, 120) || null,
    estimatedMinutesByConcept: context.estimatedMinutesByConcept,
  });
}

export function createStudyRepositoryAdvisorAdapter(
  dependencies: StudyRepositoryDependencies = {},
): AdvisorDomainAdapter {
  return {
    id: "study-repository",
    domain: "education",
    priority: 50,
    isAvailable: () => isStudyRepositoryConfigured(dependencies),
    assess: (request) => buildStudyAdvisorCandidateFromRepository(request, dependencies),
  };
}
