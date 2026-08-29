/**
 * Finance model routing — the inverse of Study's, on purpose.
 *
 * Study escalates: a hard question deserves a stronger reasoner. Finance does
 * not, and the reason is structural. Four deterministic gateways answer ahead
 * of the model at api/pipeline.ts, so by the time a model runs on a Finance
 * turn, the arithmetic that carries the value has already happened or has
 * already been declined. What is left is narration, asking for the one missing
 * number, and emitting a document specification.
 *
 * That is low-difficulty work where the cost of a fluent invention is high. So
 * this router optimises for stability and instruction-following rather than
 * reasoning depth, and it will NEVER move a Finance turn onto a paid route.
 * Escalating here would spend money to make a hallucination more articulate.
 *
 * Two safety properties, both borrowed from the routers that came before:
 *
 *   Reorder-only. It permutes the ladder the base decision already produced
 *   and can never introduce a model that was not in it. A router that could
 *   name a model would be the hardcoded-slug defect that emptied
 *   CURATED_MODELS, arriving by a different door.
 *
 *   Hard-gated to finance. Every entry point returns null or the untouched
 *   base decision for any other domain.
 */

export const FINANCE_MODEL_ROUTING_VERSION = 'finance-model-routing-2026-08-29.1';

export type FinanceTurnKind =
  | 'education'   // general finance explanation; no personal numbers in play
  | 'intake'      // one number away from a deterministic engine answering
  | 'document'    // an Office specification, which must be schema-perfect JSON
  | 'regulated';  // tax, securities selection, insurance — advice with a licence attached

export type FinanceInterpretation = {
  version: string;
  kind: FinanceTurnKind;
  /** The reply is machine-consumed, so format adherence outranks eloquence. */
  requiresStrictFormat: boolean;
  /** The turn is near regulated advice and the reply must name its own limits. */
  mustNameLimits: boolean;
  temperatureCeiling: number;
};

type HistoryItem = { role?: string; sender?: string; text?: string; content?: string };
type ModelLike = {
  id?: string;
  name?: string;
  specialty?: string;
  description?: string;
  pricingKind?: string;
  quality?: { sampleSize?: number; score?: number } | null;
};
type RoutingDecision = {
  primaryModelId: string;
  fallbackModelIds: string[];
  reason: string;
  provider: 'gemini' | 'openrouter';
  hasVisionSupport: boolean;
  selectionSource: string;
};

const DOCUMENT_RE = /\b(?:presentation|slides?|deck|powerpoint|pptx|word|docx|excel|xlsx|spreadsheet|report|memo)\b/i;
/*
 * Regulated territory. Not "the word tax appeared" — "should I buy this" and
 * "which fund" are the shapes where an articulate answer does real harm, and
 * where a licensed human is the correct next step rather than a better model.
 */
const REGULATED_RE = /\b(?:should i (?:buy|sell|invest in|switch to|put my money)|which (?:fund|stock|share|etf|policy|insurer|scheme)|tax (?:advice|planning|deduction|relief|evasion|avoidance)|is .{0,30} a good (?:investment|buy|stock)|guarantee(?:d)? returns?|insider)\b/i;
/*
 * The subject the number belongs to. Without this, "I have 3 meetings a month"
 * read as intake — the phrasing of supplying a figure is identical whatever the
 * figure is about, so the CONVERSATION has to say it is about money.
 */
const FINANCIAL_SUBJECT_RE = /\b(?:debts?|income|salary|save|savings|budget|minimums?|afford|payments?|pay ?off|loans?|interest|owe|owing|apr|mortgage|rent|card)\b/i;

/** One number away: the user is answering an engine, not asking a question. */
const INTAKE_RE = /\b(?:i (?:earn|make|take home|can put|can pay|can afford|have)|my (?:income|salary|budget|rent|minimum)|here is what i can|after rent|per month|a month|monthly)\b/i;

function textOf(item: HistoryItem): string {
  return String(item?.text || item?.content || '').trim();
}

function financeTurnKind(message: string, history: HistoryItem[]): FinanceTurnKind {
  if (REGULATED_RE.test(message)) return 'regulated';
  if (DOCUMENT_RE.test(message)) return 'document';
  /*
   * Intake needs the conversation, not just this message. "8,000 a month" alone
   * is meaningless; following a turn where the desk asked for it, it is the
   * whole answer — and treating it as education would route it as prose.
   */
  const recent = history.slice(-4).map(textOf).join('\n');
  if (INTAKE_RE.test(message) && /\d/.test(message) && FINANCIAL_SUBJECT_RE.test(`${recent}\n${message}`)) {
    return 'intake';
  }
  return 'education';
}

export function interpretFinanceTurn(input: {
  studioDomain?: string | null;
  message?: string;
  history?: HistoryItem[];
}): FinanceInterpretation | null {
  if (input?.studioDomain !== 'finance') return null;
  const message = String(input.message || '').trim();
  if (!message) return null;

  const history = Array.isArray(input.history) ? input.history : [];
  const kind = financeTurnKind(message, history);

  return {
    version: FINANCE_MODEL_ROUTING_VERSION,
    kind,
    requiresStrictFormat: kind === 'document',
    mustNameLimits: kind === 'regulated',
    // Money answers are not the place for range. A document specification least
    // of all: it is parsed, and a creative field name is a failed render.
    temperatureCeiling: kind === 'document' ? 0.1 : 0.3,
  };
}

export function formatFinanceDirective(interpretation: FinanceInterpretation | null): string {
  if (!interpretation) return '';
  if (interpretation.kind === 'regulated') {
    return `

FINANCE — REGULATED TERRITORY
This turn is close to advice that carries a licence. Quantora models and educates; it does not recommend.
- Do not name a specific security, fund, policy or provider to buy, sell or switch to.
- Do not state or imply a guaranteed return.
- Explain the mechanics, the trade-offs, and what the decision turns on.
- Say plainly which parts need a licensed adviser, accountant or credit counsellor, and why.
`;
  }
  if (interpretation.kind === 'intake') {
    return `

FINANCE — THE USER IS ANSWERING A QUESTION
They are supplying a number a calculation was waiting for. Acknowledge it in one line and use it. Do not restate what they already told you, and do not ask again for anything already in the conversation.
`;
  }
  return '';
}

/**
 * Prefers the stable and the cheap, and treats measured outcomes as the only
 * evidence of either.
 *
 * There is deliberately no table of model reputations here. Which model follows
 * instructions best is not knowable from its slug, it changes with every
 * release, and a guess baked into code outlives the release that justified it.
 * Recorded quality is the one signal that is actually about this deployment.
 */
function stabilityScore(model: ModelLike, interpretation: FinanceInterpretation): number {
  let score = 0;

  // Measured, not assumed. Weighted hardest because it is the only real evidence.
  const samples = Number(model.quality?.sampleSize) || 0;
  const quality = Number(model.quality?.score);
  if (samples >= 5 && Number.isFinite(quality)) score += Math.max(0, Math.min(40, quality / 2.5));

  const haystack = `${model.id || ''} ${model.name || ''} ${model.specialty || ''} ${model.description || ''}`.toLowerCase();
  // A coding specialist narrating someone's debt is the wrong tool, whatever
  // it scores on a leaderboard.
  if (/coder|code-|codestral/.test(haystack)) score -= 20;
  // A document specification is parsed, so a model already carrying structured
  // -output signal is preferred for that one kind only.
  if (interpretation.requiresStrictFormat && /json|structured|instruct/.test(haystack)) score += 8;

  return score;
}

function isPaid(model: ModelLike | undefined): boolean {
  return model?.pricingKind === 'paid';
}

export function applyFinanceStabilityRouting(input: {
  interpretation: FinanceInterpretation | null;
  baseDecision: RoutingDecision;
  models?: ModelLike[];
  explicitModelSelected?: boolean;
}): RoutingDecision {
  const { interpretation, baseDecision } = input;
  // A model the user picked themselves is never overridden, and a non-finance
  // turn never reaches the reordering below.
  if (!interpretation || input.explicitModelSelected) return baseDecision;

  const ladder = [baseDecision.primaryModelId, ...(baseDecision.fallbackModelIds || [])].filter(Boolean);
  if (ladder.length < 2) return baseDecision;

  const modelById = new Map((input.models || []).map((model) => [String(model.id || ''), model]));
  const ordered = ladder
    .map((id, index) => ({ id, index, score: stabilityScore(modelById.get(id) || { id }, interpretation) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.id);

  const primaryModelId = ordered[0] || baseDecision.primaryModelId;
  if (primaryModelId === baseDecision.primaryModelId) return baseDecision;

  /*
   * The cost guarantee, and the reason this router exists at all.
   *
   * Finance's value is in engines that cost nothing to run. Moving a Finance
   * turn from a free route onto a paid one buys a more fluent narration of
   * numbers that were already computed — it cannot make them more correct. If
   * the reorder would do that, the base decision stands.
   */
  if (!isPaid(modelById.get(baseDecision.primaryModelId)) && isPaid(modelById.get(primaryModelId))) {
    return baseDecision;
  }

  return {
    ...baseDecision,
    primaryModelId,
    fallbackModelIds: ordered.slice(1),
    provider: primaryModelId.startsWith('gemini') ? 'gemini' : 'openrouter',
    // Recomputed from the NEW primary, never inherited: a decision whose
    // provider describes one model and whose vision flag describes another is
    // one careless reader away from being wrong.
    hasVisionSupport: primaryModelId.startsWith('gemini'),
    reason: `finance_${interpretation.kind}`,
    selectionSource: 'finance_stability_route',
  };
}

/** Bounded diagnostics. Never the user's numbers, never the transcript. */
export function publicFinanceRoutingMetadata(interpretation: FinanceInterpretation | null) {
  if (!interpretation) return null;
  return {
    version: interpretation.version,
    kind: interpretation.kind,
    mustNameLimits: interpretation.mustNameLimits,
  };
}
