/*
 * WHICH SURFACES THIS BUILD SHOWS.
 *
 * 2026-09-06: the journey ledger read 59 user journeys, 28 of them never
 * driven by any gate, and the decision was to stop widening until the core
 * is proven. The Quantum Playground and the Dream-to-Action canvas are the
 * two surfaces furthest from the core and least exercised by anyone, so they
 * are parked: the code stays, the tabs and the landing cards do not render,
 * and one build flag brings them back for whoever wants them —
 * VITE_QUANTORA_EXPLORATORY_SURFACES=on. The ledger counts a parked journey
 * on its own line instead of among the unproven, because a person cannot
 * reach it to be failed by it.
 */

/**
 * @param {Record<string, string|undefined>} [env] the build's environment; Vite's import.meta.env by default, empty under Node.
 */
export function exploratorySurfacesEnabled(env = (typeof import.meta !== 'undefined' && import.meta.env) || {}) {
  return String(env?.VITE_QUANTORA_EXPLORATORY_SURFACES || '').trim().toLowerCase() === 'on';
}
