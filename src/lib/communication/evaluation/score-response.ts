export type ResponseVerifierStatus = 'pass' | 'warning' | 'fail';

export type ResponseQualitySignal =
  | 'accepted'
  | 'corrected'
  | 'abandoned'
  | 'fallback_rescued'
  | 'unknown';

export type ResponseEvaluation = {
  verifierStatus: ResponseVerifierStatus;
  qualitySignal: ResponseQualitySignal;
  latencyMs: number;
  usedFallback: boolean;
  issues: Array<{ code: string; severity: 'warning' | 'failure' }>;
  score: number;
};
