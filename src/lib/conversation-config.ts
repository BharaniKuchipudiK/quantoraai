/**
 * QuantoraAI Decision Matrix
 * Centralized weights and thresholds for the conversation engine.
 */
export const CONVERSATION_WEIGHTS = {
  // Threshold to decide if we should ask a clarifying question
  CLARIFICATION_THRESHOLD: 0.85,
  
  // Confidence required to proceed with an automated action
  AUTO_EXECUTE_THRESHOLD: 0.95,
  
  // Score below which the agent should hand over to the user
  UNCERTAINTY_FLOOR: 0.25,
  
  // Weight given to historical context vs. current intent
  CONTEXT_RETENTION_FACTOR: 0.6,
} as const;

export type ConversationWeights = typeof CONVERSATION_WEIGHTS;
