import type { StreamFinish } from './stream-finish.js';

/**
 * QIR Phase 6 — THE LEDGER RECORDS WHAT WAS MEASURED, NOT WHAT THE STREAM IMPLIED.
 *
 * `model_quality_events` is the evidence the outcome router runs on: its
 * success/failure counts become a ±30 swing on a route's score
 * (shared/model-outcome-routing.js) and the finish-reliability that orders
 * the coding desk's failovers. Until this file existed, every stream that did
 * not THROW was written as `outcome: "success"` — including a reply the
 * provider cut at its output budget (`length` / `MAX_TOKENS`), one it blocked,
 * and, per model-execution-policy.ts's own note, a route that died after the
 * first tokens. The Gemini probe named the consequence before the live path
 * ever read a finish reason: "that is how the ledger got poisoned" — a model
 * that had just failed was taught to the router as reliable. #547 carried the
 * provider's word through the live turn and deferred this half to Phase 6.
 *
 * The mapping is deliberately three-valued:
 *
 *   complete            -> success   the model chose to end
 *   truncated, blocked  -> failure   the requested work was not delivered
 *   unknown             -> null      UNMEASURED: no terminal word arrived
 *
 * `null` means "do not write a row". An absent finish is the probe's
 * "connection closed before the model finished" — it is also what an
 * unfamiliar provider word classifies to — and recording it as success keeps
 * the poison, while recording it as failure invents the opposite one: a route
 * whose stream shape simply omits the word would sink by 30 points on no
 * evidence. A sample we cannot read is a sample we do not count (§5: a signal
 * that fires on ambiguous evidence is the one that gets muted).
 */
export type LedgerOutcome = 'success' | 'failure';

export function ledgerOutcomeFor(finish: StreamFinish | null | undefined): LedgerOutcome | null {
  switch (finish?.kind) {
    case 'complete':
      return 'success';
    case 'truncated':
    case 'blocked':
      return 'failure';
    default:
      return null;
  }
}
