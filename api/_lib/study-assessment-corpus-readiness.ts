import { studyAssessmentItemsForConcept } from './study-assessment-items.js';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  type StudyAssessmentCorpusQualityDecision,
} from './study-assessment-quality.js';

const PILOT_ITEMS = STUDY_H2_PILOT_COVERAGE_POLICY.requiredConceptKeys
  .flatMap((conceptKey) => studyAssessmentItemsForConcept(conceptKey));

const PILOT_READINESS = validateStudyAssessmentCorpusQuality(
  PILOT_ITEMS,
  STUDY_H2_PILOT_COVERAGE_POLICY,
);

/**
 * Runtime release readiness for the governed H2 pilot corpus.
 *
 * The audit is computed once when the server module loads. Any duplicate,
 * malformed released item, or regression below the explicit pilot coverage
 * floor makes verified assessment issuance fail closed through governance.
 */
export function studyAssessmentCorpusReadiness(): StudyAssessmentCorpusQualityDecision {
  return {
    ...PILOT_READINESS,
    reasonCodes: [...PILOT_READINESS.reasonCodes],
    conceptCoverage: { ...PILOT_READINESS.conceptCoverage },
  };
}
