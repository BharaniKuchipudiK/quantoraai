/*
 * WHICH ENGINE ACTUALLY RAN.
 *
 * The Coding Desk ships with `Auto` selected (`badge: 'Default'` in
 * shared/coding-desk-auto-model.js), and Auto is a ROUTING decision, not an
 * engine. In auto mode useChatStream sets
 *
 *     targetModel = { id: 'auto', name: 'Auto', resolvedModelId, resolvedModelName }
 *
 * so `targetModel.id` is the literal string `'auto'` while the request runs on
 * `resolvedModelId`. Three places read `targetModel.id` and every one of them
 * was therefore reading the routing label instead of the engine:
 *
 *   1. the fallback filter (`model.id !== targetModel?.id`) — no real model has
 *      id `'auto'`, so it excluded NOTHING;
 *   2. `triedEngineIds`, which accumulated `'auto'` and never the engine;
 *   3. the durable QIR journal, which recorded `strategy: 'auto'` for every
 *      attempt — so the Run could not say which engine had failed.
 *
 * Measured on the real resolver and the real catalogue
 * (api/_lib/model-catalog.js: gemini-flash-latest, then nemotron-3-super):
 *
 *     attempt 1 ran on          : gemini-flash-latest
 *     triedEngineIds now holds  : [ 'auto' ]
 *     switchModel picks         : gemini-flash-latest   <-- the same engine
 *     journal recorded strategy : auto
 *
 * That is the class src/lib/turn-heal-contract.test.js exists to close — "a
 * retry identical to the attempt that failed" — alive on the default path,
 * because the ladder was comparing a label to an id.
 */

/**
 * The id of the engine an attempt actually executes on.
 *
 * Auto resolves to a real engine before the request is sent, so the resolved id
 * is the identity that matters for "did we already try this?" and for the
 * durable record. Falls back to the raw id for a pinned engine, where the two
 * are the same thing.
 *
 * @param {{id?: string, resolvedModelId?: string}|null|undefined} model
 * @returns {string} the engine id, or '' when nothing identifies it
 */
export function attemptEngineId(model) {
  const resolved = String(model?.resolvedModelId || '').trim();
  if (resolved) return resolved;
  return String(model?.id || '').trim();
}

/**
 * The engine's display name, for copy that tells the person what ran.
 *
 * Reporting `Auto` here is not wrong the way reporting `auto` as an ID is — but
 * it is useless: "3 attempts (Auto, then Auto, then Auto)" names nothing the
 * person can act on. The resolved name is what they can quote back.
 *
 * @param {{name?: string, resolvedModelName?: string}|null|undefined} model
 * @returns {string}
 */
export function attemptEngineName(model) {
  const resolved = String(model?.resolvedModelName || '').trim();
  if (resolved) return resolved;
  return String(model?.name || '').trim();
}

/**
 * Would running `candidate` repeat an engine this turn already spent?
 *
 * Compares engine identities on both sides, which is the whole point: the
 * candidate is always a raw catalogue row (a real id), while the thing it is
 * being compared against may be a routing label.
 *
 * @param {{id?: string}|null|undefined} candidate a catalogue row
 * @param {{id?: string, resolvedModelId?: string}|null|undefined} current the engine now running
 * @param {Set<string>|null|undefined} spentEngineIds engine ids already attempted
 */
export function repeatsSpentEngine(candidate, current, spentEngineIds) {
  const id = attemptEngineId(candidate);
  if (!id) return true;
  if (id === attemptEngineId(current)) return true;
  return Boolean(spentEngineIds?.has?.(id));
}

/**
 * Engines the SERVER reports it burned that this turn has not recorded yet.
 *
 * api/_lib/chat-handler.ts plans an inference ladder and works down its own
 * rungs behind a single request, so one browser attempt is up to four real
 * model attempts. Until now which rungs burned was stated only inside a
 * human-readable failover label — and prose is invisible to routing, the exact
 * lesson coding-outcome-spine.js records for its retry chip. The desk therefore
 * counted one attempt, said so, and told the durable mission the other rungs
 * were still untried.
 *
 * @param {string[]|undefined} spentEngineIds ids reported by the server
 * @param {Set<string>|null|undefined} recordedEngineIds what this turn already has
 * @returns {string[]} new ids, in the order the server gave them
 */
export function unrecordedServerEngines(spentEngineIds, recordedEngineIds) {
  const seen = new Set();
  return (Array.isArray(spentEngineIds) ? spentEngineIds : [])
    .map((engineId) => String(engineId || '').trim())
    .filter((engineId) => {
      if (!engineId || seen.has(engineId) || recordedEngineIds?.has?.(engineId)) return false;
      seen.add(engineId);
      return true;
    });
}

/**
 * The name to show for an engine id. Falls back to the id, which is still
 * something the person can quote, rather than to a placeholder that is not.
 *
 * @param {string} engineId
 * @param {Array<{id?: string, name?: string}>|null|undefined} availableModels
 */
export function engineDisplayName(engineId, availableModels) {
  const id = String(engineId || '').trim();
  if (!id) return '';
  const match = (Array.isArray(availableModels) ? availableModels : []).find((model) => model?.id === id);
  return String(match?.name || '').trim() || id;
}
