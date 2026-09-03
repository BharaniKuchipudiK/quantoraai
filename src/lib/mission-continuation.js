/*
 * THE MISSION OUTLIVES THE TURN.
 *
 * A turn is a wall clock. A mission is what the person asked for. The platform
 * conflated them, and the durable runtime paid for it.
 *
 * Every one of useChatStream's four terminal failure sites reported
 * `recoveryExhausted: true`, meaning "this TURN's automatic retry budget is
 * spent". api/_lib/qir-contracts.ts reads that field as the MISSION verdict:
 *
 *     if (error.recoveryExhausted === true) return "FAILED_TERMINAL";
 *
 * Measured against the real transition guard (scripts of record in the PR):
 *
 *     turn 1 ends -> Run status becomes: FAILED_TERMINAL
 *     turn 2 asks the journal where to continue: null
 *     turn 2 may open a new attempt (needs QUEUED|REPLANNING): false
 *     which engine failed, per the durable record: [ null ]
 *
 * So the first spent turn SEALED the Run. `deriveQirContinuation` returns null
 * for FAILED_TERMINAL, and `coding.attempt` answers 409 for it, which means the
 * durable journal stopped accepting anything for the rest of the browser
 * session. That is why QIR looked write-only: it wrote once, then bricked
 * itself while the person was still asking for the same thing.
 *
 * REPLANNING is the state that was wanted: `coding.attempt` accepts
 * ['QUEUED', 'REPLANNING'], so the next turn continues the same mission instead
 * of starting a stranger.
 *
 * WHEN IS A MISSION ACTUALLY OVER? Not on a timer, and not on a count — both
 * were tried at turn level and both were wrong (see turn-escalation.js). The
 * honest condition is the one the product promises: try an engine, and if it
 * cannot, try the next one; when there is no engine left that has not already
 * failed on this mission, there is nothing materially different left to run
 * automatically, and saying so is the truth rather than a shrug.
 *
 * Nothing here EXCLUDES an engine. Ordering only. A quota failure at 14:00 is
 * routinely fine at 14:05, and permanently burning an engine on one ambiguous
 * failure is how a platform talks itself out of a route it still has
 * (CLAUDE.md §5). Reordering can never shrink the reachable set, so it can
 * never be the reason a request goes unanswered.
 */

/** Failure evidence records the engine as `model:<id>` (qir-coding-run-core.js). */
const ENGINE_REF_PREFIX = 'model:';

/**
 * Engine ids that have already failed on this mission, read from the durable
 * Run. The Run snapshot the browser holds is the server's own, so this is a
 * read of persisted evidence and not of local state.
 *
 * @param {{observations?: Array<object>}|null|undefined} run
 * @returns {Map<string, {failures: number, lastAt: string}>}
 */
export function missionEngineFailures(run) {
  const byEngine = new Map();
  for (const observation of run?.observations || []) {
    if (observation?.status !== 'failure') continue;
    for (const evidence of observation.evidence || []) {
      const ref = String(evidence?.ref || '');
      if (!ref.startsWith(ENGINE_REF_PREFIX)) continue;
      const engineId = ref.slice(ENGINE_REF_PREFIX.length).trim();
      if (!engineId) continue;
      const seen = byEngine.get(engineId);
      const at = String(evidence.observedAt || observation.observedAt || '');
      byEngine.set(engineId, {
        failures: (seen?.failures || 0) + 1,
        lastAt: at > (seen?.lastAt || '') ? at : (seen?.lastAt || ''),
      });
    }
  }
  return byEngine;
}

function availableEngines(availableModels) {
  return (Array.isArray(availableModels) ? availableModels : [])
    .filter((model) => model && model.available !== false && model.id);
}

/**
 * Order the catalogue so an engine this mission has not tried comes first.
 *
 * Never filters: the returned array holds exactly the same engines as the
 * input, so a caller can always reach every route it could reach before.
 *
 * @param {Array<object>} availableModels catalogue rows
 * @param {{observations?: Array<object>}|null|undefined} run durable Run snapshot
 * @param {Set<string>|null|undefined} spentEngineIds engines this turn already ran
 */
export function orderEnginesForMission(availableModels, run, spentEngineIds = null) {
  const failures = missionEngineFailures(run);
  const engines = availableEngines(availableModels);
  const weight = (model) => {
    const record = failures.get(model.id);
    const spentThisTurn = spentEngineIds?.has?.(model.id) ? 1 : 0;
    return (record?.failures || 0) + spentThisTurn;
  };
  // A stable sort by failure weight: untried engines keep catalogue order among
  // themselves, and so do burned ones. Node's sort is stable, so equal weights
  // preserve the catalogue's own preference.
  return [...engines].sort((a, b) => weight(a) - weight(b));
}

/**
 * Does this mission have anything materially different left to try?
 *
 * @param {object} input
 * @param {object|null} input.run durable Run snapshot, or null when QIR is dark
 * @param {Array<object>} input.availableModels live engine catalogue
 * @param {Set<string>|null} input.spentEngineIds engines this turn already ran
 * @returns {{
 *   durableAttempts: number, triedEngineIds: string[], untriedEngines: object[],
 *   nextEngine: object|null, missionExhausted: boolean, reason: string,
 * }}
 */
export function planMissionContinuation({
  run = null,
  availableModels = [],
  spentEngineIds = null,
} = {}) {
  const failures = missionEngineFailures(run);
  const tried = new Set([...failures.keys()]);
  for (const id of spentEngineIds || []) if (id) tried.add(id);

  const engines = availableEngines(availableModels);
  const untriedEngines = engines.filter((model) => !tried.has(model.id));
  const nextEngine = untriedEngines[0] || null;

  /*
   * Exhaustion needs POSITIVE evidence, per CLAUDE.md §5. "No engine is
   * untried" is only meaningful once something was actually tried: an empty
   * catalogue that has not loaded yet must not read as a dead mission, or a
   * transient page state would tell the person to give up.
   */
  const missionExhausted = tried.size > 0 && untriedEngines.length === 0;

  return {
    durableAttempts: Number(run?.cursor?.attempt) || 0,
    triedEngineIds: [...tried],
    untriedEngines,
    nextEngine,
    missionExhausted,
    reason: missionExhausted
      ? 'all-engines-tried'
      : tried.size === 0 ? 'no-attempt-recorded' : 'engine-untried',
  };
}

/**
 * The engine to run INSTEAD, when the one routing chose has already failed on
 * this mission.
 *
 * The decision lives here rather than at the call site for the reason
 * qir-turn-journal.js exists: a rule written inline in a 2000-line hook can
 * only be checked by matching its source text, and a rule that can only be
 * matched is not a rule (CLAUDE.md §4).
 *
 * `rankedFallbackIds` is the caller's own failover order — for a Coding turn,
 * rankCodingDeskFallbacks, which ranks by measured finish-reliability rather
 * than by catalogue position. This function does not invent a preference; it
 * takes the first entry the mission has not already burned.
 *
 * Returns null — meaning "keep what routing chose" — whenever there is nothing
 * better to say: the engine is not burned, or every ranked candidate is. A
 * reroute must never be the reason a turn has nowhere to run.
 *
 * @param {object} input
 * @param {string} input.engineId the engine routing selected for this turn
 * @param {string[]} input.rankedFallbackIds failover candidates, best first
 * @param {string[]} input.reachableEngineIds ids actually present and available
 * @param {object|null} input.run durable Run snapshot
 * @returns {string|null}
 */
export function rerouteBurnedEngine({
  engineId = '',
  rankedFallbackIds = [],
  reachableEngineIds = [],
  run = null,
} = {}) {
  const burned = missionEngineFailures(run);
  if (!engineId || !burned.has(engineId)) return null;
  const reachable = new Set(reachableEngineIds);
  return (Array.isArray(rankedFallbackIds) ? rankedFallbackIds : []).find((id) => (
    id && id !== engineId && !burned.has(id) && reachable.has(id)
  )) || null;
}
