import { planStudyTeachingRepresentation, type StudyTeachingRepresentationPlan } from './study-teaching-representation.js';
import { evaluateStudyLearningIntervention, type StudyLearningIntervention } from './study-learning-intervention.js';
import { planStudyAdaptiveLessonLoop, type StudyAdaptiveLessonLoopPlan } from './study-adaptive-lesson-loop.js';

export const STUDY_COGNITIVE_ROUTING_VERSION = 'study-cognitive-routing-2026-09-03.7';

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
  representation: StudyTeachingRepresentationPlan;
  intervention: StudyLearningIntervention;
  lessonLoop: StudyAdaptiveLessonLoopPlan;
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
const STUDY_FAST_WORKHORSE_ID = 'deepseek/deepseek-v4-flash-0731';
const REPRESENTATION_CONTROL_ONLY_RE = /^\s*(?:(?:can|could|would|will|please)\s+)?(?:you\s+)?(?:show|draw|sketch|teach|tell|explain)\s+(?:me\s+)?(?:it\s+)?(?:(?:using|with|as|in)\s+)?(?:(?:a|an)\s+)?(?:images?|pictures?|diagrams?|visual(?:ly)?|graphs?|story|analogy|example|step[- ]by[- ]step)(?:\s+instead)?[?.!]*\s*$/i;
const STRUGGLE_CONTROL_ONLY_RE = /^\s*(?:i\s+(?:still\s+)?(?:don'?t|do not)\s+(?:understand|get(?:\s+it)?|know)|i\s+don'?t\s+know|(?:i\s+am\s+)?confused|(?:i\s+am\s+)?lost|not getting it|too hard|still difficult to understand|doesn['’]?t make sense|make it easy(?:er)?(?: for me)?|simplify(?: it)?|explain again|another way)\W*$/i;

function textOf(item: HistoryItem): string { return String(item?.text || item?.content || '').trim(); }
function isAssistant(item: HistoryItem): boolean { return item?.sender === 'ai' || item?.role === 'assistant' || item?.role === 'model'; }
function recentConversationExists(history: HistoryItem[]): boolean { return Array.isArray(history) && history.slice(-8).some((item) => textOf(item).length > 0); }
function isRepresentationControlOnly(text: string): boolean {
  return CONTINUE_RE.test(text) || REPRESENTATION_CONTROL_ONLY_RE.test(text) || STRUGGLE_CONTROL_ONLY_RE.test(text);
}

/**
 * Representation capability must be anchored to the current learner-owned
 * concept, never to an arbitrary mixed transcript window. Otherwise an older
 * mechanics turn can leak "force" into a later unsupported Electricity lesson
 * and make the server request the wrong visual. The nearest substantive learner
 * turn is the safe fallback when the current message is only a teaching-control
 * utterance such as "show me visually" or "make it easier".
 */
function representationContextFor(message: string, history: HistoryItem[]): string {
  if (message && !isRepresentationControlOnly(message)) return message;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (isAssistant(item)) continue;
    const text = textOf(item);
    if (!text || isRepresentationControlOnly(text)) continue;
    return text;
  }
  return message;
}

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
  const contextText = representationContextFor(message, history);
  const intervention = evaluateStudyLearningIntervention({ message, history });
  const representation = planStudyTeachingRepresentation({ message, contextText, history, intervention });
  const lessonLoop = planStudyAdaptiveLessonLoop({ intent, representation, intervention });
  return {
    version: STUDY_COGNITIVE_ROUTING_VERSION,
    intent,
    difficulty,
    continuity,
    capabilities: capabilitiesFor(intent, input.hasImages === true),
    responseMode,
    requiresVerification,
    temperatureCeiling: requiresVerification ? 0.2 : difficulty === 'advanced' ? 0.3 : 0.5,
    representation,
    intervention,
    lessonLoop,
  };
}

export function formatStudyCognitiveDirective(interpretation: StudyCognitiveInterpretation | null): string {
  if (!interpretation) return '';
  const representationFallback = interpretation.representation.fallback === 'none'
    ? 'none'
    : `${interpretation.representation.fallback} — do not claim that an unsupported visual, graph, simulation, or interactive surface was rendered`;
  const rendererInstruction = interpretation.representation.rendererRequired
    ? `yes — the response must use the supported representation rather than silently falling back to prose; use the ${interpretation.representation.rendererKind || 'subject-native'} renderer and anchor the explanation to what the learner can see`
    : 'no';
  const waitInstruction = interpretation.lessonLoop.mustWaitForLearner
    ? `YES — ask at most ${interpretation.lessonLoop.maxLearnerQuestions} learner question, end on that question, and do not reveal the next beat or its answer in the same response`
    : 'no forced wait — answer the current request directly and do not invent a question merely to create interactivity';
  const teachingBeatsInstruction = interpretation.lessonLoop.reason === 'continuation_policy'
    ? 'defer to the authoritative Study teaching-turn policy: choose the next useful SEE, EXPLAIN, TRY, or VERIFY beat for the established concept; do not restart the hook'
    : `${interpretation.lessonLoop.beats.join(' -> ')}. Do not continue into later beats.`;
  return `\n\nSTUDY COGNITIVE ROUTE (${interpretation.version})
This directive applies only because the active workspace is Study Tutor.
- Learner intent: ${interpretation.intent}
- Difficulty: ${interpretation.difficulty}
- Continuity: ${interpretation.continuity}; preserve the current lesson context and resolve references from the supplied history. Do not restart discovery when the reference is clear.
- Response mode: ${interpretation.responseMode}
- Required teaching capabilities: ${interpretation.capabilities.join(', ')}
- Teaching representation: ${interpretation.representation.primaryRepresentation}
- Representation reason: ${interpretation.representation.reason}
- Learner action: ${interpretation.representation.learnerAction}
- Renderer required: ${rendererInstruction}
- Representation fallback: ${representationFallback}
- Current teaching-path state: ${interpretation.intervention.state}; intervention: ${interpretation.intervention.action}. This is a teaching-strategy signal, NOT mastery evidence.
- Teaching beats for THIS response only: ${teachingBeatsInstruction}
- Wait boundary: ${waitInstruction}
- Verification: ${interpretation.requiresVerification ? 'required — check the learner\'s reasoning before agreeing, distinguish verified facts from inference, and explain the first material error' : 'not mandatory — remain accurate and do not invent learner understanding'}
Honor this route inside the existing Study teaching-turn policy. Keep one concept and one learner action in the turn. When repeated difficulty changes the representation, do not merely paraphrase the previous explanation. Do not expose routing, intervention, representation, or beat labels to the learner. Do not claim mastery or persistent learner knowledge from these conversational signals.`;
}

function isUnmeteredFreeEndpoint(model: ModelLike): boolean {
  const id = String(model.id || '');
  return model.pricingKind === 'free' || /:free$/i.test(id);
}

function hasStrongObservedQuality(model: ModelLike): boolean {
  const sampleSize = Number(model.quality?.sampleSize || 0);
  const score = Number(model.quality?.score);
  return sampleSize >= 8 && Number.isFinite(score) && score >= 75;
}

function reasoningScore(model: ModelLike, interpretation: StudyCognitiveInterpretation): number {
  const haystack = `${model.id || ''} ${model.name || ''} ${model.specialty || ''} ${model.description || ''}`.toLowerCase();
  let score = 0;
  if (/reason|deepseek|nemotron|gpt-oss|qwen/.test(haystack)) score += 30;
  if (/gemini|flash/.test(haystack)) score += interpretation.difficulty === 'foundational' ? 22 : 8;
  if (/coder/.test(haystack)) score -= 10;
  if (/gemini/.test(haystack)) score += 18;
  if (isUnmeteredFreeEndpoint(model) && !hasStrongObservedQuality(model)) score -= 28;
  if (model.quality?.sampleSize && model.quality.sampleSize >= 5 && Number.isFinite(model.quality.score)) {
    score += Math.max(0, Math.min(15, Number(model.quality.score) / 7));
  }
  return score;
}

/** Reorders only eligible rungs; never adds paid routes or overrides a pin. */
export function applyStudyCapabilityRouting(input: { interpretation: StudyCognitiveInterpretation | null; baseDecision: RoutingDecision; models?: ModelLike[]; explicitModelSelected?: boolean; hasImages?: boolean }): RoutingDecision {
  const { interpretation, baseDecision } = input;
  if (!interpretation || input.explicitModelSelected || input.hasImages) return baseDecision;
  const ladder = [baseDecision.primaryModelId, ...(baseDecision.fallbackModelIds || [])];
  if (interpretation.difficulty !== 'advanced' && !interpretation.requiresVerification) {
    const fastModelId = ladder.find((id) => id === STUDY_FAST_WORKHORSE_ID)
      || ladder.find((id) => id.startsWith('gemini'));
    if (!fastModelId || fastModelId === baseDecision.primaryModelId) return baseDecision;
    return {
      ...baseDecision,
      primaryModelId: fastModelId,
      fallbackModelIds: ladder.filter((id) => id !== fastModelId),
      provider: fastModelId.startsWith('gemini') ? 'gemini' : 'openrouter',
      hasVisionSupport: fastModelId.startsWith('gemini'),
      reason: 'study_fast_response',
      selectionSource: 'study_capability_route',
    };
  }
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
    hasVisionSupport: primaryModelId.startsWith('gemini'),
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
