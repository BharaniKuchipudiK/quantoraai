const LONG_ADVISOR_USER_TURNS = 20;

function countUserTurns(messages = []) {
  return messages.filter((message) => message?.sender === 'user' && String(message.text || '').trim()).length;
}

export function newThreadLabel(domain) {
  if (domain === 'travel') return 'New trip';
  if (domain === 'education') return 'New topic';
  return 'New Chat';
}

/**
 * Clicking Travel/Study in the sidebar should open that desk, not spawn a
 * blank thread every time. New trip / New topic is the explicit fresh start.
 */
export function resolveAdvisorSidebarClick({
  currentDomain = null,
  requestedDomain = null,
  sessions = [],
  activeSessionId = null,
    projectId = 'project-personal',
} = {}) {
  if (!requestedDomain) return { type: 'stay' };
  if (currentDomain === requestedDomain) return { type: 'stay' };

  const match = sessions
    .filter((session) => session?.studioDomain === requestedDomain
      && (session.projectId || 'project-personal') === projectId)
    .sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0))[0];

  if (match?.id && match.id !== activeSessionId) {
    return { type: 'switch', sessionId: match.id };
  }
  if (match?.id) return { type: 'stay' };
  return { type: 'create' };
}

export { LONG_ADVISOR_USER_TURNS, countUserTurns };
