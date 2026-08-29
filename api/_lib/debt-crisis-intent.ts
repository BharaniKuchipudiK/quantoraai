/**
 * Detects a debt-crisis / consolidation request in a Finance turn — the "bridge
 * the gap between my salary and my debt", "consolidate my debts", "I can't cover
 * my payments" family. Distinct from the point payoff engine ("pay off $5,000 at
 * 19.99%"): this is the whole-situation ask, so it reads the stored picture
 * rather than one line of numbers. Also pulls a concrete consolidation offer
 * (rate + term) out of the message when the user names one.
 */

import type { ConsolidationOffer } from "./debt-consolidation.js";

const CRISIS_PATTERNS: RegExp[] = [
  /\bconsolidat(?:e|ion|ing)\b/i,
  /\brestructur(?:e|ing)\s+(?:my\s+)?(?:debt|loans?)\b/i,
  /\bdebt\s+(?:crisis|trap|spiral|problem|situation|management)\b/i,
  /\bbridge\s+the\s+gap\b/i,
  /\b(?:salary|income|pay(?:check)?)\s+(?:and|vs\.?|versus|against)\s+(?:my\s+)?debt\b/i,
  /\bmanage\s+(?:my\s+)?(?:debt|debts|loans?)\b/i,
  /\b(?:can'?t|cannot|struggling to)\s+(?:cover|afford|keep up with|pay)\s+(?:my\s+)?(?:debt|payments|minimums?|loans?)\b/i,
  /\b(?:offset|clear|get out of)\s+(?:my\s+)?debt\b/i,
];

export type DebtCrisisIntent = { matched: boolean; offer: ConsolidationOffer | null };

/** Parse "at 12% over 60 months" / "9.5% for 5 years" into an offer, or null. */
export function parseConsolidationOffer(message: string): ConsolidationOffer | null {
  const rate = message.match(/\b(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) || message.match(/\b([0-9]+(?:\.[0-9]+)?)\s*%/);
  const term = message.match(/\b(?:over|for|across)\s+([0-9]{1,3})\s*(month|months|mo|year|years|yr|yrs)\b/i);
  if (!rate || !term) return null;
  const ratePct = Number(rate[1]);
  const n = Number(term[1]);
  const unit = term[2].toLowerCase();
  const termMonths = unit.startsWith("y") ? n * 12 : n;
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 200) return null;
  if (!Number.isFinite(termMonths) || termMonths <= 0 || termMonths > 600) return null;
  return { apr: ratePct, months: termMonths };
}

export function parseDebtCrisisIntent(message: unknown): DebtCrisisIntent {
  if (typeof message !== "string" || !message.trim()) return { matched: false, offer: null };
  const matched = CRISIS_PATTERNS.some((p) => p.test(message));
  return { matched, offer: matched ? parseConsolidationOffer(message) : null };
}
