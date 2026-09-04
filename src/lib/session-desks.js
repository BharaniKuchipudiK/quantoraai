/**
 * One desk per chat, instead of one desk for the whole studio.
 *
 * WHAT WAS SHARED, AND WHY THAT CAPPED CONCURRENCY
 *
 * `vfs` in AiStudio was a single object, swapped in and out as you changed
 * chats. So was every piece of state that describes the same build: the job
 * card, the review, the checkpoints, the preview entry, the build job, the
 * patch note, the last message already applied. Nine slots, one build.
 *
 * That is why #520 had to refuse a second build. Two of them would each call
 * setVfs and write their files into whichever desk happened to be on screen —
 * the user would watch one project grow another project's files, with no error
 * anywhere. Refusing was correct while the desk was shared. This module is what
 * makes the refusal unnecessary.
 *
 * THE RULE THIS EXISTS TO ENFORCE
 *
 * A write names the session it belongs to, and is diffed against THAT session's
 * desk. Never against the desk being looked at.
 *
 * That distinction is the whole feature. `commitDeskVfs` rejects a write that
 * would regress a working preview, and the comparison it makes is only
 * meaningful against the right baseline: diff a background build's files
 * against the visible chat's desk and you get a nonsense verdict — either a
 * spurious rejection that silently drops real work, or an accepted write that
 * overwrites the wrong project.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No React. The component still holds the active desk in ordinary state so the
 * hundred-odd readers of `vfs` are untouched; this owns the store behind it and
 * the rules about which desk a write lands on. Keeping those rules out of the
 * component is what lets them be tested at all.
 */

/** A desk that has never been opened. Shaped so callers never special-case null. */
export function emptyDesk() {
  return {
    vfs: {},
    job: null,
    review: [],
    checkpoints: [],
    workspaceCode: '',
    buildJob: null,
    patchNote: '',
    lastProcessedMessageId: null,
  };
}

/**
 * The desk for a session, creating an empty one rather than returning null.
 *
 * A missing desk and an empty desk are the same thing to every caller, and
 * making that true here removes a null check from each of them — the kind of
 * check that gets forgotten in one place and becomes a crash on a background
 * build nobody was watching.
 */
export function deskFor(desks, sessionId) {
  if (!(desks instanceof Map) || !sessionId) return emptyDesk();
  return desks.get(sessionId) || emptyDesk();
}

/**
 * Write a desk back for one session. Returns a NEW Map.
 *
 * Copy-on-write because React compares by identity: mutating in place leaves
 * every reader showing the previous build, which is the failure mode where a
 * user watches a finished build and sees nothing appear.
 */
export function putDesk(desks, sessionId, desk) {
  const next = new Map(desks instanceof Map ? desks : []);
  if (!sessionId) return next;
  next.set(sessionId, { ...emptyDesk(), ...(desk || {}) });
  return next;
}

/** Apply a partial update to one session's desk, leaving the others untouched. */
export function updateDesk(desks, sessionId, patch) {
  if (!sessionId) return desks instanceof Map ? desks : new Map();
  return putDesk(desks, sessionId, { ...deskFor(desks, sessionId), ...(patch || {}) });
}

/**
 * Forget a session's desk — when the chat is deleted, not when it is left.
 *
 * Leaving a chat must never drop its desk: that is exactly the in-flight build
 * whose files are still arriving, and discarding it would lose work the user
 * can still see running in the sidebar.
 */
export function forgetDesk(desks, sessionId) {
  const next = new Map(desks instanceof Map ? desks : []);
  if (sessionId) next.delete(sessionId);
  return next;
}

/**
 * Which desk a write belongs to, and whether it may proceed.
 *
 * `owner` is the session that started the turn. It is required: a write with no
 * owner has no baseline to be judged against, and guessing "the active one"
 * reintroduces exactly the bug this module removes.
 */
export function resolveWriteTarget({ desks, owningSessionId, activeSessionId } = {}) {
  if (!owningSessionId) {
    return {
      ok: false,
      reason: 'A desk write must name the session it belongs to. Without one it would be judged against whichever chat is on screen.',
    };
  }
  return {
    ok: true,
    sessionId: owningSessionId,
    desk: deskFor(desks, owningSessionId),
    // The component only re-renders the desk panes when the write is for the
    // chat being looked at. A background build updates the store and the
    // sidebar dot, and nothing else moves under the reader's hands.
    isVisible: owningSessionId === activeSessionId,
  };
}
