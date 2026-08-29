export const STUDY_COGNITIVE_ROUTING_VERSION = 'study-cognitive-routing-2026-08-29.1';

export type StudyIntent = 'explain' | 'worked_example' | 'practice' | 'diagnose' | 'challenge' | 'verify' | 'plan' | 'continue';
export type StudyDifficulty = 'foundational' | 'standard' | 'advanced';
export type StudyCapability = 'concept_explanation' | 'worked_example' | 'socratic_guidance' | 'practice_generation' | 'misconception_diagnosis' | 'answer_verification' | 'learning_sequence' | 'visual_interpretation';

export type StudyCognitiveInterpretation = {
  version: string;
  intent: StudyIntent;
  difficulty: StudyDifficulty;
  continuity: 'new_topic' | 'follow_up';
  capabilities: StudyCapability[];
  responseMode: 'direct' | 'guided' | 'diagnostic' | 'evaluative' | 'sequenced';
  requiresVerification: boolean;
  temperatureCeiling: number;
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };
type ModelLike = { id?: string; name?: string; specialty?: string; description?: string; available?: boolean; pricingKind?: string; quality?: { sampleSize?: number; score?: number } | null };
type RoutingDecision = { primaryModelId: string; fallbackModelIds: string[]; reason: string; provider: 'gemini' | 'openrouter'; hasVisionSupport: boolean; selectionSource: string };

const FOLLOW_UP_RE = /^(?:and|but|so|then|also|okay|ok|wait|why|how|what about|can you|could you|do it|try again|continue|go on|next)\b|\b(?:that|this|it|those|these|previous|earlier|above|again)\b/i;
const CHALLENGE_RE = /\b(?:that (?:is|seems) wrong|not convinced|disagree|are you sure|doesn['’]t make sense|contradiction|but why|prove (?:it|that)|challenge)\b/i;
const VERIFY_RE = /\b(?:check|verify|grade|mark|review)\b.{0,40}\b(?:answer|solution|working|proof|calculation|response)\b|\b(?:is my|am i)\b.{0,30}\b(?:right|correct)\b/i;
const DIAGNOSE_RE = /\b(?:where did i go wrong|what did i misunderstand|why is my answer wrong|find my mistake|spot my error|misconception|diagnose)\b/i;
const PRACTICE_RE = /\b(?:quiz|test me|practice|exercise|problem set|flashcards?|questions? for me)\b/i;
const WORKED_EXAMPLE_RE = /\b(?:worked example|show (?:me )?(?:an? )?example|solve (?:this|one)|walk me through|step by step)\b/i;
const PLAN_RE = /\b(?:study plan|learning plan|revision plan|syllabus|curriculum|what should i learn|where should i start|roadmap)\b/i;
const CONTINUE_RE = /^(?:continue|go on|next|keep going|do it|try again|more)\W*$/i;
const ADVANCED_RE = /\b(?:derive|proof|prove|theorem|rigorous|formalism|asymptotic|eigenvalue|tensor|quantum|lagrangian|hamiltonian|differential equation|organic mechanism|graduate|postgraduate|research level|olympiad)\b/i;
const FOUNDATIONAL_RE = /\b(?:basics?|beginner|simple terms?|eli5|fundamentals?|introduction|what is|define|meaning of|from scratch)\b/i;

function textOf(item: HistoryItem): string { return String(item?.text || item?.content || '').trim(); }
function isAssistant(item: HistoryItem): boolean { return item?.sender === 'ai' || item?.role === 'assistant' || item?.role === 'model'; }
function recentConversationExists(history: HistoryItem[]): boolean { return Array.isArray(history) && history.slice(-8).some((item) => textOf(item).length > 0); }

function studyIntent(message: string): StudyIntent {
  if (DIAGNOSE_RE.test(message)) return 'diagnose';
  if (VERIFY_RE.test(message)) return 'verify';
  if (CHALLENGE_RE.test(message)) return 'challenge';
  if (PRACTICE_RE.test(message)) return 'practice';
  if (WORKED_EXAMPLE_RE.test(message)) return 'worked_example';
  if (PLAN_RE.test(message)) return 'plan';
  if (CONTINUE_RE.test(message)) return 'continue';
  return 'explain';
}

function studyDifficulty(message: string, history: HistoryItem[], intent: StudyIntent): StudyDifficulty {
  const recentUserContext = history.filter((item) => !isAssistant(item)).slice(-3).map(textOf).join(' ');
  const context = `${recentUserContext} ${message}`;
  if (ADVANCED_RE.test(context) || (intent === 'challenge' && /\b(?:proof|derive|counterexample|assumption)\b/i.test(context))) return 'advanced';
  if (FOUNDATIONAL_RE.test(message)) return 'foundational';
  return 'standard';
}

function capabilitiesFor(intent: StudyIntent, hasImages: boolean): StudyCapability[] {
  const byIntent: Record<StudyIntent, StudyCapability[]> = {
    explain: ['concept_explanation'],
    worked_example: ['worked_example', 'concept_explanation'],
    practice: ['practice_generation', 'socratic_guidance'],
    diagnose: ['misconception_diagnosis', 'socratic_guidance'],
    challenge: ['concept_explanation', 'answer_verification'],
    verify: ['answer_verification', 'misconception_diagnosis'],
    plan: ['learning_sequence'],
    continue: ['socratic_guidance'],
  };
  return hasImages ? [...byIntent[intent], 'visual_interpretation'] : byIntent[intent];
}

/** Strict feature gate: null means exact pass-through outside Study Tutor. */
export function interpretStudyTurn(input: { studioDomain?: string | null; message?: string; history?: HistoryItem[]; hasImages?: boolean }): StudyCognitiveInterpretation | null {
  if (input.studioDomain !== 'education') return null;
  const message = String(input.message || '').trim();
  const history = Array.isArray(input.history) ? input.history : [];
  const intent = studyIntent(message);
  const continuity = recentConversationExists(history)
    && (intent === 'continue' || intent === 'challenge' || intent === 'diagnose' || intent === 'verify' || FOLLOW_UP_RE.test(message))
    ? 'follow_up' : 'new_topic';
  const difficulty = studyDifficulty(message, history, intent);
  const requiresVerification = intent === 'verify' || intent === 'challenge' || intent === 'diagnose';
  const responseMode = intent === 'verify' || intent === 'challenge' ? 'evaluative'
    : intent === 'diagnose' ? 'diagnostic'
      : intent === 'practice' || intent === 'continue' ? 'guided'
        : intent === 'plan' ? 'sequenced' : 'direct';
  return {
    version: STUDY_COGNITIVE_ROUTING_VERSION,
    intent,
    difficulty,
    continuity,
    capabilities: capabilitiesFor(intent, input.hasImages === true),
    responseMode,
    requiresVerification,
    temperatureCeiling: requiresVerification ? 0.2 : difficulty === 'advanced' ? 0.3 : 0.5,
  };
}

export function formatStudyCognitiveDirective(interpretation: StudyCognitiveInterpretation | null): string {
  if (!interpretation) return '';
  return `\n\nSTUDY COGNITIVE ROUTE (${interpretation.version})
This directive applies only because the active workspace is Study Tutor.
- Learner intent: ${interpretation.intent}
- Difficulty: ${interpretation.difficulty}
- Continuity: ${interpretation.continuity}; preserve the current lesson context and resolve references from the supplied history. Do not restart discovery when the reference is clear.
- Response mode: ${interpretation.responseMode}
- Required teaching capabilities: ${interpretation.capabilities.join(', ')}
- Verification: ${interpretation.requiresVerification ? 'required — check the learner\'s reasoning before agreeing, distinguish verified facts from inference, and explain the first material error' : 'not mandatory — remain accurate and do not invent learner understanding'}
Answer the current learning move directly. Match explanation depth to the inferred difficulty. Do not claim mastery or persistent learner knowledge from this routing signal.`;
}

function reasoningScore(model: ModelLike, interpretation: StudyCognitiveInterpretation): number {
  const haystack = `${model.id || ''} ${model.name || ''} ${model.specialty || ''} ${model.description || ''}`.toLowerCase();
  let score = 0;
  if (/reason|deepseek|nemotron|gpt-oss|qwen/.test(haystack)) score += 30;
  if (/gemini|flash/.test(haystack)) score += interpretation.difficulty === 'foundational' ? 22 : 8;
  if (/coder/.test(haystack)) score -= 10;
  if (model.quality?.sampleSize && model.quality.sampleSize >= 5 && Number.isFinite(model.quality.score)) score += Math.max(0, Math.min(15, Number(model.quality.score) / 7));
  return score;
}

/** Reorders only eligible rungs; never adds paid routes or overrides a pin. */
export function applyStudyCapabilityRouting(input: { interpretation: StudyCognitiveInterpretation | null; baseDecision: RoutingDecision; models?: ModelLike[]; explicitModelSelected?: boolean; hasImages?: boolean }): RoutingDecision {
  const { interpretation, baseDecision } = input;
  if (!interpretation || input.explicitModelSelected || input.hasImages) return baseDecision;
  if (interpretation.difficulty === 'foundational' && !interpretation.requiresVerification) return baseDecision;
  const ladder = [baseDecision.primaryModelId, ...(baseDecision.fallbackModelIds || [])];
  const modelById = new Map((input.models || []).map((model) => [String(model.id || ''), model]));
  const ordered = ladder.map((id, index) => ({ id, index, score: reasoningScore(modelById.get(id) || { id }, interpretation) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.id);
  const primaryModelId = ordered[0] || baseDecision.primaryModelId;
  if (primaryModelId === baseDecision.primaryModelId) return baseDecision;
  return {
    ...baseDecision,
    primaryModelId,
    fallbackModelIds: ordered.slice(1),
    provider: primaryModelId.startsWith('gemini') ? 'gemini' : 'openrouter',
    reason: interpretation.requiresVerification ? 'study_verification' : 'study_depth',
    selectionSource: 'study_capability_route',
  };
}

export function publicStudyCognitiveMetadata(interpretation: StudyCognitiveInterpretation | null) {
  if (!interpretation) return undefined;
  return {
    version: interpretation.version,
    intent: interpretation.intent,
    difficulty: interpretation.difficulty,
    continuity: interpretation.continuity,
    capabilities: interpretation.capabilities,
    responseMode: interpretation.responseMode,
    requiresVerification: interpretation.requiresVerification,
  };
}
