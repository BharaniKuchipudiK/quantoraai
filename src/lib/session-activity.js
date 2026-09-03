/**
 * Which chat is Quantora actually working in?
 *
 * WHAT WAS WRONG
 *
 * `isGenerating` was one boolean for the whole studio. Two consequences, both
 * visible, neither reported as an error:
 *
 * 1. Start a build in chat A, switch to chat B, and B shows the working state.
 *    The spinner follows you into a conversation where nothing is happening.
 *    The reply, meanwhile, correctly lands back in A — so the one signal the
 *    user has is pointing at the wrong chat.
 *
 * 2. `if (isGenerating) return;` then refuses the send in B. Not an error, not
 *    a message — the composer simply does nothing. A control that silently
 *    ignores you is worse than one that says no.
 *
 * WHAT THIS FIXES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * This makes the state HONEST: the working indicator names the chat that is
 * really working, and a refused send says why and where.
 *
 * It does NOT make two turns run at once, and it must not pretend to. The hook
 * keeps ONE `generationTokenRef`, and `stillCurrent()` compares against it — so
 * a second turn starting anywhere makes the first turn's guards return false
 * and it stops writing, silently, mid-build. That single slot is not an
 * oversight to route around; it is the mechanism that makes one-turn-at-a-time
 * safe. Real concurrency needs a token and an abort controller per session,
 * which is a change to every guard in that file and belongs in its own review.
 *
 * So the busy state stays global on purpose, and the copy says "one at a time"
 * because that is true. Claiming multitask here and delivering a turn that dies
 * halfway would be the more expensive lie.
 */

/** Sessions currently running a turn. A Set, copied on write so React sees it. */
export function startSessionWork(working, sessionId) {
  if (!sessionId) return working instanceof Set ? working : new Set();
  const next = new Set(working instanceof Set ? working : []);
  next.add(sessionId);
  return next;
}

/**
 * Ends work for the session the turn STARTED in, which is not always the one
 * on screen. That parameter is the whole point: a turn finishing after the user
 * navigated away must clear the chat it belonged to, or that chat spins for
 * ever and the one being read goes quiet while it is still working.
 */
export function endSessionWork(working, sessionId) {
  if (!(working instanceof Set) || !sessionId || !working.has(sessionId)) {
    return working instanceof Set ? working : new Set();
  }
  const next = new Set(working);
  next.delete(sessionId);
  return next;
}

export function isSessionWorking(working, sessionId) {
  return working instanceof Set && Boolean(sessionId) && working.has(sessionId);
}

export function anySessionWorking(working) {
  return working instanceof Set && working.size > 0;
}

/** The first session still working, or null — used to name it to the user. */
export function firstWorkingSession(working) {
  if (!(working instanceof Set)) return null;
  for (const id of working) return id;
  return null;
}

/**
 * Why this send was refused, or '' when it may proceed.
 *
 * Returning a SENTENCE rather than a boolean is the fix for the second defect
 * above. `if (isGenerating) return;` discarded the message with no explanation;
 * the user retyped it, pressed send again, and watched nothing happen twice.
 *
 * It names the other chat, because "Quantora is busy" in a chat that looks idle
 * is not an explanation — it reads like a bug.
 */
export function sendBlockedReason(working, activeSessionId, titleFor = () => '') {
  if (!anySessionWorking(working)) return '';
  if (isSessionWorking(working, activeSessionId)) {
    return 'Quantora is still working on this chat. Wait for it to finish, or press Stop.';
  }
  const otherId = firstWorkingSession(working);
  const title = String(titleFor(otherId) || '').trim();
  return title
    ? `Quantora is building in “${title}”. It runs one build at a time — wait for that to finish, or stop it there first.`
    : 'Quantora is building in another chat. It runs one build at a time — wait for that to finish, or stop it there first.';
}

/** The sidebar's per-chat mark. Empty when that chat is idle. */
export function sessionActivityLabel(working, sessionId) {
  return isSessionWorking(working, sessionId) ? 'working' : '';
}
