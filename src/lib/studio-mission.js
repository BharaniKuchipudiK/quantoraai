import { normalizeSessionContext } from './session-context.js';

export const CANNED_PROJECT_DESCRIPTION = 'A flexible space for everyday questions and ideas.';

const BUILDISH = /\b(build|create|make|develop|design|website|web site|calculator|app|shop|boutique|store|landing)\b/i;

export function isCannedProjectDescription(text) {
  return String(text || '').trim() === CANNED_PROJECT_DESCRIPTION;
}

function clip(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function officeKindFromFacts(facts = []) {
  for (const fact of facts) {
    const match = String(fact || '').match(/outcome kind:\s*(powerpoint|word|excel)/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function sessionHasPreview(session) {
  return (session?.messages || []).some((message) => message?.officeAttachment || message?.codeSnippet);
}

export function sessionActivityAt(session) {
  const created = Number(session?.createdAt) || 0;
  const messages = session?.messages || [];
  const lastId = messages.length ? Number(messages[messages.length - 1]?.id) : 0;
  return Math.max(created, Number.isFinite(lastId) ? lastId : 0);
}

export function deriveSessionResume(session) {
  if (!session) return null;
  return deriveStudioMission({
    conversationContext: session.conversationContext || {},
    messages: session.messages || [],
    hasPreview: sessionHasPreview(session),
    officeKind: officeKindFromFacts(session.conversationContext?.facts),
  });
}

/**
 * Project-level "where you were" from the most recently active chat that has a mission.
 */
export function deriveProjectResume(sessions = []) {
  const ranked = [...sessions].sort((left, right) => sessionActivityAt(right) - sessionActivityAt(left));
  for (const session of ranked) {
    const mission = deriveSessionResume(session);
    if (mission?.goal || mission?.next) {
      return {
        ...mission,
        sessionId: session.id,
        sessionTitle: session.title || 'Chat',
      };
    }
  }
  return null;
}

export function pickResumeSessionId(sessions = []) {
  const resume = deriveProjectResume(sessions);
  if (resume?.sessionId) return resume.sessionId;
  const ranked = [...sessions].sort((left, right) => sessionActivityAt(right) - sessionActivityAt(left));
  return ranked[0]?.id || null;
}

export function isResumeSession(session, projectResume) {
  const sessionId = typeof session === 'string' ? session : session?.id;
  return Boolean(sessionId && projectResume?.sessionId && sessionId === projectResume.sessionId);
}

/**
 * Sticky world model for a Studio session: what we are building, what is true,
 * what is next. Derived locally so a missing quantora-ctx comment cannot wipe it.
 */
export function deriveStudioMission({
  conversationContext = {},
  messages = [],
  hasPreview = false,
  continueLabel = '',
  officeKind = null,
  studioDomain = null,
  lastTurnFailed = false,
} = {}) {
  // "Building: X" next to a turn that just died reads as work still happening.
  // The failure line is the only honest thing to say at that moment.
  if (lastTurnFailed) return null;
  const ctx = normalizeSessionContext(conversationContext);
  const users = (messages || [])
    .filter((message) => message?.sender === 'user' && message.text)
    .map((message) => String(message.text).trim())
    .filter(Boolean);
  const buildRequest = [...users].reverse().find((text) => BUILDISH.test(text)) || users[0] || '';
  const goal = ctx.goal || clip(buildRequest);
  const lifeDomain = studioDomain === 'travel'
    || studioDomain === 'education'
    || studioDomain === 'finance'
    || studioDomain === 'research';
  const remembered = isCannedProjectDescription(ctx.understanding) ? '' : ctx.understanding;
  const understanding = remembered
    || (hasPreview && officeKind
      ? 'An Office file is in Preview. This is not a website.'
      : '');
  const next = continueLabel
    || (hasPreview && officeKind
      ? 'Download the file, or tell me which slide or section to change.'
      : '');
  const lead = studioDomain === 'travel'
    ? 'Planning'
    : studioDomain === 'education'
      ? 'Learning'
      : studioDomain === 'finance'
        ? 'Working through'
        : studioDomain === 'research'
          ? 'Investigating'
          : 'Building';

  if (!goal && !understanding && !next && !(ctx.facts || []).length) return null;

  return {
    lead,
    goal,
    understanding,
    facts: ctx.facts || [],
    next,
    hasPreview: Boolean(hasPreview),
  };
}
