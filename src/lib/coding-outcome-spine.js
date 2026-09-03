/**
 * Coding Desk Outcome Spine — one partner voice for every failed coding turn.
 *
 * Contract: never dump a raw gateway string and walk away.
 * Always: what failed → what was already tried → the user's move (chips).
 *
 * HONESTY LAW (gated by turn-heal-contract.test.js): this copy renders in
 * exactly one state — after the automatic recovery loop has returned. So it
 * may state what the loop DID (attempts made, engines tried) and offer chips
 * the USER can tap, but it must never say "what we'll do: retry": on
 * 2026-09-01 that sentence shipped as the closing line of a turn whose retry
 * budget was already spent, promising an action the code had just proved it
 * would never take.
 */

import { buildJobIsComplete, completedCount, nextStep } from './build-job.js';

import { SHOP_INTAKE_CATALOG_SIZE, shopPhotoTurnFailureCopy } from './shop-catalog-scale.js';

/**
 * @typedef {{
 *   kind: 'timeout' | 'no-preview' | 'provider-dead' | 'stream-ended' | 'stopped',
 *   text: string,
 *   isError: boolean,
 *   continueSet: { items: Array<{ id: string, label: string, value: string }> } | null,
 * }} CodingTurnOutcome
 */

/** "Nemotron, then Gemini Flash" — the engines the loop actually ran. */
function describeTriedEngines(triedEngines) {
  const names = (Array.isArray(triedEngines) ? triedEngines : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  return names.length ? names.join(', then ') : '';
}

/**
 * The "what I tried" line for a turn whose automatic loop is finished. Facts
 * only: attempts and engines come from the caller's real loop state, so a
 * single-attempt failure never claims a history it did not have.
 */
function describeAttemptsSpent(attemptsMade, triedEngines) {
  if (!(Number(attemptsMade) >= 2)) return '';
  const engines = describeTriedEngines(triedEngines);
  return (
    `**What I tried:** ${Math.round(Number(attemptsMade))} attempts`
    + (engines ? ` (${engines})` : '')
    + ' — the automatic retry budget for this turn is spent.\n'
  );
}

/**
 * The durable Run this failure belongs to, when there is one.
 *
 * WHY THIS LINE EXISTS. Every failure copy here named what broke and what the
 * loop tried, and gave the person nothing to quote. QIR has minted a durable
 * `runId` since Phase 2 and the desk renders it — in a tooltip — so the one
 * moment it is worth having, the terminal failure, was the one place it never
 * appeared.
 *
 * It is also the first thing in the product that READS from QIR rather than
 * writing to it. The journal has been write-only: `qir-contracts.ts` decides
 * completion and nothing consults it, this module had no idea a Run existed.
 * Surfacing the id is small, but it points the right way.
 *
 * The id is printed only when the caller has one, which makes its presence
 * meaningful rather than decorative: a Run id exists precisely when the durable
 * journal accepted this attempt, so the line cannot promise a record that was
 * never written. No id, no line — never a placeholder.
 */
function describeRunReference(runId) {
  const id = String(runId || '').trim();
  if (!id) return '';
  return `**Run:** \`${id}\` — the durable record of this attempt, with the failure evidence attached.\n`;
}

/**
 * Where the MISSION stands, as distinct from where this turn stands.
 *
 * WHY BOTH LINES EXIST. Every terminal message here spoke only about the turn,
 * so a spent retry budget read to the person as the end of the road — and until
 * now it genuinely was one: useChatStream reported the turn's exhaustion as the
 * mission's, api/_lib/qir-contracts.ts turned that into FAILED_TERMINAL, and the
 * durable Run stopped accepting anything for the rest of the session.
 *
 * A Cursor error card the founder sent over says "try again in a few moments"
 * and hands the retry back with no plan. That is the shape to avoid. If the
 * mission survives, say what SURVIVED and what will be different; if it does
 * not, say that plainly instead of dressing another identical attempt up as
 * hope.
 *
 * `missionExhausted` is tri-state on purpose. Absent means the caller had no
 * mission evidence, and then neither claim may be made — the same law as the
 * Run reference above: no evidence, no line, never a placeholder.
 */
function describeMissionState(missionExhausted, triedEngines) {
  if (missionExhausted === true) {
    /*
     * No engine list here. "What I tried" prints it one line above, and saying
     * it twice is the defect the founder caught in a screenshot on 2026-09-02.
     */
    return (
      '**The mission:** every engine available to me has now failed on this goal. '
      + 'Another identical attempt is not a plan, so I am not going to sell you one.\n'
    );
  }
  if (missionExhausted === false) {
    return (
      '**The mission is kept:** the durable Run stays open, so the next attempt continues this '
      + 'same goal instead of starting over — and it will not be routed back to an engine that '
      + 'already failed on it.\n'
    );
  }
  return '';
}

/**
 * The one repair that is materially different when no engine is left: a smaller
 * job. Defined once because two branches offer it, and a copy that drifts
 * between them is how the pair stops meaning the same thing (CLAUDE.md §6).
 */
function smallerBuildChip() {
  return {
    id: 'outcome-retry-smaller',
    label: 'Retry a smaller build',
    value: (
      'Retry with a smaller scope: one working HTML page that runs in Preview now. '
      + 'Do not expand scope. Ship files, not a chat-only plan.'
    ),
    priority: 110,
  };
}

function shopChips(shopIntakeAsk) {
  if (!shopIntakeAsk?.oversize || !Array.isArray(shopIntakeAsk.chips)) return null;
  return {
    items: shopIntakeAsk.chips.map((chip) => ({
      id: chip.id,
      label: chip.label,
      value: chip.value,
    })),
  };
}

/**
 * Resolve the final user-facing outcome when a coding turn cannot deliver Preview.
 */
export function resolveCodingTurnOutcome({
  kind,
  turnDeadlineSec = 90,
  errorMessage = '',
  shopIntakeAsk = null,
  isShopPhotoTurn = false,
  /** The build job, when one is running. Decides whether a timeout loses work. */
  job = null,
  /** How many attempts the recovery loop actually ran before escalating here. */
  attemptsMade = 1,
  /** Engine names those attempts ran on, in order. */
  triedEngines = [],
  /** The durable QIR Run id for this attempt, when the journal accepted one. */
  runId = '',
  /** Whether the MISSION (not this turn) has run out of untried engines.
   *  null when the caller has no mission evidence — then no claim is made. */
  missionExhausted = null,
  /** The next untried engine ({ id, name }) the retry chip should pin, or
   *  null when the catalog is exhausted. The chip only names an engine it
   *  will actually use — same law as the recovery notice. */
  fallbackEngine = null,
} = {}) {
  if (kind === 'stopped') {
    return {
      kind,
      text: 'Stopped. Nothing further will run on this turn — say when to continue.',
      isError: true,
      continueSet: null,
    };
  }

  if (kind === 'timeout') {
    /*
     * A timeout mid-job ends the TURN, not the JOB.
     *
     * The advice below this branch — "retry a smaller build" — is right when a
     * turn produced nothing. It is destructive when a job is running and steps
     * are already proved on the desk: it throws that work away and asks the
     * model to start over with less. A big build is exactly the case that runs
     * long, so the deadline was hardest on the builds most worth keeping.
     *
     * A step only goes green when the files it named actually exist, so
     * progress here is measured, not claimed. The continue value is the bare
     * word the resume path already recognises, which restates the goal and
     * names the files the next step owes.
     */
    const done = completedCount(job);
    if (job && !buildJobIsComplete(job) && done > 0) {
      const steps = Array.isArray(job.steps) ? job.steps : [];
      const total = steps.length;
      const next = nextStep(job);
      // Position of the step Continue actually resumes at. `done + 1` is only
      // the same number while steps complete in order, and nothing enforces
      // that — so it disagreed with the Next line in the same message.
      const resumeAt = steps.findIndex((step) => !step.done) + 1;
      /*
       * An oversize catalogue still needs its own chips. Continuing re-runs the
       * same oversized build into the same deadline, so offering it alone would
       * hand the user a loop; the shop chips are what let them agree to a
       * smaller catalogue. Continue leads because progress is real.
       */
      const shopItems = (shopIntakeAsk?.oversize || isShopPhotoTurn)
        ? (shopChips(shopIntakeAsk)?.items || [])
        : [];
      return {
        kind: 'timeout-checkpoint',
        text: (
          `That turn hit the ${Math.round(turnDeadlineSec)}s limit, but the build is not lost.\n\n`
          + `**Done so far:** ${done} of ${total} step${total === 1 ? '' : 's'}, proved by the files on the desk.\n`
          + (next?.title ? `**Next:** ${next.title}\n` : '')
          + '\nContinue picks up at the next step — it does not start again.'
        ),
        // Not an error. Work was done and kept; calling it a failure would be
        // the same overstatement the desk refuses everywhere else.
        isError: false,
        continueSet: {
          items: [
            {
              id: 'outcome-continue-job',
              label: `Continue — step ${resumeAt} of ${total}`,
              value: 'Continue',
              priority: 120,
            },
            ...shopItems,
          ],
        },
      };
    }
    if (shopIntakeAsk?.oversize || isShopPhotoTurn) {
      return {
        kind,
        text: shopPhotoTurnFailureCopy({
          timedOut: true,
          seconds: turnDeadlineSec,
          assessment: shopIntakeAsk,
        }),
        isError: true,
        continueSet: shopChips(shopIntakeAsk),
      };
    }
    return {
      kind,
      text: (
        `That turn hit the ${Math.round(turnDeadlineSec)}s limit before Preview had a runnable page.\n\n`
        + `**What failed:** the model did not finish writing files in time.\n`
        + describeAttemptsSpent(attemptsMade, triedEngines)
        + describeMissionState(missionExhausted, triedEngines)
        + describeRunReference(runId)
        + `**Your move:** tap **Retry a smaller build** — one working page first, instead of sitting on a dead spinner.`
      ),
      isError: true,
      continueSet: { items: [smallerBuildChip()] },
    };
  }

  if (kind === 'no-preview') {
    return {
      kind,
      text: (
        `Preview cannot run — that turn produced a chat plan with no runnable files.\n\n`
        + `**What failed:** Coding Desk needs HTML/CSS/JS (or a React VFS) on the desk, not a description.\n`
        + (Number(attemptsMade) >= 2
          ? `**What I tried:** an automatic rebuild with stricter instructions — it also came back without runnable files.\n`
          : '')
        + `**Your move:** tap **Rebuild a runnable page** and I will build it as files, not prose.`
      ),
      isError: true,
      continueSet: {
        items: [{
          id: 'outcome-rebuild-page',
          label: 'Rebuild a runnable page',
          value: (
            'Rebuild now as a complete, self-contained HTML page that runs in Quantora Preview. '
            + 'Include real structure and working UI. Do not answer with a plan-only chat message.'
          ),
          priority: 110,
        }],
      },
    };
  }

  if (kind === 'provider-dead' || kind === 'stream-ended') {
    const detail = String(errorMessage || '').trim();
    const overloaded = /overload|429|503|high demand|capacity/i.test(detail);
    /*
     * "Retry on the next engine" in a state with no next engine is the exact
     * contradiction turn-heal-contract.test.js exists to reject — and with a
     * null fallbackEngine the chip degrades to a bare "Retry with fallback"
     * carrying no override, which is the prayer the note below warns about.
     * When the mission is out of engines, the only honest offer is a smaller
     * job.
     */
    const noEngineLeft = missionExhausted === true && !fallbackEngine?.id;
    return {
      kind,
      text: (
        (overloaded
          ? `The model route died under load before we got a usable Preview.\n\n`
          : `The connection to the model died before Preview was ready.\n\n`)
        + `**What failed:** ${detail || 'the AI gateway closed the stream without a runnable result.'}\n`
        + describeAttemptsSpent(attemptsMade, triedEngines)
        + describeMissionState(missionExhausted, triedEngines)
        + describeRunReference(runId)
        + (noEngineLeft
          ? `**Your move:** tap **Retry a smaller build** — a smaller job is the one thing left here `
            + `that is actually different (about ${SHOP_INTAKE_CATALOG_SIZE} catalog photos if this is a shop).`
          : `**Your move:** pick a chip below — retry on the next engine, or shrink the job `
            + `(about ${SHOP_INTAKE_CATALOG_SIZE} catalog photos if this is a shop).`)
      ),
      isError: true,
      continueSet: shopIntakeAsk?.oversize
        ? shopChips(shopIntakeAsk)
        : noEngineLeft
        ? { items: [smallerBuildChip()] }
        : {
          items: [{
            id: 'outcome-retry-fallback',
            /*
             * The manual retry carries the override, not a prayer: prose like
             * "the next available model" is invisible to routing, so a tapped
             * retry used to re-run the exact engine that just died (observed
             * 2026-09-01: two consecutive turns on the same engine, the second
             * burning the full deadline). The label names the engine only when
             * the id is really attached, so the promise stays checkable.
             */
            label: fallbackEngine?.id && fallbackEngine?.name
              ? `Retry on ${fallbackEngine.name}`
              : 'Retry with fallback',
            value: 'Retry this same job on the next available model. Keep scope small enough to finish in one turn.',
            ...(fallbackEngine?.id ? { modelOverrideId: fallbackEngine.id } : {}),
            priority: 108,
          }],
        },
    };
  }

  return {
    kind: kind || 'provider-dead',
    text: `That turn did not finish.\n\n**Your move:** retry it, or tell me a smaller outcome to ship first.`,
    isError: true,
    continueSet: null,
  };
}
