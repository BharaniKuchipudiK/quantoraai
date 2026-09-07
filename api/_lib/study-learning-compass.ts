import { resolveActiveStudyConcept } from './store.js';
import { loadVerifiedStudyLearnerProjection } from './study-learner-projection-loader.js';
import {
  rankStudyLearningPriorities,
  type StudyLearningCurriculumSignal,
  type StudyLearningPriorityCandidate,
  type StudyLearningPriorityResult,
} from './study-learning-priority.js';
import { readStudySupabaseRows } from './study-supabase.js';

export const STUDY_LEARNING_COMPASS_VERSION = 'study-learning-compass-2026-09-07.1';
export const STUDY_LEARNING_COMPASS_MAX_FRONTIER = 9;
export const STUDY_LEARNING_COMPASS_MAX_RECOMMENDATIONS = 5;
const MIN_PREREQUISITE_CONFIDENCE = 0.8;
const MAX_RELATED_EDGES = 24;
const MAX_DOWNSTREAM_EDGES = 100;
const MAX_ACTIVE_CURRICULA = 20;

type StudyCompassConcept = {
  id: string;
  canonicalKey: string;
  label: string;
};

type StudyCompassEdge = {
  sourceConceptId: string;
  targetConceptId: string;
  confidence: number;
};

type StudyCompassMapping = {
  conceptId: string;
  curriculumId: string;
  examWeight: number | null;
  confidence: number;
};

export type StudyLearningCompassRequest = {
  conceptKey: string;
  conceptLabel: string;
  availableMinutes: number | null;
};

export type StudyLearningCompassRecommendation = StudyLearningPriorityResult['recommendations'][number] & {
  label: string;
};

export type StudyLearningCompassResult =
  | {
      status: 'ok';
      version: string;
      scope: 'active_neighborhood';
      activeConcept: StudyCompassConcept;
      recommendations: StudyLearningCompassRecommendation[];
      skipped: Array<{ conceptId: string; reasonCode: string }>;
      asOf: string;
      availableMinutes: number | null;
      frontierSize: number;
      loadedCandidateCount: number;
    }
  | { status: 'unmapped' }
  | { status: 'unavailable'; reasonCode: string };

type ProjectionLoader = typeof loadVerifiedStudyLearnerProjection;
type PriorityRanker = typeof rankStudyLearningPriorities;

type StudyLearningCompassDependencies = {
  resolveConcept: typeof resolveActiveStudyConcept;
  readRows: typeof readStudySupabaseRows;
  loadProjection: ProjectionLoader;
  rank: PriorityRanker;
};

const DEFAULT_DEPENDENCIES: StudyLearningCompassDependencies = {
  resolveConcept: resolveActiveStudyConcept,
  readRows: readStudySupabaseRows,
  loadProjection: loadVerifiedStudyLearnerProjection,
  rank: rankStudyLearningPriorities,
};

function bounded(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

function boundedMinutes(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(5, Math.min(240, Math.round(numeric)));
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uuidish(value: unknown): string {
  const normalized = text(value, 64).toLowerCase();
  return /^[0-9a-f-]{36}$/.test(normalized) ? normalized : '';
}

function inFilter(values: string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(',');
}

export function normalizeStudyLearningCompassRequest(value: unknown): StudyLearningCompassRequest | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const conceptKey = text(input.conceptKey, 160);
  const conceptLabel = text(input.conceptLabel, 300);
  if (!conceptKey || !conceptLabel) return null;
  const providedMinutes = input.availableMinutes;
  if (providedMinutes != null && providedMinutes !== '' && !Number.isFinite(Number(providedMinutes))) return null;
  return {
    conceptKey,
    conceptLabel,
    availableMinutes: boundedMinutes(providedMinutes),
  };
}

function conceptRow(value: unknown): StudyCompassConcept | null {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const id = uuidish(row.id);
  const canonicalKey = text(row.canonical_key, 160);
  const label = text(row.label, 300);
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}

function edgeRow(value: unknown): StudyCompassEdge | null {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sourceConceptId = uuidish(row.source_concept_id);
  const targetConceptId = uuidish(row.target_concept_id);
  const confidence = bounded(row.confidence);
  if (!sourceConceptId || !targetConceptId || confidence < MIN_PREREQUISITE_CONFIDENCE) return null;
  return { sourceConceptId, targetConceptId, confidence };
}

function mappingRow(value: unknown): StudyCompassMapping | null {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const conceptId = uuidish(row.concept_id);
  const curriculumId = uuidish(row.curriculum_id);
  if (!conceptId || !curriculumId) return null;
  const examWeight = typeof row.exam_weight === 'number' && Number.isFinite(row.exam_weight)
    ? bounded(row.exam_weight)
    : null;
  return {
    conceptId,
    curriculumId,
    examWeight,
    confidence: bounded(row.confidence),
  };
}

function bestCurriculumSignals(rows: StudyCompassMapping[]): Map<string, StudyLearningCurriculumSignal> {
  const byConcept = new Map<string, StudyCompassMapping[]>();
  for (const row of rows) {
    const current = byConcept.get(row.conceptId) || [];
    current.push(row);
    byConcept.set(row.conceptId, current);
  }
  const result = new Map<string, StudyLearningCurriculumSignal>();
  for (const [conceptId, candidates] of byConcept.entries()) {
    const best = [...candidates].sort((left, right) => {
      const leftMapped = left.examWeight == null ? 0 : 1;
      const rightMapped = right.examWeight == null ? 0 : 1;
      return rightMapped - leftMapped
        || right.confidence - left.confidence
        || (right.examWeight ?? -1) - (left.examWeight ?? -1)
        || left.curriculumId.localeCompare(right.curriculumId);
    })[0];
    if (best) result.set(conceptId, { examWeight: best.examWeight, confidence: best.confidence });
  }
  return result;
}

async function readConcepts(
  ids: string[],
  readRows: StudyLearningCompassDependencies['readRows'],
): Promise<StudyCompassConcept[] | null> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const filter = unique.length === 1
    ? `id=eq.${encodeURIComponent(unique[0])}`
    : `id=in.(${inFilter(unique)})`;
  const rows = await readRows(
    `study_concepts?select=id,canonical_key,label&${filter}&status=eq.active&limit=${unique.length}`,
    { operation: 'learning_compass_concept_read' },
  );
  if (rows === null) return null;
  return rows.map(conceptRow).filter((concept): concept is StudyCompassConcept => Boolean(concept));
}

async function readFrontier(
  active: StudyCompassConcept,
  readRows: StudyLearningCompassDependencies['readRows'],
): Promise<{ concepts: StudyCompassConcept[]; edges: StudyCompassEdge[] } | null> {
  const relatedRows = await readRows(
    `study_concept_edges?select=source_concept_id,target_concept_id,confidence&relation=eq.prerequisite_of&confidence=gte.${MIN_PREREQUISITE_CONFIDENCE}&or=(source_concept_id.eq.${encodeURIComponent(active.id)},target_concept_id.eq.${encodeURIComponent(active.id)})&order=confidence.desc,source_concept_id.asc,target_concept_id.asc&limit=${MAX_RELATED_EDGES}`,
    { operation: 'learning_compass_frontier_edges' },
  );
  if (relatedRows === null) return null;
  const relatedEdges = relatedRows.map(edgeRow).filter((edge): edge is StudyCompassEdge => Boolean(edge));
  const relevance = new Map<string, number>([[active.id, 1]]);
  for (const edge of relatedEdges) {
    const other = edge.sourceConceptId === active.id ? edge.targetConceptId : edge.sourceConceptId;
    relevance.set(other, Math.max(relevance.get(other) || 0, edge.confidence));
  }
  const connectedIds = [...relevance.keys()].filter((id) => id !== active.id);
  const connected = await readConcepts(connectedIds, readRows);
  if (connected === null) return null;
  const concepts = [active, ...connected
    .sort((left, right) => (relevance.get(right.id) || 0) - (relevance.get(left.id) || 0)
      || left.canonicalKey.localeCompare(right.canonicalKey))]
    .slice(0, STUDY_LEARNING_COMPASS_MAX_FRONTIER);
  return { concepts, edges: relatedEdges };
}

async function readDownstream(
  concepts: StudyCompassConcept[],
  readRows: StudyLearningCompassDependencies['readRows'],
): Promise<Map<string, Array<{ conceptId: string; edgeConfidence: number }>> | null> {
  const conceptIds = concepts.map((concept) => concept.id);
  if (!conceptIds.length) return new Map();
  const sourceFilter = conceptIds.length === 1
    ? `source_concept_id=eq.${encodeURIComponent(conceptIds[0])}`
    : `source_concept_id=in.(${inFilter(conceptIds)})`;
  const edgeRows = await readRows(
    `study_concept_edges?select=source_concept_id,target_concept_id,confidence&relation=eq.prerequisite_of&confidence=gte.${MIN_PREREQUISITE_CONFIDENCE}&${sourceFilter}&order=source_concept_id.asc,confidence.desc,target_concept_id.asc&limit=${MAX_DOWNSTREAM_EDGES}`,
    { operation: 'learning_compass_downstream_edges' },
  );
  if (edgeRows === null) return null;
  const edges = edgeRows.map(edgeRow).filter((edge): edge is StudyCompassEdge => Boolean(edge));
  const targetIds = [...new Set(edges.map((edge) => edge.targetConceptId))];
  const activeTargets = await readConcepts(targetIds, readRows);
  if (activeTargets === null) return null;
  const activeTargetIds = new Set(activeTargets.map((concept) => concept.id));
  const bySource = new Map<string, Array<{ conceptId: string; edgeConfidence: number }>>();
  for (const concept of concepts) bySource.set(concept.id, []);
  for (const edge of edges) {
    if (!activeTargetIds.has(edge.targetConceptId)) continue;
    const current = bySource.get(edge.sourceConceptId);
    if (!current) continue;
    current.push({ conceptId: edge.targetConceptId, edgeConfidence: edge.confidence });
  }
  return bySource;
}

async function readCurriculumSignals(
  concepts: StudyCompassConcept[],
  readRows: StudyLearningCompassDependencies['readRows'],
): Promise<Map<string, StudyLearningCurriculumSignal> | null> {
  const curriculaRows = await readRows(
    `study_curricula?select=id&status=eq.active&order=curriculum_key.asc&limit=${MAX_ACTIVE_CURRICULA}`,
    { operation: 'learning_compass_active_curricula' },
  );
  if (curriculaRows === null) return null;
  const curriculumIds = curriculaRows.map((row: any) => uuidish(row?.id)).filter(Boolean);
  if (!curriculumIds.length || !concepts.length) return new Map();
  const conceptIds = concepts.map((concept) => concept.id);
  const conceptFilter = conceptIds.length === 1
    ? `concept_id=eq.${encodeURIComponent(conceptIds[0])}`
    : `concept_id=in.(${inFilter(conceptIds)})`;
  const curriculumFilter = curriculumIds.length === 1
    ? `curriculum_id=eq.${encodeURIComponent(curriculumIds[0])}`
    : `curriculum_id=in.(${inFilter(curriculumIds)})`;
  const rows = await readRows(
    `study_curriculum_mappings?select=concept_id,curriculum_id,exam_weight,confidence&${conceptFilter}&${curriculumFilter}&order=concept_id.asc,confidence.desc,curriculum_id.asc&limit=${Math.max(20, conceptIds.length * curriculumIds.length)}`,
    { operation: 'learning_compass_curriculum_mappings' },
  );
  if (rows === null) return null;
  return bestCurriculumSignals(rows.map(mappingRow).filter((row): row is StudyCompassMapping => Boolean(row)));
}

/**
 * Build a bounded, read-only Learning Compass around the learner's active concept.
 * The ranking engine never owns learner truth: every candidate is reconstructed
 * through the canonical verified projection loader and canonical mastery estimate.
 */
export async function buildStudyLearningCompass(input: {
  userSub: string;
  request: StudyLearningCompassRequest;
  asOf?: string;
}, dependencies: StudyLearningCompassDependencies = DEFAULT_DEPENDENCIES): Promise<StudyLearningCompassResult> {
  const asOfMillis = input.asOf ? Date.parse(input.asOf) : Date.now();
  if (!Number.isFinite(asOfMillis)) return { status: 'unavailable', reasonCode: 'invalid_reference_time' };
  const asOf = new Date(asOfMillis).toISOString();

  const resolved = await dependencies.resolveConcept({
    conceptKey: input.request.conceptKey,
    conceptLabel: input.request.conceptLabel,
  });
  if (resolved === 'unavailable') return { status: 'unavailable', reasonCode: 'concept_store_unavailable' };
  if (!resolved) return { status: 'unmapped' };
  const activeConcept: StudyCompassConcept = {
    id: resolved.id,
    canonicalKey: resolved.canonicalKey,
    label: resolved.label,
  };

  const frontier = await readFrontier(activeConcept, dependencies.readRows);
  if (!frontier) return { status: 'unavailable', reasonCode: 'concept_graph_unavailable' };
  const downstream = await readDownstream(frontier.concepts, dependencies.readRows);
  if (!downstream) return { status: 'unavailable', reasonCode: 'downstream_graph_unavailable' };
  const curriculum = await readCurriculumSignals(frontier.concepts, dependencies.readRows);
  if (!curriculum) return { status: 'unavailable', reasonCode: 'curriculum_store_unavailable' };

  const candidates: StudyLearningPriorityCandidate[] = [];
  const serviceSkipped: Array<{ conceptId: string; reasonCode: string }> = [];
  for (const concept of frontier.concepts) {
    const loaded = await dependencies.loadProjection({
      userSub: input.userSub,
      conceptId: concept.id,
      conceptKey: concept.canonicalKey,
      asOf,
    });
    if (!loaded) {
      serviceSkipped.push({ conceptId: concept.id, reasonCode: 'verified_projection_unavailable' });
      continue;
    }
    candidates.push({
      conceptId: concept.id,
      conceptKey: concept.canonicalKey,
      learnerModel: loaded.projection.learnerModel,
      masteryEstimate: loaded.masteryEstimate,
      curriculum: curriculum.get(concept.id) || null,
      downstream: downstream.get(concept.id) || [],
      lastPracticedAt: loaded.projection.observedThrough,
    });
  }
  if (!candidates.length) return { status: 'unavailable', reasonCode: 'learner_projection_unavailable' };

  const ranked = dependencies.rank({
    candidates,
    asOf,
    availableMinutes: input.request.availableMinutes,
    limit: STUDY_LEARNING_COMPASS_MAX_RECOMMENDATIONS,
  });
  const labels = new Map(frontier.concepts.map((concept) => [concept.id, concept.label]));
  return {
    status: 'ok',
    version: STUDY_LEARNING_COMPASS_VERSION,
    scope: 'active_neighborhood',
    activeConcept,
    recommendations: ranked.recommendations.map((recommendation) => ({
      ...recommendation,
      label: labels.get(recommendation.conceptId) || recommendation.conceptKey || 'Study concept',
    })),
    skipped: [...serviceSkipped, ...ranked.skipped],
    asOf,
    availableMinutes: ranked.availableMinutes,
    frontierSize: frontier.concepts.length,
    loadedCandidateCount: candidates.length,
  };
}