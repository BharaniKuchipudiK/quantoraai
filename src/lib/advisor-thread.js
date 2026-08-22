const LONG_ADVISOR_USER_TURNS = 20;

function countUserTurns(messages = []) {
  return messages.filter((message) => message?.sender === 'user' && String(message.text || '').trim()).length;
}

export function newThreadLabel(domain) {
  if (domain === 'travel') return 'New trip';
  if (domain === 'education') return 'New topic';
  return 'New Chat';
}

export function longAdvisorThreadCopy(domain) {
  if (domain === 'travel') {
    return {
      now: 'This trip is getting long.',
      next: 'Start a new trip, or keep going and I may forget early details. This trip stays in your list.',
      action: 'New trip',
    };
  }
  if (domain === 'education') {
    return {
      now: 'This topic is getting long.',
      next: 'Start a new topic, or keep going and I may forget earlier checks. This topic stays in your list.',
      action: 'New topic',
    };
  }
  return null;
}

export function shouldWarnLongAdvisorThread({ messages = [], domain = null } = {}) {
  if (domain !== 'travel' && domain !== 'education') return false;
  return countUserTurns(messages) >= LONG_ADVISOR_USER_TURNS;
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
