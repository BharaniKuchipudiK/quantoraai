export const STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION = 'study-assessment-corpus-2026-09-02.1';

export type StudyAssessmentLifecycleState =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'released'
  | 'retired'
  | 'rejected';

export type StudyAssessmentEvidencePurpose =
  | 'diagnostic'
  | 'retrieval'
  | 'application'
  | 'misconception_probe'
  | 'retention_probe'
  | 'transfer';

export type StudyAssessmentRepresentation =
  | 'text'
  | 'symbolic'
  | 'quantitative'
  | 'graph_interpretation'
  | 'spatial';

export type StudyAssessmentCurriculumRef = {
  curriculumKey: string;
  curriculumVersion: string;
  objectiveCode: string;
  level: string;
};

export type StudyAssessmentLifecycle = {
  state: StudyAssessmentLifecycleState;
  previousState: StudyAssessmentLifecycleState | null;
  reviewRef: string | null;
};

export type StudyAssessmentCorpusMetadata = {
  schemaVersion: typeof STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION;
  subject: string;
  curriculumRefs: StudyAssessmentCurriculumRef[];
  evidencePurpose: StudyAssessmentEvidencePurpose;
  representation: StudyAssessmentRepresentation;
  prerequisiteConceptKeys: string[];
  provenance: {
    kind: 'quantora_authored' | 'licensed' | 'open_licensed' | 'imported';
    sourceRef: string;
  };
  lifecycle: StudyAssessmentLifecycle;
};

export type StudyAssessmentCorpusRecord = {
  key: string;
  version: string;
  conceptKey: string;
  objectiveCode: string;
  difficulty: number;
  reviewStatus: 'approved' | 'draft' | 'rejected' | 'unknown';
  releaseMode: 'reviewed_static' | 'parametric' | 'generated';
  corpus: StudyAssessmentCorpusMetadata;
};

const TRANSITIONS: Record<StudyAssessmentLifecycleState, ReadonlySet<StudyAssessmentLifecycleState>> = {
  draft: new Set(['in_review', 'rejected']),
  in_review: new Set(['draft', 'approved', 'rejected']),
  approved: new Set(['in_review', 'released', 'rejected']),
  released: new Set(['retired']),
  retired: new Set(['in_review']),
  rejected: new Set(['draft']),
};

function canTransitionStudyAssessmentLifecycle(
  from: StudyAssessmentLifecycleState,
  to: StudyAssessmentLifecycleState,
): boolean {
  return from === to || TRANSITIONS[from]?.has(to) === true;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Structural H2.1 contract for corpus records.
 *
 * This deliberately does not score pedagogy, detect near-duplicates, or claim
 * curriculum coverage. Those are H2.2 quality gates. It only makes malformed,
 * unauditable, or lifecycle-inconsistent records impossible to treat as
 * release-ready corpus entries.
 */
export function validateStudyAssessmentCorpusRecord(
  item: StudyAssessmentCorpusRecord,
): { valid: boolean; reasonCodes: string[] } {
  const reasons = new Set<string>();
  const corpus = item?.corpus;
  const itemRef = clean(item?.key) && clean(item?.version);

  if (!itemRef || !/^[a-z0-9][a-z0-9-]*$/.test(item.key) || !/^[a-z0-9][a-z0-9._-]*$/.test(item.version)) {
    reasons.add('invalid_corpus_item_identity');
  }
  if (!clean(item?.conceptKey) || !clean(item?.objectiveCode)) reasons.add('missing_corpus_learning_mapping');
  if (!Number.isFinite(item?.difficulty) || item.difficulty < 0 || item.difficulty > 1) {
    reasons.add('invalid_corpus_difficulty');
  }
  if (!corpus || corpus.schemaVersion !== STUDY_ASSESSMENT_CORPUS_SCHEMA_VERSION) {
    reasons.add('unsupported_corpus_schema');
  } else {
    if (!clean(corpus.subject)) reasons.add('missing_corpus_subject');
    if (!Array.isArray(corpus.curriculumRefs) || corpus.curriculumRefs.length === 0) {
      reasons.add('missing_corpus_curriculum_mapping');
    } else {
      const refs = new Set<string>();
      for (const ref of corpus.curriculumRefs) {
        const identity = [ref?.curriculumKey, ref?.curriculumVersion, ref?.objectiveCode, ref?.level]
          .map(clean)
          .join(':');
        if (identity.includes('::') || identity.startsWith(':') || identity.endsWith(':')) {
          reasons.add('invalid_corpus_curriculum_mapping');
        }
        if (refs.has(identity)) reasons.add('duplicate_corpus_curriculum_mapping');
        refs.add(identity);
      }
    }
    if (!clean(corpus.provenance?.sourceRef)) reasons.add('missing_corpus_provenance');
    if (!Array.isArray(corpus.prerequisiteConceptKeys)) reasons.add('invalid_corpus_prerequisites');
    if (corpus.lifecycle?.previousState
      && !canTransitionStudyAssessmentLifecycle(corpus.lifecycle.previousState, corpus.lifecycle.state)) {
      reasons.add('invalid_corpus_lifecycle_transition');
    }
    if (corpus.lifecycle?.state === 'released') {
      if (item.reviewStatus !== 'approved') reasons.add('released_corpus_item_not_approved');
      if (item.releaseMode !== 'reviewed_static') reasons.add('released_corpus_item_not_static');
      if (!clean(corpus.lifecycle.reviewRef)) reasons.add('released_corpus_item_missing_review_ref');
    }
    if (corpus.lifecycle?.state === 'rejected' && item.reviewStatus !== 'rejected') {
      reasons.add('rejected_corpus_item_status_mismatch');
    }
  }

  return { valid: reasons.size === 0, reasonCodes: [...reasons].sort() };
}
