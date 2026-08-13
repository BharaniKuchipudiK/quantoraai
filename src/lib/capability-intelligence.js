/**
 * Capability Intelligence v1
 *
 * A capability is proposed because the outcome state makes it useful now —
 * never because a vendor or technology keyword happens to appear in a prompt.
 * This registry contains product behavior and policy metadata, not logos,
 * provider instructions, or user-facing canned model responses.
 */

export const CAPABILITY_RISK = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const CAPABILITY_EFFECT = Object.freeze({
  LOCAL_STATE: 'local_state',
  DURABLE_MEMORY: 'durable_memory',
  EXTERNAL_READ: 'external_read',
  EXTERNAL_WRITE: 'external_write',
});

export const CAPABILITY_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'outcome-memory',
    label: 'Remember this outcome',
    description: 'Keep confirmed goals and decisions available across sessions.',
    effect: CAPABILITY_EFFECT.DURABLE_MEMORY,
    risk: CAPABILITY_RISK.LOW,
    requiresAuthentication: true,
    requiresConsent: true,
    evidenceType: 'outcome_state_version',
    icon: 'memory',
  }),
  Object.freeze({
    id: 'journey-track',
    label: 'Track in Journey',
    description: 'Keep the outcome visible from captured idea to verified completion.',
    effect: CAPABILITY_EFFECT.LOCAL_STATE,
    risk: CAPABILITY_RISK.LOW,
    requiresAuthentication: false,
    requiresConsent: false,
    evidenceType: 'journey_node',
    icon: 'journey',
  }),
]);

function hasOutcomeContext(context = {}) {
  return Boolean(
    context?.goal?.trim?.()
    || context?.understanding?.trim?.()
    || context?.facts?.some?.((fact) => typeof fact === 'string' && fact.trim()),
  );
}

function hasMeaningfulConversation(messages = []) {
  return messages.some((message) => message?.sender === 'user' && message?.text?.trim?.());
}

function scoreCapability(capability, state) {
  if (capability.id === 'outcome-memory') {
    if (!state.isSignedIn || state.memoryConsented) return null;
    if (!hasOutcomeContext(state.conversationContext)) return null;
    return {
      capability,
      score: 0.94,
      reasonCode: 'continuity_available_with_consent',
    };
  }

  if (capability.id === 'journey-track') {
    if (state.hasJourneyNode || state.isGenerating) return null;
    if (!hasOutcomeContext(state.conversationContext) && !hasMeaningfulConversation(state.messages)) return null;
    return {
      capability,
      score: hasOutcomeContext(state.conversationContext) ? 0.88 : 0.76,
      reasonCode: hasOutcomeContext(state.conversationContext)
        ? 'outcome_ready_for_progress_tracking'
        : 'conversation_ready_for_progress_tracking',
    };
  }

  return null;
}

/**
 * Rank capability proposals from trusted product state. The output is bounded
 * so the prompt remains calm and does not become an integration marketplace.
 */
export function proposeCapabilities(state = {}, { limit = 2 } = {}) {
  return CAPABILITY_REGISTRY
    .map((capability) => scoreCapability(capability, state))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(3, limit)));
}

/**
 * One policy vocabulary for the future execution plane. Native v1 actions are
 * low risk; external writes and high-risk operations require review.
 */
export function getCapabilityApprovalPolicy(capability) {
  if (!capability) return 'blocked';
  if (capability.risk === CAPABILITY_RISK.HIGH) return 'explicit_confirmation';
  if (capability.effect === CAPABILITY_EFFECT.EXTERNAL_WRITE) return 'preview_then_confirm';
  if (capability.requiresConsent) return 'consent';
  return 'direct';
}
