import { normalizeSessionContext } from './session-context.js';

const BUILDISH = /\b(build|create|make|develop|design|website|web site|calculator|app|shop|boutique|store|landing)\b/i;

function clip(text, max = 140) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
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
} = {}) {
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
  const understanding = ctx.understanding
    || (hasPreview && officeKind
      ? 'An Office file is in Preview. This is not a website.'
      : hasPreview && !lifeDomain ? 'A working preview is on screen for this session.' : '');
  const next = continueLabel
    || (hasPreview && officeKind
      ? 'Download the file, or tell me which slide or section to change.'
      : hasPreview && !lifeDomain ? 'Tweak it, add a missing business piece, or publish.' : '');
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
