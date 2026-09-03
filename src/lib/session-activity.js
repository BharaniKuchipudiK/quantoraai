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

/*
 * WHAT MAY RUN AT ONCE, AND WHY IT IS NOT EVERYTHING
 *
 * Turns are tracked by KIND, not merely by session, because the desk is a
 * single piece of state. `vfs` in AiStudio is one object, swapped in and out as
 * you change chats — so two builds running at once would each call setVfs and
 * write their files into whichever desk happened to be on screen. That is
 * corruption of the user's project, and it is worse than the problem
 * concurrency solves.
 *
 * So: a build holds the desk, studio-wide, exactly as before. Everything that
 * does NOT touch the desk — questions, advice, research, a travel or finance
 * chat — runs alongside it. That is the common case anyway: you ask something
 * in another chat while a build runs.
 *
 * Making the desk per-session would lift that restriction and is a much larger
 * change. Until then the rule is stated rather than fudged, because a build
 * that silently ate another build's files would be the expensive kind of lie.
 */

/** A turn's kind. Only 'build' touches the desk. */
export const TURN_BUILD = 'build';
export const TURN_CHAT = 'chat';

/** Sessions currently running a turn, as sessionId → kind. Copied on write. */
export function startSessionWork(working, sessionId, kind = TURN_CHAT) {
  const next = new Map(working instanceof Map ? working : []);
  if (!sessionId) return next;
  next.set(sessionId, kind === TURN_BUILD ? TURN_BUILD : TURN_CHAT);
  return next;
}

/**
 * Ends work for the session the turn STARTED in, which is not always the one
 * on screen. That parameter is the whole point: a turn finishing after the user
 * navigated away must clear the chat it belonged to, or that chat spins for
 * ever and the one being read goes quiet while it is still working.
 */
export function endSessionWork(working, sessionId) {
  const next = new Map(working instanceof Map ? working : []);
  if (sessionId) next.delete(sessionId);
  return next;
}

export function isSessionWorking(working, sessionId) {
  return working instanceof Map && Boolean(sessionId) && working.has(sessionId);
}

/** The session running a desk-writing build, or null. At most one may exist. */
export function buildingSession(working) {
  if (!(working instanceof Map)) return null;
  for (const [id, kind] of working) if (kind === TURN_BUILD) return id;
  return null;
}

/**
 * How many turns may run at once.
 *
 * Not a technical ceiling — the per-session tokens below would allow more. It is
 * a SPEND ceiling. Every concurrent turn bills the user's meter independently,
 * and a studio that will start a build in every chat you open is a studio that
 * can empty an account while its owner is reading one of them. Three is enough
 * to work in parallel and small enough that the bill stays comprehensible.
 */
export const MAX_CONCURRENT_TURNS = 3;

/**
 * Why this send was refused, or '' when it may proceed.
 *
 * Returning a SENTENCE rather than a boolean is the fix for the defect this
 * module was written for: `if (isGenerating) return;` discarded the message with
 * no explanation, the user retyped it, pressed send again, and watched nothing
 * happen twice.
 *
 * Two refusals remain, and only two. A chat cannot run two turns at once — the
 * second would take over that session's token and the first would stop writing
 * mid-build. And the whole studio stops at MAX_CONCURRENT_TURNS, for the money
 * reason above. Working in ANOTHER chat is no longer a refusal at all.
 */
export function sendBlockedReason(working, activeSessionId, options = {}) {
  const titleFor = typeof options.titleFor === 'function' ? options.titleFor : () => '';
  const named = (id) => {
    const title = String(titleFor(id) || '').trim();
    return title ? `“${title}”` : 'another chat';
  };

  if (isSessionWorking(working, activeSessionId)) {
    return 'Quantora is still working on this chat. Wait for it to finish, or press Stop.';
  }

  // The desk is one object. A second build would write into the first's files.
  if (options.isBuild === true) {
    const builder = buildingSession(working);
    if (builder) {
      return `Quantora is building in ${named(builder)}. Builds share one desk, so they run one at a time — wait for that to finish, or stop it there. You can still ask questions in other chats.`;
    }
  }

  if (working instanceof Map && working.size >= MAX_CONCURRENT_TURNS) {
    const names = [...working.keys()].map((id) => String(titleFor(id) || '').trim()).filter(Boolean);
    // Naming them is the difference between a limit and a mystery: the user can
    // see what is spending, and go and stop one.
    const where = names.length ? ` (${names.join(', ')})` : '';
    return `Quantora is already running ${working.size} turns${where}. That is the limit — each one costs credits, so finish or stop one before starting another.`;
  }

  return '';
}

/** The sidebar's per-chat mark. Empty when that chat is idle. */
export function sessionActivityLabel(working, sessionId) {
  return isSessionWorking(working, sessionId) ? 'working' : '';
}
