/**
 * Phase 06 — Plan or Build, chosen by the person, not guessed.
 *
 * WHAT WAS ALREADY HERE, AND WHY IT NEVER RAN
 *
 * The server has understood `studioMode: "plan"` since the request normalizer
 * was written: it marks the mode explicit, drops the temperature, and suppresses
 * guided intake. `useStudioSession` even exports `setStudioMode`.
 *
 * Nothing ever called it. `useChatStream` sent `refineDesk ? 'build' : 'ask'` —
 * a literal, not the session's mode — so the whole plan path was unreachable
 * from the product. This module is the contract that makes the choice real, and
 * it lives outside React because the two rules below are worth testing and a
 * component is not where you test them.
 *
 * THE RULE THAT MAKES THE TOGGLE HONEST
 *
 * A control labelled "Plan" that writes files is worse than no control. It
 * costs the user the same money as a build, produces a build they did not
 * approve, and teaches them the label is decorative.
 *
 * So planning is not a hint here. `mayWriteToDesk` is consulted on the reply
 * path, and a plan turn's fences are DISCARDED rather than applied — the model
 * is told not to emit code, and the platform does not depend on it obeying.
 * That is the difference between an instruction and a gate (CLAUDE.md §4): the
 * question "what does this do when the model ignores it?" has an answer.
 *
 * WHAT NOT CHOOSING MEANS
 *
 * `null` is the default and a real answer: the existing inference decides, as
 * it did before this file existed. The toggle offers a choice; it does not
 * demand one before the composer will work.
 */

export const STUDIO_MODES = Object.freeze(['plan', 'build']);

/**
 * The mode actually sent for a turn.
 *
 * `chosen` is what the person picked and outranks everything, because that is
 * the entire point of a toggle. With no choice, the previous behaviour stands
 * exactly as it was — a refine turn on a live desk is a build, anything else is
 * a question.
 */
export function resolveStudioMode({ chosen = null, refineDesk = false } = {}) {
  if (chosen === 'plan' || chosen === 'build') return chosen;
  return refineDesk ? 'build' : 'ask';
}

/**
 * May this turn change the files on the desk?
 *
 * Only ever false for a plan turn. Everything else — ask, build, refine, a
 * resumed job step — writes as it always did, so this cannot quietly become the
 * reason a normal build stops producing files.
 */
export function mayWriteToDesk(mode) {
  return mode !== 'plan';
}

/**
 * What to tell the user when a plan turn arrived carrying code anyway.
 *
 * Shown, never swallowed. A silent discard looks identical to a model that
 * wrote nothing, and the user would re-run the same turn wondering why their
 * files never appeared. Naming the count and the way out is the whole message.
 */
export function planTurnDiscardNotice(fileCount = 0) {
  if (!fileCount) return '';
  const noun = fileCount === 1 ? 'file' : 'files';
  return `Plan mode: kept the plan and discarded ${fileCount} ${noun} this reply tried to write. Nothing on the desk changed. Switch to Build to run it.`;
}

/** The toggle's two positions, and what each one promises in the user's words. */
export function studioModeOptions() {
  return [
    {
      id: 'plan',
      label: 'Plan',
      hint: 'Work out the steps and the files first. Nothing is written to the desk.',
    },
    {
      id: 'build',
      label: 'Build',
      hint: 'Write the code now.',
    },
  ];
}

/**
 * The guard itself: what a turn is allowed to leave behind.
 *
 * Takes the assembly `applyWorkspaceFromChat` already produced and, on a plan
 * turn, returns one that changes nothing — the desk as it stood, no changed
 * paths, no update. It is a separate function rather than a branch inside the
 * component so the reply path and its test exercise the same code.
 *
 * `discardedPaths` is the evidence. A guard that silently returned the old desk
 * would be indistinguishable from a model that wrote nothing, and the user
 * would re-run the turn to find out why their files never arrived.
 */
export function guardPlanTurn(assembled, currentVfs = {}, mode = null) {
  const empty = { ...assembled, discardedPaths: [] };
  if (mayWriteToDesk(mode)) return empty;

  const before = currentVfs || {};
  const after = assembled?.vfs || {};
  const discardedPaths = Object.keys(after).filter((path) => {
    const next = after[path];
    const prev = before[path];
    const nextText = typeof next === 'string' ? next : (next?.content ?? '');
    const prevText = typeof prev === 'string' ? prev : (prev?.content ?? '');
    return nextText !== prevText;
  });

  return {
    ...assembled,
    vfs: before,
    // `producedVfs` is what THIS turn built. It is emptied too, and not as
    // tidiness: the proof plane runs a repair over it, and a repair handed a
    // plan turn's stray fences would synthesize the very build the user asked
    // not to run.
    producedVfs: {},
    code: '',
    changedPaths: [],
    didUpdate: false,
    discardedPaths,
  };
}

/**
 * The studioMode field for the request body — and the reason it is often absent.
 *
 * THIS IS NOT A STYLE CHOICE. The server reads a PRESENT studioMode as an
 * explicit one (`studioModeExplicit`), and `resolveEffectiveBuildMode` then
 * does this:
 *
 *     if (explicitAsk && !toolBuild) return false;
 *
 * So sending the inferred mode — which is `'ask'` on every turn that is not a
 * refine — would force build mode OFF for every fresh build in the product.
 * "Build me a website for my coffee shop" would answer in chat forever.
 *
 * That is why the old code sent a literal and why simply replacing it with the
 * real mode is a production outage. An inferred mode is not a choice, and only
 * a choice may claim to be explicit. With no choice, the field is omitted and
 * the server infers exactly as it does today.
 */
export function studioModeRequestFields(chosen) {
  return chosen === 'plan' || chosen === 'build' ? { studioMode: chosen } : {};
}
