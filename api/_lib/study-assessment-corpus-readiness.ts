import { allStudyAssessmentItems } from './study-assessment-items.js';
import {
  STUDY_H2_PILOT_COVERAGE_POLICY,
  validateStudyAssessmentCorpusQuality,
  type StudyAssessmentCorpusQualityDecision,
} from './study-assessment-quality.js';

const CORPUS_READINESS = validateStudyAssessmentCorpusQuality(
  allStudyAssessmentItems(),
  STUDY_H2_PILOT_COVERAGE_POLICY,
);

/**
 * Runtime release readiness for the complete governed assessment bank.
 *
 * The audit is computed once when the server module loads. Every current and
 * future bank item participates in corpus-wide duplicate and quality checks,
 * while the pilot policy remains only the minimum coverage floor. Any corpus
 * defect or coverage regression makes verified assessment issuance fail closed.
 */
export function studyAssessmentCorpusReadiness(): StudyAssessmentCorpusQualityDecision {
  return {
    ...CORPUS_READINESS,
    reasonCodes: [...CORPUS_READINESS.reasonCodes],
    conceptCoverage: { ...CORPUS_READINESS.conceptCoverage },
  };
}
