import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';
import { buildStudyLearnerModel, type StudyLearnerModel } from './study-learner-model.js';
import { estimateStudyMastery } from './study-mastery-estimator.js';

export const STUDY_NEXT_BEST_ACTION_VERSION = 'study-next-best-action-2026-08-31.1';

const GRAPH_TIMEOUT_MS = 4_000;
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

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

function bounded(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

async function readRows(path: string): Promise<any[] | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Study prerequisite graph GET -> ${response.status}`);
      return null;
    }
    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    console.warn('Study prerequisite graph read failed:', error?.message || error);
    return null;
  }
}

function conceptRecord(value: any): StudyConceptRef | null {
  const id = typeof value?.id === 'string' ? value.id : '';
  const canonicalKey = typeof value?.canonical_key === 'string' ? value.canonical_key : '';
  const label = typeof value?.label === 'string' ? value.label : '';
  return id && canonicalKey && label ? { id, canonicalKey, label } : null;
}

async function readImmediatePrerequisites(targetConceptId: string): Promise<StudyPrerequisiteRef[] | null> {
  const edgeRows = await readRows(
    `study_concept_edges?select=source_concept_id,confidence&relation=eq.prerequisite_of&target_concept_id=eq.${encodeURIComponent(targetConceptId)}&order=confidence.desc&limit=50`,
  );
  if (edgeRows === null) return null;

  const edges = edgeRows
    .map((row: any) => ({
      sourceConceptId: typeof row?.source_concept_id === 'string' ? row.source_concept_id : '',
      confidence: bounded(row?.confidence),
    }))
    .filter((row) => row.sourceConceptId && row.confidence >= MIN_PREREQUISITE_CONFIDENCE);
  if (!edges.length) return [];

  const resolved = await Promise.all(edges.map(async (edge) => {
    const conceptRows = await readRows(
      `study_concepts?select=id,canonical_key,label&id=eq.${encodeURIComponent(edge.sourceConceptId)}&status=eq.active&order=updated_at.desc&limit=1`,
    );
    if (conceptRows === null) return { status: 'unavailable' as const };
    const concept = conceptRecord(conceptRows[0]);
    return concept
      ? { status: 'ok' as const, concept: { ...concept, edgeConfidence: edge.confidence } }
      : { status: 'missing' as const };
  }));
  if (resolved.some((entry) => entry.status === 'unavailable')) return null;

  const unique = new Map<string, StudyPrerequisiteRef>();
  for (const entry of resolved) {
    if (entry.status !== 'ok') continue;
    const prior = unique.get(entry.concept.id);
    if (!prior || entry.concept.edgeConfidence > prior.edgeConfidence) unique.set(entry.concept.id, entry.concept);
  }
  return [...unique.values()].sort((left, right) =>
    right.edgeConfidence - left.edgeConfidence || left.canonicalKey.localeCompare(right.canonicalKey));
}

async function learnerModelFor(userSub: string, concept: StudyConceptRef): Promise<StudyLearnerModel | null> {
  const evidence = await readVerifiedStudyMasteryEvidence(userSub, concept.id, concept.canonicalKey);
  if (!evidence) return null;
  return buildStudyLearnerModel({
    conceptId: concept.id,
    conceptKey: concept.canonicalKey,
    evidence,
    estimate: estimateStudyMastery(evidence),
  });
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
  userSub: string;
  targetConcept: StudyConceptRef;
  depth: number;
  visited: Set<string>;
}): Promise<StudyPrerequisiteScan> {
  if (input.depth >= MAX_PREREQUISITE_DEPTH || input.visited.size >= MAX_PREREQUISITE_CONCEPTS) {
    return { status: 'ok', candidate: null };
  }

  const prerequisites = await readImmediatePrerequisites(input.targetConcept.id);
  if (prerequisites === null) return { status: 'unavailable' };
  if (!prerequisites.length) return { status: 'ok', candidate: null };

  const eligible = prerequisites
    .filter((concept) => !input.visited.has(concept.id))
    .slice(0, Math.max(0, MAX_PREREQUISITE_CONCEPTS - input.visited.size));
  if (!eligible.length) return { status: 'ok', candidate: null };

  const evaluated = await Promise.all(eligible.map(async (concept) => ({
    concept,
    model: await learnerModelFor(input.userSub, concept),
  })));
  if (evaluated.some((entry) => entry.model === null)) return { status: 'unavailable' };

  const candidates: StudyPrerequisiteCandidate[] = [];
  for (const entry of evaluated) {
    const model = entry.model as StudyLearnerModel;
    input.visited.add(entry.concept.id);

    if (model.nextLearningMove.type === 'independent_retrieval') {
      candidates.push({ kind: 'diagnostic', concept: entry.concept, model, depth: input.depth + 1 });
      continue;
    }

    // A specific, evidence-backed misconception is already a smaller and more
    // defensible intervention than speculating about an even deeper cause.
    if (isSpecificMisconceptionMove(model)) {
      candidates.push({ kind: 'recovery', concept: entry.concept, model, depth: input.depth + 1 });
      continue;
    }

    if (model.nextLearningMove.type !== 'guided_repair') continue;

    const deeper = await scanPrerequisites({
      userSub: input.userSub,
      targetConcept: entry.concept,
      depth: input.depth + 1,
      visited: input.visited,
    });
    if (deeper.status === 'unavailable') return deeper;
    if (deeper.candidate) candidates.push(deeper.candidate);
    else candidates.push({ kind: 'recovery', concept: entry.concept, model, depth: input.depth + 1 });
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

  const scan = await scanPrerequisites({
    userSub: input.userSub,
    targetConcept: input.activeConcept,
    depth: 0,
    visited: new Set([input.activeConcept.id]),
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
