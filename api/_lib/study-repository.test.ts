import assert from "node:assert/strict";
import test from "node:test";
import {
  appendStudyMasteryEvidence,
  buildStudyAdvisorCandidateFromRepository,
  createStudyRepositoryAdvisorAdapter,
  readStudyTruthSnapshot,
  recomputeStudyMastery,
  type StudyRepositoryDependencies,
} from "./study-repository.js";

const BASE = "https://example.supabase.co";
const KEY = "server-secret";
const NOW = new Date("2026-08-20T12:00:00Z");

function json(value: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: status === 204 ? undefined : { "Content-Type": "application/json" },
  });
}

function deps(fetchFn: typeof fetch): StudyRepositoryDependencies {
  return {
    fetchFn,
    supabaseUrl: BASE,
    serviceRoleKey: KEY,
    now: () => NOW,
  };
}

const conceptRows = [
  { id: "00000000-0000-0000-0000-000000000001", canonical_key: "math.trig.components", content_version: "1", subject: "mathematics", label: "Trigonometric component interpretation", status: "active", provenance: "quantora_authored", confidence: 0.95, updated_at: "2026-08-20T01:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000002", canonical_key: "physics.vector.decomposition", content_version: "1", subject: "physics", label: "Vector decomposition", status: "active", provenance: "quantora_authored", confidence: 0.95, updated_at: "2026-08-20T01:00:00Z" },
  { id: "00000000-0000-0000-0000-000000000003", canonical_key: "physics.projectile-motion", content_version: "1", subject: "physics", label: "Projectile motion", status: "active", provenance: "quantora_authored", confidence: 0.95, updated_at: "2026-08-20T01:00:00Z" },
];

const edgeRows = [
  { source_concept_id: conceptRows[0].id, target_concept_id: conceptRows[1].id, relation: "prerequisite_of", confidence: 0.95, provenance: "quantora_authored" },
  { source_concept_id: conceptRows[1].id, target_concept_id: conceptRows[2].id, relation: "prerequisite_of", confidence: 0.95, provenance: "quantora_authored" },
];

const curriculumRows = [
  { id: "10000000-0000-0000-0000-000000000001", curriculum_key: "pilot.physics", jurisdiction: "pilot", authority: "Pilot Authority", name: "Physics Pilot", version: "2026", status: "active", source_ref: "source:pilot" },
];

const mappingRows = [
  { curriculum_id: curriculumRows[0].id, concept_id: conceptRows[2].id, objective_code: "P1", stage: "advanced", depth: 0.9, exam_weight: 0.9, confidence: 1, source_ref: "source:pilot#p1" },
];

function truthFetch(extra?: (url: URL, init?: RequestInit) => Response | null): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url.pathname.endsWith("/study_concepts")) return json(conceptRows);
    if (url.pathname.endsWith("/study_concept_edges")) return json(edgeRows);
    if (url.pathname.endsWith("/study_curricula")) return json(curriculumRows);
    if (url.pathname.endsWith("/study_curriculum_mappings")) return json(mappingRows);
    throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
  }) as typeof fetch;
}

test("repository converts database UUID graph into provider-neutral canonical truth", async () => {
  const result = await readStudyTruthSnapshot(deps(truthFetch()));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.snapshot.concepts.map((item) => item.canonicalId), [
    "math.trig.components",
    "physics.vector.decomposition",
    "physics.projectile-motion",
  ]);
  assert.deepEqual(result.snapshot.edges.map((item) => [item.sourceConceptId, item.targetConceptId]), [
    ["math.trig.components", "physics.vector.decomposition"],
    ["physics.vector.decomposition", "physics.projectile-motion"],
  ]);
  assert.equal(result.snapshot.mappings[0].curriculumId, "pilot.physics");
});

test("evidence append uses verified owner, stable idempotency key and bounded structured fields only", async () => {
  const writes: any[] = [];
  let writeCount = 0;
  const fetchFn = truthFetch((url, init) => {
    if (url.pathname.endsWith("/study_concepts") && url.searchParams.has("canonical_key")) {
      return json([{ id: conceptRows[2].id, canonical_key: conceptRows[2].canonical_key }]);
    }
    if (url.pathname.endsWith("/study_mastery_events") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push(body[0]);
      writeCount += 1;
      return json(writeCount === 1 ? [{ id: "db-row" }] : []);
    }
    return null;
  });

  const raw: any = {
    id: "attempt-42",
    conceptId: "physics.projectile-motion",
    kind: "transfer",
    correct: true,
    difficulty: 0.8,
    hintsUsed: 0,
    independent: true,
    provenance: "derived",
    sourceRef: "assessment:42",
    observedAt: "2026-08-20T11:00:00Z",
    rawAnswer: "do not persist",
    chainOfThought: "do not persist",
    userSub: "attacker-supplied-owner",
  };

  const first = await appendStudyMasteryEvidence("verified-user", raw, deps(fetchFn));
  const retry = await appendStudyMasteryEvidence("verified-user", raw, deps(fetchFn));
  assert.equal(first.status, "stored");
  assert.equal(retry.status, "duplicate");
  assert.equal(writes[0].user_sub, "verified-user");
  assert.equal(writes[0].event_key, "attempt-42");
  assert.equal(writes[0].concept_id, conceptRows[2].id);
  assert.equal(Object.prototype.hasOwnProperty.call(writes[0], "rawAnswer"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(writes[0], "chainOfThought"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(writes[0], "userSub"), false);
});

test("recompute reads the append-only ledger and upserts derived mastery with estimator provenance", async () => {
  let masteryWrite: any = null;
  const fetchFn = truthFetch((url, init) => {
    if (url.pathname.endsWith("/study_concepts") && url.searchParams.has("canonical_key")) {
      return json([{ id: conceptRows[2].id, canonical_key: conceptRows[2].canonical_key }]);
    }
    if (url.pathname.endsWith("/study_mastery_events") && init?.method === "GET") {
      return json([
        { event_key: "e1", event_kind: "retrieval", correct: true, difficulty: 0.7, hints_used: 0, independent: true, misconception_signal: false, delay_days: 7, provenance: "derived", source_ref: "assessment:e1", observed_at: "2026-08-19T10:00:00Z" },
        { event_key: "e2", event_kind: "transfer", correct: true, difficulty: 0.85, hints_used: 0, independent: true, misconception_signal: false, delay_days: 1, provenance: "derived", source_ref: "assessment:e2", observed_at: "2026-08-20T10:00:00Z" },
      ]);
    }
    if (url.pathname.endsWith("/study_mastery_estimates") && init?.method === "POST") {
      masteryWrite = JSON.parse(String(init.body))[0];
      return json([], 200);
    }
    return null;
  });

  const result = await recomputeStudyMastery("verified-user", "physics.projectile-motion", deps(fetchFn));
  assert.equal(result.status, "stored");
  assert.ok((result.estimate?.mastery || 0) > 0.5);
  assert.ok((result.estimate?.retention || 0) > 0.5);
  assert.equal(masteryWrite.user_sub, "verified-user");
  assert.equal(masteryWrite.concept_id, conceptRows[2].id);
  assert.match(masteryWrite.estimator_version, /study-mastery-estimator/);
  assert.ok(Array.isArray(masteryWrite.reason_codes));
});

test("repository-backed Advisor diagnoses an unknown prerequisite before calling a higher weak concept root cause", async () => {
  const estimateRows = [
    { concept_id: conceptRows[1].id, status: "provisional", mastery: 0.55, confidence: 0.8, retention: null, misconception_risk: 0.1, evidence_count: 2, effective_evidence_weight: 1.5, estimator_version: "v1", reason_codes: [], observed_through: "2026-08-20T10:00:00Z" },
    { concept_id: conceptRows[2].id, status: "provisional", mastery: 0.6, confidence: 0.8, retention: null, misconception_risk: 0.1, evidence_count: 2, effective_evidence_weight: 1.5, estimator_version: "v1", reason_codes: [], observed_through: "2026-08-20T10:00:00Z" },
  ];
  const fetchFn = truthFetch((url, init) => {
    if (url.pathname.endsWith("/study_mastery_estimates") && init?.method === "GET") return json(estimateRows);
    if (url.pathname.endsWith("/study_concepts") && url.searchParams.get("select") === "id,canonical_key" && !url.searchParams.has("canonical_key")) {
      return json(conceptRows.map((row) => ({ id: row.id, canonical_key: row.canonical_key })));
    }
    return null;
  });

  const candidate = await buildStudyAdvisorCandidateFromRepository({
    domain: "education",
    goal: "Master projectile motion",
    context: {
      userSub: "verified-user",
      targetConceptIds: ["physics.projectile-motion"],
    },
  }, deps(fetchFn));

  assert.ok(candidate.gaps.some((gap) => gap.kind === "evidence_gap" && gap.label.includes("Trigonometric")));
  assert.ok(candidate.interventions.some((item) => item.label.includes("diagnostic") && item.label.includes("Trigonometric")));
  assert.equal(candidate.gaps.find((gap) => gap.label === "Strengthen Vector decomposition")?.rootCause, false);
});

test("Study repository can plug directly into the shared Advisor registry contract", async () => {
  const adapter = createStudyRepositoryAdvisorAdapter(deps(truthFetch()));
  assert.equal(adapter.domain, "education");
  assert.equal(adapter.id, "study-repository");
  assert.equal(await adapter.isAvailable?.(), true);
});
