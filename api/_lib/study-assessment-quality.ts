import type {
  StudyAssessmentCorpusMetadata,
  StudyAssessmentEvidencePurpose,
} from './study-assessment-corpus.js';

export const STUDY_ASSESSMENT_QUALITY_VERSION = 'study-assessment-quality-2026-09-02.2';

export type StudyAssessmentQualityOption = {
  id: string;
  text: string;
};

export type StudyAssessmentQualityCandidate = {
  key: string;
  version: string;
  conceptKey: string;
  objectiveCode: string;
  prompt: string;
  options: StudyAssessmentQualityOption[];
  correctOptionId: string;
  explanation: string;
  reviewStatus: 'approved' | 'draft' | 'rejected' | 'unknown';
  releaseMode: 'reviewed_static' | 'parametric' | 'generated';
  corpus: StudyAssessmentCorpusMetadata;
};

export type StudyAssessmentItemQualityDecision = {
  version: typeof STUDY_ASSESSMENT_QUALITY_VERSION;
  itemRef: string;
  valid: boolean;
  reasonCodes: string[];
};

export type StudyAssessmentCoveragePolicy = {
  id: string;
  requiredConceptKeys: string[];
  minReleasedItemsPerConcept: number;
  requiredEvidencePurposes: StudyAssessmentEvidencePurpose[];
  requiredCurricula: Array<{
    curriculumKey: string;
    curriculumVersion: string;
  }>;
};

export type StudyAssessmentCorpusQualityDecision = {
  version: typeof STUDY_ASSESSMENT_QUALITY_VERSION;
  policyId: string;
  valid: boolean;
  reasonCodes: string[];
  releasedItemCount: number;
  conceptCoverage: Record<string, number>;
};

export const STUDY_H2_PILOT_COVERAGE_POLICY: StudyAssessmentCoveragePolicy = {
  id: 'study-h2-pilot-baseline-2026-09-02.1',
  requiredConceptKeys: [
    'math.trigonometry.functions',
    'math.trigonometry.identities',
    'math.vector.scalar-vector',
    'math.vector.resultant',
    'math.vector.components',
    'physics.kinematics.speed-velocity-acceleration',
    'physics.kinematics.motion-graphs',
    'physics.kinematics.motion-in-plane',
    'physics.kinematics.projectile-motion',
  ],
  minReleasedItemsPerConcept: 1,
  requiredEvidencePurposes: [
    'diagnostic',
    'retrieval',
    'application',
    'misconception_probe',
  ],
  requiredCurricula: [
    { curriculumKey: 'sg.seab.olevel.additional-mathematics.4049', curriculumVersion: '2026' },
    { curriculumKey: 'sg.seab.olevel.physics.6091', curriculumVersion: '2026' },
    { curriculumKey: 'in.nta.jeemain.paper1', curriculumVersion: '2026' },
  ],
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Broad lexical normalization for prompt similarity only. Punctuation and
 * operators are intentionally ignored here because prompt duplicate detection
 * is about wording overlap, not mathematical answer equivalence.
 */
function normalized(value: unknown): string {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Conservative equality key for answer options and answer-only explanations.
 * Mathematical operators are semantic content and must survive normalization:
 * `sin(x) + cos(x)` is not the same answer as `sin(x)cos(x)`, and `V cos(θ)`
 * is not the same answer as `V / cos(θ)`.
 */
function normalizedSemanticText(value: unknown): string {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s*([+\-*/=<>^()[\]{}%,:;°±])\s*/gu, '$1')
    .replace(/[.!?]+$/u, '')
    .trim();
}

function tokens(value: unknown): Set<string> {
  return new Set(normalized(value).split(' ').filter((token) => token.length >= 2));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function itemRef(item: Pick<StudyAssessmentQualityCandidate, 'key' | 'version'>): string {
  const key = clean(item?.key);
  const version = clean(item?.version);
  return key && version ? `${key}@${version}` : '';
}

function hasAnswerLeakMarker(value: unknown): boolean {
  const text = clean(value);
  if (!text) return false;
  return /(?:\bcorrect\s+(?:answer|option)\b|\banswer\s+is\b|\bsolution\s+is\b|\[(?:correct|answer)\]|\((?:correct|answer)\)|✅|✓)/iu.test(text);
}

export function validateStudyAssessmentItemQuality(
  item: StudyAssessmentQualityCandidate,
): StudyAssessmentItemQualityDecision {
  const reasons = new Set<string>();
  const ref = itemRef(item);
  const prompt = clean(item?.prompt);
  const explanation = clean(item?.explanation);
  const correctOptionId = clean(item?.correctOptionId);
  const options = Array.isArray(item?.options) ? item.options : [];

  if (!ref) reasons.add('quality_invalid_item_identity');
  if (prompt.length < 12) reasons.add('quality_prompt_too_thin');
  if (hasAnswerLeakMarker(prompt)) reasons.add('quality_prompt_answer_leakage');
  if (options.length < 2 || options.length > 8) reasons.add('quality_invalid_option_count');

  const optionIds = new Set<string>();
  const optionTexts = new Set<string>();
  let correctOptionMatches = 0;
  let correctOptionText = '';

  for (const option of options) {
    const id = clean(option?.id);
    const text = clean(option?.text);
    const normalizedText = normalizedSemanticText(text);

    if (!id) reasons.add('quality_empty_option_id');
    else if (optionIds.has(id)) reasons.add('quality_duplicate_option_id');
    else optionIds.add(id);

    if (!text) reasons.add('quality_empty_option_text');
    else if (optionTexts.has(normalizedText)) reasons.add('quality_duplicate_option_text');
    else optionTexts.add(normalizedText);

    if (hasAnswerLeakMarker(text)) reasons.add('quality_option_answer_leakage');
    if (id && id === correctOptionId) {
      correctOptionMatches += 1;
      correctOptionText = text;
    }
  }

  if (!correctOptionId || correctOptionMatches !== 1) reasons.add('quality_invalid_correct_option');
  if (explanation.length < 24 || tokens(explanation).size < 5) reasons.add('quality_explanation_too_thin');
  if (correctOptionText && normalizedSemanticText(explanation) === normalizedSemanticText(correctOptionText)) {
    reasons.add('quality_explanation_repeats_answer_only');
  }

  return {
    version: STUDY_ASSESSMENT_QUALITY_VERSION,
    itemRef: ref,
    valid: reasons.size === 0,
    reasonCodes: [...reasons].sort(),
  };
}

function isReleasedQualityItem(item: StudyAssessmentQualityCandidate): boolean {
  return item.reviewStatus === 'approved'
    && item.releaseMode === 'reviewed_static'
    && item.corpus?.lifecycle?.state === 'released'
    && validateStudyAssessmentItemQuality(item).valid;
}

export function validateStudyAssessmentCorpusQuality(
  items: StudyAssessmentQualityCandidate[],
  policy: StudyAssessmentCoveragePolicy = STUDY_H2_PILOT_COVERAGE_POLICY,
): StudyAssessmentCorpusQualityDecision {
  const reasons = new Set<string>();
  const safeItems = Array.isArray(items) ? items : [];
  const byRef = new Map<string, StudyAssessmentQualityCandidate>();
  const byPrompt = new Map<string, string>();

  for (const item of safeItems) {
    const ref = itemRef(item);
    const quality = validateStudyAssessmentItemQuality(item);
    for (const reason of quality.reasonCodes) reasons.add(`${ref || 'unknown'}:${reason}`);

    if (ref) {
      if (byRef.has(ref)) reasons.add(`duplicate_item_ref:${ref}`);
      else byRef.set(ref, item);
    }

    const promptKey = normalized(item?.prompt);
    if (promptKey) {
      const priorRef = byPrompt.get(promptKey);
      if (priorRef && priorRef !== ref) reasons.add(`duplicate_prompt:${priorRef}:${ref || 'unknown'}`);
      else byPrompt.set(promptKey, ref || 'unknown');
    }
  }

  for (let leftIndex = 0; leftIndex < safeItems.length; leftIndex += 1) {
    const left = safeItems[leftIndex];
    const leftRef = itemRef(left);
    for (let rightIndex = leftIndex + 1; rightIndex < safeItems.length; rightIndex += 1) {
      const right = safeItems[rightIndex];
      const rightRef = itemRef(right);
      if (!leftRef || !rightRef || leftRef === rightRef) continue;
      if (left.conceptKey !== right.conceptKey || left.objectiveCode !== right.objectiveCode) continue;
      if (normalized(left.prompt) === normalized(right.prompt)) continue;
      if (jaccard(tokens(left.prompt), tokens(right.prompt)) >= 0.82) {
        reasons.add(`near_duplicate_prompt:${leftRef}:${rightRef}`);
      }
    }
  }

  const released = safeItems.filter(isReleasedQualityItem);
  const conceptCoverage: Record<string, number> = {};
  for (const conceptKey of policy.requiredConceptKeys) conceptCoverage[conceptKey] = 0;
  for (const item of released) {
    if (Object.prototype.hasOwnProperty.call(conceptCoverage, item.conceptKey)) {
      conceptCoverage[item.conceptKey] += 1;
    }
  }

  for (const conceptKey of policy.requiredConceptKeys) {
    const count = conceptCoverage[conceptKey] || 0;
    if (count < policy.minReleasedItemsPerConcept) {
      reasons.add(`coverage_concept_below_threshold:${conceptKey}:${count}/${policy.minReleasedItemsPerConcept}`);
    }
  }

  const releasedPurposes = new Set(released.map((item) => item.corpus.evidencePurpose));
  for (const purpose of policy.requiredEvidencePurposes) {
    if (!releasedPurposes.has(purpose)) reasons.add(`coverage_evidence_purpose_missing:${purpose}`);
  }

  for (const required of policy.requiredCurricula) {
    const found = released.some((item) => item.corpus.curriculumRefs.some((ref) => (
      ref.curriculumKey === required.curriculumKey
      && ref.curriculumVersion === required.curriculumVersion
    )));
    if (!found) reasons.add(`coverage_curriculum_missing:${required.curriculumKey}@${required.curriculumVersion}`);
  }

  return {
    version: STUDY_ASSESSMENT_QUALITY_VERSION,
    policyId: policy.id,
    valid: reasons.size === 0,
    reasonCodes: [...reasons].sort(),
    releasedItemCount: released.length,
    conceptCoverage,
  };
}
