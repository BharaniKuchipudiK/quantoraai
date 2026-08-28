/**
 * Say what is actually happening, instead of a spinner and a clock.
 *
 * WHY THIS EXISTS
 *
 * "Building your preview… Hang tight — it appears in Preview when it can run.
 * 2:09" is the same sentence at 5 seconds and at 3 minutes. It carries no
 * information, so the only thing a person can do is wait and hope. Then the
 * turn dies and the failure is a surprise.
 *
 * Claude Code, Cursor and Codex all do the same simple thing: they narrate what
 * they are doing. Not because narration is charming, but because a person who
 * can see "no output yet after 40 seconds" knows to stop and rephrase, while a
 * person watching a clock learns nothing until it is too late.
 *
 * THE RULE
 *
 * Every line here is backed by something OBSERVED — bytes received, files
 * parsed, the compiler running, the budget remaining. Nothing is inferred from
 * how long it has been. A progress line that guesses is the same defect as a
 * check that reports ok without evidence, and this codebase has spent a week
 * removing those.
 *
 * When nothing has been observed yet, it says exactly that.
 */

const KB = 1024;

function humanBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < KB) return `${value} B`;
  if (value < KB * KB) return `${(value / KB).toFixed(1)} KB`;
  return `${(value / KB / KB).toFixed(1)} MB`;
}

function clock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Silence long enough to be worth telling someone about. */
export const SILENT_WARN_SEC = 20;
/** Silence long enough that rephrasing beats waiting. */
export const SILENT_STALL_SEC = 45;

/**
 * One line describing the turn, from evidence.
 *
 * Returns { line, phase, stalled }. `stalled` marks the point where a person
 * should be offered a way out rather than a longer wait.
 */
export function describeTurnPhase({
  elapsedSec = 0,
  bytes = 0,
  filePaths = [],
  previewCompiling = false,
  previewHealing = false,
  modelName = '',
  budgetSec = 0,
} = {}) {
  const elapsed = Math.max(0, Math.floor(Number(elapsedSec) || 0));
  const received = Math.max(0, Number(bytes) || 0);
  const files = (Array.isArray(filePaths) ? filePaths : []).filter(Boolean);
  const who = String(modelName || '').trim() || 'the model';
  const remaining = budgetSec > 0 ? Math.max(0, Math.floor(budgetSec - elapsed)) : 0;

  // Later phases first: what the platform is doing NOW outranks what it did.
  if (previewHealing) {
    return { line: `Preview hit an error — repairing it (${clock(elapsed)})`, phase: 'healing', stalled: false };
  }
  if (previewCompiling) {
    return { line: `Compiling the preview — ${files.length} file${files.length === 1 ? '' : 's'} (${clock(elapsed)})`, phase: 'compiling', stalled: false };
  }
  if (files.length) {
    const shown = files.slice(0, 3).join(', ');
    const more = files.length > 3 ? ` +${files.length - 3} more` : '';
    return { line: `Writing ${shown}${more} — ${humanBytes(received)} so far (${clock(elapsed)})`, phase: 'writing', stalled: false };
  }
  if (received > 0) {
    return { line: `${who} is writing — ${humanBytes(received)} so far (${clock(elapsed)})`, phase: 'streaming', stalled: false };
  }

  /*
   * Nothing received. This is the case the old copy hid completely, and it is
   * the one worth surfacing: it is the shape of a turn that is going to fail.
   */
  if (elapsed >= SILENT_STALL_SEC) {
    const budgetNote = remaining > 0 ? ` About ${remaining}s left in this turn.` : '';
    return {
      line: `No output from ${who} after ${clock(elapsed)}.${budgetNote}`,
      phase: 'silent',
      stalled: true,
    };
  }
  if (elapsed >= SILENT_WARN_SEC) {
    return { line: `Waiting on ${who} — nothing received yet (${clock(elapsed)})`, phase: 'silent', stalled: false };
  }
  return { line: `Reaching ${who}… (${clock(elapsed)})`, phase: 'connecting', stalled: false };
}

/**
 * What to offer when a turn has gone quiet.
 *
 * Concrete actions, not sympathy. Each one is something the person can do that
 * changes the outcome — which is the whole difference between a status line and
 * a spinner.
 */
export function stalledTurnActions({ hasPreview = false, isBuild = false } = {}) {
  const actions = ['Stop and try a shorter ask'];
  if (isBuild) actions.push('Ask for one file at a time');
  if (hasPreview) actions.push('Keep the current preview and refine it instead');
  actions.push('Switch model and retry');
  return actions;
}
