import type { ConversationVerification } from '../../../../api/_lib/conversation-engine.js';
import type { ResponseEvaluation } from './score-response';

export function evaluationFromVerification(input: {
  verification: ConversationVerification;
  latencyMs: number;
  usedFallback: boolean;
}): ResponseEvaluation {
  const qualitySignal = input.verification.status === 'fail'
    ? 'corrected'
    : input.usedFallback
      ? 'fallback_rescued'
      : input.verification.status === 'pass'
        ? 'accepted'
        : 'unknown';

  return {
    verifierStatus: input.verification.status,
    qualitySignal,
    latencyMs: input.latencyMs,
    usedFallback: input.usedFallback,
    issues: input.verification.issues,
    score: input.verification.score,
  };
}
