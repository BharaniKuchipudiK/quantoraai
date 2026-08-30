import { isRepositoryScanTask } from './session-context.js';

/**
 * Detect Study control prompts that are meant for the model, never the learner.
 * Older sessions may already contain these as persisted user messages, so this
 * guard belongs at every read boundary as well as the send boundary.
 */
export function isPrivateStudyInstruction(text = '') {
  const value = String(text || '');
  if (/<quantora-study-(?:picture|flashcard)\b/i.test(value)) return true;

  // One shared detector owns the old repository-scan shape, including shortened
  // transcript variants. Do not duplicate the poisoned sentence in Study rules.
  if (isRepositoryScanTask(value)) return true;

  const markers = [
    /do not invent (?:image urls?|youtube ids?|a specific youtube)/i,
    /ask me to signal that i am ready/i,
    /no leaderboard,? points,? or rank/i,
    /do not plan trips/i,
    /put this tag on its own line/i,
    /teach one idea about/i,
    /stay at .{0,80}(?:cbse|ncert).{0,80}do not turn/i,
    /one idea,? a picture tag,? then wait/i,
  ];
  return markers.filter((pattern) => pattern.test(value)).length >= 2;
}

export function withoutPrivateStudyInstructions(messages = [], studioDomain = '') {
  if (studioDomain !== 'education') return messages;
  const visible = [];
  let suppressTurn = false;
  for (const message of messages || []) {
    if (message?.sender === 'user') {
      suppressTurn = isPrivateStudyInstruction(message?.text);
      if (suppressTurn) continue;
    } else if (suppressTurn && message?.sender === 'ai') {
      continue;
    }
    visible.push(message);
  }
  return visible;
}
