import { normalizeSessionContext } from './session-context.js';

export const CANNED_PROJECT_DESCRIPTION = 'A flexible space for everyday questions and ideas.';

const BUILDISH = /\b(build|create|make|develop|design|website|web site|calculator|app|shop|boutique|store|landing|agent|dashboard|cleaner)\b/i;
const GOAL_MAX = 72;
const LEAD_IN = /^(?:(?:please|pls|hey|hi|hello)[,!]?\s+)+/i;
const GREETING_SENTENCE = /^(?:(?:hi|hey|hello|yo|thanks|thank you)[.!,]?\s+)+/i;
const HELP_ME = /^(?:(?:can|could|would|will)\s+you\s+)?(?:(?:help|assist)\s+me(?:\s+to|\s+with)?\s+)/i;
const CAN_YOU = /^(?:(?:can|could|would|will)\s+you\s+)/i;
const I_WANT = /^(?:i\s+(?:want|need|would\s+like)\s+to\s+|i'?d\s+like\s+to\s+|i'?m\s+(?:trying|looking)\s+to\s+)/i;
const BUILD_LEAD = /^(?:build|create|make|develop|design|implement|code|write)\s+(?:me\s+)?(?:an?\s+|the\s+)?/i;
// Explicit Drive product names only — bare "drive" is often the verb ("drive sales").
const DOMAIN_RE = /\b(google\s+drive|g\s*drive|my\s+drive|gmail|slack|notion|github|weather|sarees?|boutique|ios|android|mauritius|newton(?:'?s)?(?:\s+laws?)?|ham\s+sam)\b/i;

export function isCannedProjectDescription(text) {
  return String(text || '').trim() === CANNED_PROJECT_DESCRIPTION;
}

function clip(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function firstClause(text) {
  // "Hi. Build a calculator" — drop greeting sentences, keep the ask.
  let value = String(text || '').replace(GREETING_SENTENCE, '').trim();
  return value
    .split(/[.!?]+\s+/)[0]
    .split(/\s+and also\s+/i)[0]
    .split(/\s+and then\s+/i)[0]
    .trim();
}

function stripLeadIns(text) {
  let value = String(text || '').trim();
  let previous = '';
  while (value && value !== previous) {
    previous = value;
    value = value
      .replace(LEAD_IN, '')
      .replace(HELP_ME, '')
      .replace(CAN_YOU, '')
      .replace(I_WANT, '')
      .trim();
  }
  return value;
}

function titleCaseWords(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      if (/^(ai|api|ios|ham|sam)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractDomain(text) {
  const match = String(text || '').match(DOMAIN_RE);
  if (!match) return '';
  const raw = match[0].replace(/\s+/g, ' ').trim();
  if (/google\s*drive|g\s*drive|my\s+drive/i.test(raw)) return 'Google Drive';
  return titleCaseWords(raw);
}

function composeProductDomain(product, domain) {
  const head = String(product || '').replace(/\s+/g, ' ').trim();
  const place = String(domain || '').replace(/\s+/g, ' ').trim();
  if (!head) return place;
  if (!place) return head;
  const headLower = head.toLowerCase();
  const placeLower = place.toLowerCase();
  if (headLower.includes(placeLower)) return head;
  // "Drive Cleaner…" already names Drive — don't prefix "Google Drive".
  const placeCore = placeLower.replace(/^google\s+/, '');
  if (placeCore && headLower.includes(placeCore)) return head;
  return `${place} ${head}`.replace(/\s+/g, ' ').trim();
}

/**
 * Mission cards show Cursor-like brevity: a short product title, never the
 * raw multi-sentence build prompt under "Building:".
 */
export function toShortMissionGoal(text, max = GOAL_MAX) {
  let value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';

  value = firstClause(value);
  value = stripLeadIns(value);

  const built = value.match(BUILD_LEAD);
  if (built) {
    value = value.slice(built[0].length).trim();
  }

  const forMatch = value.match(/^(.+?)\s+for\s+(?:my\s+|our\s+|a\s+|the\s+)?(.+)$/i);
  if (forMatch) {
    const product = forMatch[1].trim();
    const rest = forMatch[2].trim();
    const domain = extractDomain(rest)
      || (rest.length <= 28 && !/\s+(?:that|which|who)\s+/i.test(rest) ? rest : '');
    if (domain) {
      const composed = composeProductDomain(product, domain);
      // Product already names the domain — drop redundant "for my Google Drive".
      if (composed === product) {
        value = product;
      } else if (value.length > max || /\s+(?:that|which|who)\s+/i.test(rest)) {
        value = composed;
      }
    }
  }

  // "AI agent that help me to go through my google drive…" → "Google Drive AI agent"
  // Skip when a "for …" phrase owns the relative clause (handled above).
  const thatIdx = value.search(/\s+that\s+/i);
  if (thatIdx >= 2 && !/\s+for\s+/i.test(value.slice(0, thatIdx))) {
    const head = value.slice(0, thatIdx).trim();
    const domain = extractDomain(value.slice(thatIdx)) || extractDomain(value);
    const composed = composeProductDomain(head, domain);
    if (composed && (value.length > max || domain || /\bthat\s+(?:help|helps|will|can|should|would|cleans?|goes?|tracks?|analyses?|analyzes?)\b/i.test(value))) {
      value = composed;
    }
  }

  if (value) {
    value = value.replace(/[?!.]+$/g, '').trim();
    if (value) value = value.charAt(0).toUpperCase() + value.slice(1);
  }

  return clip(value, max);
}

function goalTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

/**
 * Sticky Study/other-chat memory must not own this thread's mission card.
 * Prefer this session's build request when it describes a different job.
 */
export function pickSessionMissionGoal(stickyGoal = '', buildRequest = '') {
  const fromMessages = toShortMissionGoal(buildRequest);
  const sticky = toShortMissionGoal(stickyGoal);
  if (!fromMessages) return sticky;
  if (!sticky) return fromMessages;
  const left = goalTokens(sticky);
  const right = goalTokens(fromMessages);
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  if (overlap >= 2) return sticky;
  return fromMessages;
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
  // conversationContext.goal is sticky across turns (and can bleed from Study in
  // a shared Personal Workspace). This chat's build request wins when they diverge.
  const goal = pickSessionMissionGoal(ctx.goal, buildRequest);
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
