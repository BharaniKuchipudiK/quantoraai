export const RUNTIME_OUTCOME_EVALUATOR_VERSION = 'runtime-outcome-evaluator-2026-09-13.1';

export type OutcomeCriterion = {
  criterionId: string;
  statement: string;
  required?: boolean;
  judgeableByModel?: boolean;
};

export type OutcomeEvidenceVerdict = 'passed' | 'failed' | 'unknown';

export type OutcomeExecutionEvidence = {
  evidenceId: string;
  criterionId: string;
  verdict: OutcomeEvidenceVerdict;
  source: 'tool' | 'compiler' | 'runtime' | 'verifier' | 'provider' | 'human' | 'model';
  ref?: string | null;
};

export type RuntimeOutcomeEvaluation = {
  version: string;
  status: 'satisfied' | 'failed' | 'indeterminate';
  originalIntent: string | null;
  deterministic: boolean;
  modelJudgeRequired: boolean;
  satisfiedCriteria: string[];
  failedCriteria: string[];
  unresolvedCriteria: string[];
  evidenceRefs: string[];
  blockers: string[];
};

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Evaluate an execution outcome against the original user intent and explicit
 * success criteria. Deterministic evidence always has authority over model
 * judgment: a model is requested only for unresolved criteria explicitly
 * marked judgeableByModel, never to override a concrete pass/fail signal.
 */
export function evaluateRuntimeOutcome(input: {
  originalIntent: string | null;
  criteria: OutcomeCriterion[];
  evidence: OutcomeExecutionEvidence[];
}): RuntimeOutcomeEvaluation {
  const originalIntent = clean(input.originalIntent) || null;
  const blockers: string[] = [];
  if (!originalIntent) blockers.push('Original user intent is missing.');

  const criteria = input.criteria
    .map((criterion) => ({
      ...criterion,
      criterionId: clean(criterion.criterionId, 120),
      statement: clean(criterion.statement),
      required: criterion.required !== false,
      judgeableByModel: criterion.judgeableByModel === true,
    }))
    .filter((criterion) => criterion.criterionId && criterion.statement);

  if (!criteria.length) blockers.push('No outcome criteria are defined.');

  const evidenceByCriterion = new Map<string, OutcomeExecutionEvidence[]>();
  for (const evidence of input.evidence) {
    const criterionId = clean(evidence.criterionId, 120);
    if (!criterionId) continue;
    const existing = evidenceByCriterion.get(criterionId) || [];
    existing.push(evidence);
    evidenceByCriterion.set(criterionId, existing);
  }

  const satisfiedCriteria: string[] = [];
  const failedCriteria: string[] = [];
  const unresolvedCriteria: string[] = [];
  const modelJudgeCandidates: string[] = [];

  for (const criterion of criteria) {
    if (!criterion.required) continue;
    const evidence = evidenceByCriterion.get(criterion.criterionId) || [];
    const hasFailure = evidence.some((item) => item.verdict === 'failed');
    const hasPass = evidence.some((item) => item.verdict === 'passed');

    if (hasFailure) {
      failedCriteria.push(criterion.criterionId);
      continue;
    }
    if (hasPass) {
      satisfiedCriteria.push(criterion.criterionId);
      continue;
    }

    unresolvedCriteria.push(criterion.criterionId);
    if (criterion.judgeableByModel) modelJudgeCandidates.push(criterion.criterionId);
    else blockers.push(`Deterministic evidence is missing for criterion ${criterion.criterionId}.`);
  }

  const requiredCriteria = criteria.filter((criterion) => criterion.required);
  const status: RuntimeOutcomeEvaluation['status'] = failedCriteria.length
    ? 'failed'
    : originalIntent && requiredCriteria.length && unresolvedCriteria.length === 0
      ? 'satisfied'
      : 'indeterminate';

  const modelJudgeRequired = status === 'indeterminate'
    && failedCriteria.length === 0
    && modelJudgeCandidates.length > 0
    && modelJudgeCandidates.length === unresolvedCriteria.length;

  if (modelJudgeRequired) {
    blockers.push(`Model judgment required for unresolved criterion/criteria: ${modelJudgeCandidates.join(', ')}.`);
  }

  return {
    version: RUNTIME_OUTCOME_EVALUATOR_VERSION,
    status,
    originalIntent,
    deterministic: status !== 'indeterminate' || !modelJudgeRequired,
    modelJudgeRequired,
    satisfiedCriteria: unique(satisfiedCriteria),
    failedCriteria: unique(failedCriteria),
    unresolvedCriteria: unique(unresolvedCriteria),
    evidenceRefs: unique(input.evidence.map((item) => clean(item.ref, 240)).filter(Boolean)),
    blockers: unique(blockers),
  };
}
