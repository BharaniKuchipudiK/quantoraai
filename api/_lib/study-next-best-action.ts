import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';
import { buildStudyLearnerModel, type StudyLearnerModel } from './study-learner-model.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';
import { readStudySupabaseRows } from './study-supabase.js';

export const STUDY_NEXT_BEST_ACTION_VERSION = 'study-next-best-action-2026-09-01.7';

const MIN_PREREQUISITE_CONFIDENCE = 0.8;
const MAX_PREREQUISITE_DEPTH = 4;
const MAX_PREREQUISITE_CONCEPTS = 12;

type StudyConceptRef = {
  id: string;
  canonicalKey: string;
  label: string;
};

type StudyPrerequisiteRef = StudyConceptRef & {
  edgeConfidence: number;
};

type StudyPrerequisiteCandidate = {
  kind: 'diagnostic' | 'recovery';
  concept: StudyPrerequisiteRef;
  model: StudyLearnerModel;
  depth: number;
};

type StudyPrerequisiteScan =
  | { status: 'ok'; candidate: StudyPrerequisiteCandidate | null }
  | { status: 'unavailable' };

type StudyScanContext = {
  userSub: string;
  inspectedPrerequisiteIds: Set<string>;
  conceptById: Map<string, StudyConceptRef | null>;
  modelByConceptId: Map<string, StudyLearnerModel>;
  prerequisitesByTargetId: Map<string, StudyPrerequisiteRef[]>;
};

function bounded(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

async function readRows(path: string): Promise<any[] | null> {
  return readStudySupabaseRows(path, { operation: 'prerequisite_graph_read' });
}

function conceptRecord(value: any): StudyConceptRef | null {
  const id = typeof value?.id === 'string' ? value.id : '';
  const canonicalKey = typeof value?.canonical_key === 'string' ? value.canonical_key : '';
  const label = typeof value?.label === 'string' ? value.label : '';
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}

async function readImmediatePrerequisites(
  targetConceptId: string,
  conceptById: Map<string, StudyConceptRef | null>,
): Promise<StudyPrerequisiteRef[] | null> {
  const edgeRows = await readRows(
    `study_concept_edges?select=source_concept_id,confidence&relation=eq.prerequisite_of&target_concept_id=eq.${encodeURIComponent(targetConceptId)}&order=confidence.desc&limit=${MAX_PREREQUISITE_CONCEPTS}`,
  );
  if (edgeRows === null) return null;

  const edges = edgeRows
    .map((row: any) => ({
      sourceConceptId: typeof row?.source_concept_id === 'string' ? row.source_concept_id : '',
      confidence: bounded(row?.confidence),
    }))
    .filter((row) => row.sourceConceptId && row.confidence >= MIN_PREREQUISITE_CONFIDENCE);
  if (!edges.length) return [];

  // The graph frontier is hard-capped before concept resolution. Multi-source
  // frontiers are resolved in one bounded PostgREST request; a one-source
  // frontier keeps the simpler exact lookup. Cache both hits and misses across
  // converging branches so the planner avoids per-sibling N+1 reads.
  const sourceIds = [...new Set(edges.map((edge) => edge.sourceConceptId))];
  const unresolvedSourceIds = sourceIds.filter((sourceId) => !conceptById.has(sourceId));
  if (unresolvedSourceIds.length) {
    const requestedIds = new Set(unresolvedSourceIds);
    const conceptPath = unresolvedSourceIds.length === 1
      ? `study_concepts?select=id,canonical_key,label&id=eq.${encodeURIComponent(unresolvedSourceIds[0])}&status=eq.active&order=updated_at.desc&limit=1`
      : `study_concepts?select=id,canonical_key,label&id=in.(${unresolvedSourceIds.map((sourceId) => encodeURIComponent(sourceId)).join(',')})&status=eq.active&limit=${unresolvedSourceIds.length}`;
    const conceptRows = await readRows(conceptPath);
    if (conceptRows === null) return null;

    const resolvedIds = new Set<string>();
    for (const row of conceptRows) {
      const concept = conceptRecord(row);
      if (!concept || !requestedIds.has(concept.id)) continue;
      conceptById.set(concept.id, concept);
      resolvedIds.add(concept.id);
    }
    for (const sourceId of unresolvedSourceIds) {
      if (!resolvedIds.has(sourceId)) conceptById.set(sourceId, null);
    }
  }

  const unique = new Map<string, StudyPrerequisiteRef>();
  for (const edge of edges) {
    const concept = conceptById.get(edge.sourceConceptId);
    if (!concept) continue;
    const candidate = { ...concept, edgeConfidence: edge.confidence };
    const prior = unique.get(candidate.id);
    if (!prior || candidate.edgeConfidence > prior.edgeConfidence) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].sort((left, right) =>
    right.edgeConfidence - left.edgeConfidence || left.canonicalKey.localeCompare(right.canonicalKey));
}

async function prerequisitesFor(context: StudyScanContext, targetConceptId: string): Promise<StudyPrerequisiteRef[] | null> {
  const cached = context.prerequisitesByTargetId.get(targetConceptId);
  if (cached) return cached;
  const prerequisites = await readImmediatePrerequisites(targetConceptId, context.conceptById);
  if (prerequisites !== null) context.prerequisitesByTargetId.set(targetConceptId, prerequisites);
  return prerequisites;
}

async function learnerModelFor(context: StudyScanContext, concept: StudyConceptRef): Promise<StudyLearnerModel | null> {
  const cached = context.modelByConceptId.get(concept.id);
  if (cached) return cached;
  const evidence = await readVerifiedStudyMasteryEvidence(context.userSub, concept.id, concept.canonicalKey);
  if (!evidence) return null;
  const model = buildStudyLearnerModel({
    conceptId: concept.id,
    conceptKey: concept.canonicalKey,
    evidence,
    estimate: estimateStudyMastery(evidence),
  });
  context.modelByConceptId.set(concept.id, model);
  return model;
}

function recoveryPriority(candidate: StudyPrerequisiteCandidate): number {
  if (candidate.kind === 'diagnostic') return 1;
  switch (candidate.model.nextLearningMove.type) {
    case 'diagnose_misconception': return 5;
    case 'confirm_misconception': return 4;
    case 'guided_repair': return 3;
    default: return 0;
  }
}

function chooseCandidate(candidates: StudyPrerequisiteCandidate[]): StudyPrerequisiteCandidate | null {
  return [...candidates].sort((left, right) =>
    recoveryPriority(right) - recoveryPriority(left)
    || right.depth - left.depth
    || right.concept.edgeConfidence - left.concept.edgeConfidence
    || left.concept.canonicalKey.localeCompare(right.concept.canonicalKey))[0] || null;
}

function isSpecificMisconceptionMove(model: StudyLearnerModel): boolean {
  return model.nextLearningMove.type === 'diagnose_misconception'
    || model.nextLearningMove.type === 'confirm_misconception';
}

async function scanPrerequisites(input: {
  context: StudyScanContext;
  targetConcept: StudyConceptRef;
  depth: number;
  path: Set<string>;
}): Promise<StudyPrerequisiteScan> {
  if (input.depth >= MAX_PREREQUISITE_DEPTH) return { status: 'ok', candidate: null };

  const prerequisites = await prerequisitesFor(input.context, input.targetConcept.id);
  if (prerequisites === null) return { status: 'unavailable' };
  if (!prerequisites.length) return { status: 'ok', candidate: null };

  const candidates: StudyPrerequisiteCandidate[] = [];
  for (const concept of prerequisites) {
    // `path` is branch-local. A shared mutable visited set makes a converging
    // prerequisite DAG depend on which sibling happens to be scanned first.
    if (input.path.has(concept.id)) continue;

    if (!input.context.inspectedPrerequisiteIds.has(concept.id)) {
      if (input.context.inspectedPrerequisiteIds.size >= MAX_PREREQUISITE_CONCEPTS) continue;
      input.context.inspectedPrerequisiteIds.add(concept.id);
    }

    const model = await learnerModelFor(input.context, concept);
    if (model === null) return { status: 'unavailable' };

    if (model.nextLearningMove.type === 'independent_retrieval') {
      candidates.push({ kind: 'diagnostic', concept, model, depth: input.depth + 1 });
      continue;
    }

    // A specific, evidence-backed misconception is already a smaller and more
    // defensible intervention than speculating about an even deeper cause.
    if (isSpecificMisconceptionMove(model)) {
      candidates.push({ kind: 'recovery', concept, model, depth: input.depth + 1 });
      continue;
    }

    if (model.nextLearningMove.type !== 'guided_repair') continue;

    const deeper = await scanPrerequisites({
      context: input.context,
      targetConcept: concept,
      depth: input.depth + 1,
      path: new Set([...input.path, concept.id]),
    });
    if (deeper.status === 'unavailable') return deeper;
    if (deeper.candidate) candidates.push(deeper.candidate);
    else candidates.push({ kind: 'recovery', concept, model, depth: input.depth + 1 });
  }

  return { status: 'ok', candidate: chooseCandidate(candidates) };
}

/**
 * V6 only overrides the generic guided-repair move. Specific misconception,
 * confirmation, evidence-variation, retention and transfer decisions stay with
 * the existing one-concept learner model. That keeps one learner truth and uses
 * the prerequisite graph only when the current evidence says a foundational
 * repair is actually needed.
 */
export async function applyStudyPrerequisiteNextBestAction(input: {
  userSub: string;
  activeConcept: StudyConceptRef;
  learnerModel: StudyLearnerModel;
}): Promise<StudyLearnerModel> {
  if (input.learnerModel.nextLearningMove.type !== 'guided_repair') return input.learnerModel;

  const context: StudyScanContext = {
    userSub: input.userSub,
    inspectedPrerequisiteIds: new Set(),
    conceptById: new Map(),
    modelByConceptId: new Map(),
    prerequisitesByTargetId: new Map(),
  };
  const scan = await scanPrerequisites({
    context,
    targetConcept: input.activeConcept,
    depth: 0,
    path: new Set([input.activeConcept.id]),
  });

  if (scan.status === 'unavailable') {
    return {
      ...input.learnerModel,
      nextLearningMove: {
        ...input.learnerModel.nextLearningMove,
        reasonCode: `${input.learnerModel.nextLearningMove.reasonCode}:prerequisite_graph_unavailable`,
        instruction: `Repair the first material error inside ${input.activeConcept.label}. The canonical prerequisite graph or its verified learner evidence is unavailable, so do not name or assume a prerequisite and do not promote mastery from conversational inference.`,
        learnerFacingText: `Next: repair the first error in ${input.activeConcept.label} without assuming a missing prerequisite.`,
      },
    };
  }

  const candidate = scan.candidate;
  if (!candidate) return input.learnerModel;

  if (candidate.kind === 'diagnostic') {
    return {
      ...input.learnerModel,
      nextLearningMove: {
        type: 'independent_retrieval',
        reasonCode: `prerequisite_evidence_missing:${candidate.concept.canonicalKey}`,
        instruction: `Before continuing ${input.activeConcept.label}, check prerequisite ${candidate.concept.label} with one independent no-hint question. Treat the answer as diagnostic guidance only unless it enters the governed assessment/evidence path; never promote mastery from conversation alone.`,
        learnerFacingText: `Next: check ${candidate.concept.label} first before continuing ${input.activeConcept.label}.`,
      },
    };
  }

  return {
    ...input.learnerModel,
    nextLearningMove: {
      type: candidate.model.nextLearningMove.type,
      reasonCode: `prerequisite_recovery:${candidate.concept.canonicalKey}:${candidate.model.nextLearningMove.reasonCode}`,
      instruction: `Step back to prerequisite ${candidate.concept.label} before continuing ${input.activeConcept.label}. ${candidate.model.nextLearningMove.instruction} Keep ${input.activeConcept.label} unchanged in the learner truth until fresh governed evidence supports a new state.`,
      learnerFacingText: `Next: step back to ${candidate.concept.label} before continuing ${input.activeConcept.label}.`,
    },
  };
}
