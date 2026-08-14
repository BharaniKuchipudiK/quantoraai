import { CONVERSATION_WEIGHTS } from './conversation-config';

export function chooseNextConversationMove(score: number) {
  // Instead of 'if (score > 0.85)', we use meaningful names:
  if (score >= CONVERSATION_WEIGHTS.AUTO_EXECUTE_THRESHOLD) {
    return { move: 'EXECUTE', confidence: score };
  }

  if (score >= CONVERSATION_WEIGHTS.CLARIFICATION_THRESHOLD) {
    return { move: 'ASK_QUESTION', confidence: score };
  }

  if (score < CONVERSATION_WEIGHTS.UNCERTAINTY_FLOOR) {
    return { move: 'ESCALATE_TO_USER', confidence: score };
  }

  return { move: 'CONTINUE_ANALYSIS', confidence: score };
}
