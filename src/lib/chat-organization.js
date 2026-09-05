/**
 * Pin, rename, archive — the three chat actions the sidebar's ⋮ menu offers
 * beyond move and delete.
 *
 * WHY THIS IS A MODULE AND NOT THREE `setAllChatSessions` CALLBACKS
 *
 * Archive is the dangerous one. A chat that disappears from the list but is
 * still open on screen, or a project whose last chat is archived leaving the
 * composer talking to something the nav says does not exist, is a delete that
 * lies — and "archived" is exactly the label that stops a person worrying about
 * whether they can get it back. So the rule "archiving the chat you are reading
 * moves you somewhere real" is worth stating once, in a function, with a test,
 * rather than three times in a component.
 *
 * `handleDeleteChat` already had that rule and it is copied here deliberately:
 * archive is a soft delete, so it owes the same fallback.
 *
 * WHAT ARCHIVE MUST NOT BECOME
 *
 * Hiding a chat with no way to see it again is not archiving, it is deleting
 * with a friendlier word — the painted-door class this repo has an incident
 * for. `archivedChats` exists so the sidebar can always show the other half,
 * and `setChatArchived` takes a boolean rather than only ever setting true, so
 * unarchive is the same code path rather than a feature someone adds later.
 */

export const MAX_CHAT_TITLE = 80;

/** A chat's flags, tolerant of every session written before they existed. */
export function chatIsPinned(session) {
  return session?.pinned === true;
}

export function chatIsArchived(session) {
  return session?.archived === true;
}

/**
 * The title a rename produces, or null for one that must not be applied.
 *
 * Empty is null rather than "": a chat with a blank name is unclickable in a
 * list that is nothing but names. The cap matches the fork label's own.
 */
export function normalizeChatTitle(raw) {
  const trimmed = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_CHAT_TITLE);
}

function replaceSession(sessions, sessionId, patch) {
  const list = Array.isArray(sessions) ? sessions : [];
  let changed = false;
  const next = list.map((session) => {
    if (session?.id !== sessionId) return session;
    const fields = typeof patch === 'function' ? patch(session) : patch;
    if (!fields) return session;
    changed = true;
    return { ...session, ...fields, updatedAt: Date.now() };
  });
  return { changed, sessions: changed ? next : list };
}

export function renameChat({ sessions, sessionId, title }) {
  const normalized = normalizeChatTitle(title);
  if (!normalized) return { changed: false, sessions: Array.isArray(sessions) ? sessions : [] };
  return replaceSession(sessions, sessionId, (session) => (
    session.title === normalized ? null : { title: normalized }
  ));
}

export function toggleChatPinned({ sessions, sessionId }) {
  return replaceSession(sessions, sessionId, (session) => ({ pinned: !chatIsPinned(session) }));
}

/**
 * Archive or unarchive, and say where the reader should be left standing.
 *
 * `nextActiveSessionId` is null when nothing needs to move. It names a chat
 * when the archived one was open, and `needsNewChat` is true when archiving
 * emptied the project — the caller creates the replacement, because only it
 * knows how to build a session.
 */
export function setChatArchived({ sessions, sessionId, archived, activeSessionId = null, projectId = null }) {
  const result = replaceSession(sessions, sessionId, (session) => (
    chatIsArchived(session) === Boolean(archived) ? null : { archived: Boolean(archived) }
  ));
  if (!result.changed || !archived || activeSessionId !== sessionId) {
    return { ...result, nextActiveSessionId: null, needsNewChat: false };
  }
  const inProject = result.sessions.filter((session) => (
    (session.projectId || null) === projectId && !chatIsArchived(session)
  ));
  const next = inProject[0] || result.sessions.find((session) => !chatIsArchived(session)) || null;
  return {
    ...result,
    nextActiveSessionId: next?.id || null,
    needsNewChat: !next,
  };
}

/**
 * What the sidebar lists: archived chats out, pinned chats hoisted.
 *
 * A STABLE partition, not a re-sort. The list's existing order is what the
 * person has been navigating by; pinning promises "this one stays at the top",
 * and it does not promise to shuffle everything else underneath it.
 */
export function visibleChats(sessions = []) {
  const list = (Array.isArray(sessions) ? sessions : []).filter((session) => !chatIsArchived(session));
  return [...list.filter(chatIsPinned), ...list.filter((session) => !chatIsPinned(session))];
}

export function archivedChats(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).filter(chatIsArchived);
}
