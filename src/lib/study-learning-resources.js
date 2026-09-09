import { studyMicroVisualPromptHint } from './study-micro-visuals.js';
import { studyPicturePromptHint } from './study-pictures.js';

export function studyIcebreakerAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Open ${label} like a thoughtful tutor meeting the learner where they are.`,
    'First infer whether they sound curious, stuck, rushed, or unsure from the conversation already present.',
    'Acknowledge that state in one natural sentence only when it genuinely helps; never use generic praise.',
    studyPicturePromptHint(label),
    studyMicroVisualPromptHint(),
    'Use one true hook or small visual only if it makes the idea easier to enter.',
    'Then ask ONE short question that helps you understand what they already think, and STOP. Do not dump the lesson underneath it.',
    'No leaderboard, points, or rank. Do not plan trips.',
  ].join(' ');
}

export function studyLessonAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Teach ONE idea about ${label} in this message — not a whole chapter.`,
    'Read the learner’s last turn first. If they sound confused or frustrated, acknowledge the exact difficulty in one human sentence before teaching; otherwise begin naturally without a ceremonial greeting.',
    studyPicturePromptHint(label),
    studyMicroVisualPromptHint(),
    'Speak directly to the learner in two or three natural paragraphs, adapted to the context already present in this conversation.',
    'Begin from something familiar, connect it to the idea, and name the likely misconception in ordinary language.',
    'Do not use labels such as “Why it is relevant”, “Context-aware question”, “Key takeaway”, or narrate the teaching structure.',
    'Use at most one short formula in $$...$$ unless the learner asks for a derivation.',
    'For mechanics or physics, include a subject-specific picture caption that names the actual motion and forces; never use a decorative generic visual.',
    'A single relevant emoji is welcome when it adds warmth, but never decorate every line.',
    'End on ONE short diagnostic or application question. Do not append a summary, a second question, or a list of next steps. STOP there so the learner can answer.',
    'Do not invent a specific YouTube video, channel episode, or URL.',
  ].join(' ');
}

export function studyExplainDifferentlyAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Explain ${label} differently because the previous explanation may not have landed.`,
    'Start with one brief acknowledgement such as “Let’s try this another way” only if it fits the conversation; do not apologise or over-praise.',
    'Do NOT repeat the same wording, structure, analogy, or worked example from the previous explanation.',
    'Switch modality deliberately: if the last answer was abstract, use a concrete analogy; if it was verbal, use a simple subject-aware picture; if it was an analogy, use a tiny worked example; if it was procedural, explain the underlying intuition.',
    studyPicturePromptHint(label),
    studyMicroVisualPromptHint(),
    'Teach one idea only. Keep it short and conversational.',
    'End with ONE quick question that reveals whether this new explanation worked, then STOP.',
  ].join(' ');
}

export function studyVisualExplainAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Show ${label} visually in the simplest useful way.`,
    'Honor the active Study representation directive for this turn. If it requires the native lab, render that governed lab instead of substituting a static picture.',
    'Otherwise use one subject-aware <quantora-study-picture> caption when the existing Study visual system can teach the relationship. Never add a decorative image merely to make the answer pretty.',
    studyPicturePromptHint(label),
    studyMicroVisualPromptHint(),
    'Give at most two short sentences around the visual: what to notice before it, and one question after it.',
    'If the concept cannot be represented honestly with the available visual language, say that briefly and use a tiny text sketch instead of inventing an image URL or pretending a diagram exists.',
    'STOP after one question.',
  ].join(' ');
}

/** Learner-facing copy for Study controls whose detailed model ask stays hidden. */
export function studyActionVisibleText(action, topic) {
  const label = String(topic || 'this idea').trim();
  const messages = {
    icebreaker: `Help me get curious about ${label}.`,
    lesson: `Explain ${label} like a real tutor.`,
    different: `Explain ${label} a different way.`,
    visual: `Show me ${label} visually.`,
    practice: `Give me one practice question on ${label}.`,
    quiz: `Check my understanding of ${label}.`,
    flashcards: `Make a few flashcards for ${label}.`,
    application: `Show me where ${label} is useful.`,
    'real-world': `Show me ${label} in the real world.`,
    'where-next': `Help me choose where to go next after ${label}.`,
    plan: `Help me plan what to study next for ${label}.`,
    notes: `Turn our work on ${label} into concise notes.`,
    next: `Give me a different question on ${label}.`,
    example: `Show me another example of ${label}.`,
    reference: `Find one useful reference for ${label}.`,
  };
  return messages[action] || `Help me with ${label}.`;
}

export function studyQuizAsk(topic) {
  return `Quiz me on ${String(topic || 'this idea').trim()} with 3 short questions that fit the current conversation and learner context. Ask only the first question now and wait for my answer. After each answer, give specific feedback about my reasoning before asking the next one. Do not give the answers first.`;
}

export function studyPracticeAsk(topic) {
  return `Give me one short practice problem on ${String(topic || 'this idea').trim()}. Use the current conversation and my learning context. Ask only the problem now. Wait for my attempt before explaining or grading it; after I answer, recognise the specific part of my reasoning that was right or useful before correcting anything that needs repair.`;
}

export function studyAnotherExampleAsk(topic) {
  return `Show one short, different worked example for ${String(topic || 'this idea').trim()} that directly repairs the misconception in my last answer. Start by acknowledging the exact point that caused trouble, then contrast the mistaken idea with the correct one. Ask one fresh question and wait.`;
}

export function studyUsefulReferenceAsk(topic) {
  return `Recommend one genuinely useful reference for the exact gap we just found in ${String(topic || 'this idea').trim()}. Use a verified link already available in this session; otherwise give one precise search objective instead of inventing a URL.`;
}

export function studyNextQuestionAsk(topic) {
  return `That question is complete. Briefly recognise what the learner demonstrated, then ask one new, non-repeating question on ${String(topic || 'this idea').trim()} that checks transfer rather than the same wording. Wait for my attempt.`;
}

export function studyFlashcardAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return [
    `Create 3 to 5 genuine recall flashcards for ${label} using only concepts supported by the current conversation.`,
    'Put each card on its own line in this exact form: <quantora-study-flashcard front="one focused retrieval prompt" back="one concise answer" />',
    'Do not use a Markdown table, numbered answer list, or show the backs anywhere else in the reply.',
    'Keep the front answerable from memory and the back precise enough to correct a misconception. Do not add a vague “Your turn” paragraph.',
  ].join(' ');
}

export function studyApplicationAsk(topic) {
  return `Help me apply ${String(topic || 'this idea').trim()} to a real situation that fits the current learning context. Pick the example from the subject and level already established in this conversation, explain why it is relevant in natural tutor language, and then give me one short application question.`;
}

export function studyRealWorldAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return `Show one vivid real-world application of ${label} that fits the learner context already established. Start inside the familiar scene, then connect the observation to the precise idea in natural tutor language. Include a subject-aware picture tag if it teaches something. End on one short question; do not add generic headings or unrelated applications.`;
}

export function studyWhereNextAsk(topic) {
  const label = String(topic || 'this idea').trim();
  return `Based only on this learner's conversation and verified evidence, offer three concise next moves after ${label}: one to strengthen understanding, one to apply it, and one to explore next. Explain the value of each in a short phrase and ask the learner to choose. Do not prescribe a generic chapter sequence or invent mastery.`;
}

export function studyCompassMissionAsk(recommendation) {
  const label = String(recommendation?.label || 'this concept').trim();
  const action = String(recommendation?.recommendedActionType || 'guided_repair').trim();
  const minutes = Math.max(3, Math.min(240, Number(recommendation?.suggestedDurationMinutes) || 10));
  return [
    `Begin the Learning Compass recommendation for ${label}.`,
    `The governed deterministic engine selected action type ${action} for a ${minutes}-minute learning step.`,
    'Use the verified learner context already present, but do not invent mastery, scores, or evidence.',
    'Teach or diagnose one focused step now, then ask one short question and stop for the learner.',
  ].join(' ');
}

export function studyPlanAsk(topic) {
  return `Help me plan the next study steps for ${String(topic || 'this idea').trim()} from the context already known in this conversation. Use known constraints first, ask only for material information that is missing, protect realistic study and rest time, and prioritize prerequisite gaps before extra volume.`;
}

export function studyNotesAsk(topic) {
  return `Turn what we have actually established in this conversation about ${String(topic || 'this idea').trim()} into concise study notes. Separate verified ideas, open questions, and any misconception or prerequisite that still needs work. Do not introduce unsupported facts merely to make the notes look complete.`;
}
