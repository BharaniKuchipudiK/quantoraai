/**
 * Intent detection for the Finance advisor layer:
 *  - parseAdviceIntent: an open request for a grounded plan / guidance. Broad on
 *    purpose, but it runs AFTER the specific engines (fx, debt, savings), so a
 *    concrete "pay off X" or "save Y" is still handled by those, not here.
 *  - isProfileShowQuery: a read-back of the stored financial profile.
 *  - parseWhatIf: a hypothetical adjustment to the plan — the lever a real
 *    planner reruns the numbers on ("what if I add SGD 500/month", "what if I
 *    retire in 25 years", "what if I go aggressive"). Returns null unless a
 *    hypothetical marker AND at least one recognized lever are both present, so
 *    ordinary advice questions are left to parseAdviceIntent.
 */

import type { RiskTolerance } from "./financial-profile.js";

const ADVICE_PATTERNS: RegExp[] = [
  /\b(?:build|make|create|draw\s+up|put\s+together|give\s+me)\s+(?:me\s+)?(?:a\s+)?(?:financial|investment|retirement|savings|wealth)?\s*plan\b/i,
  /\b(?:help|guide)\s+me\s+(?:to\s+)?(?:plan|invest|build\s+(?:a\s+)?(?:plan|portfolio))\b/i,
  /\b(?:advise|advice)\b[^.]*\b(?:invest|portfolio|money|saving|retire|financ|wealth|fund)/i,
  /\bhow\s+should\s+i\s+(?:invest|allocate|save\s+for)\b/i,
  /\bwhat\s+should\s+i\s+do\s+with\s+my\s+(?:money|savings|cash|portfolio)\b/i,
  /\b(?:investment|financial|retirement|wealth)\s+plan\b/i,
  /\bplan\s+my\s+(?:retirement|finances|future|wealth)\b/i,
  /\bbuild\s+(?:me\s+)?a\s+portfolio\b/i,
  // Goal-probability questions — the Monte Carlo headline.
  /\b(?:odds|chance|chances|probability|likelihood|how\s+likely)\b[^.]*\b(?:goal|reach|hit|retire|target|there)\b/i,
  /\bwill\s+i\s+(?:reach|hit|make|have\s+enough\s+for)\s+(?:my\s+)?(?:goal|target|retirement)\b/i,
  /\bam\s+i\s+on\s+track\b/i,
];

export type AdviceIntent = { matched: boolean };

export function parseAdviceIntent(message: unknown): AdviceIntent {
  if (typeof message !== "string" || !message.trim()) return { matched: false };
  return { matched: ADVICE_PATTERNS.some((pattern) => pattern.test(message)) };
}

const PROFILE_SHOW = [
  /\b(?:show|view|see|display|what(?:'s| is)?)\s+(?:me\s+)?(?:my\s+)?(?:financial\s+)?profile\b/i,
  /\bmy\s+(?:financial\s+)?profile\b/i,
];

export function isProfileShowQuery(message: unknown): boolean {
  if (typeof message !== "string" || !message.trim()) return false;
  return PROFILE_SHOW.some((pattern) => pattern.test(message));
}

/**
 * A hypothetical adjustment to the stored plan. Every field is optional; the
 * gateway applies only the ones set, over the profile the user actually saved.
 */
export type WhatIf = {
  addMonthly?: number; // "add SGD 500/month" — on top of the current contribution
  monthlyOverride?: number; // "save SGD 3,000/month" — replaces the contribution
  horizonYears?: number; // "retire in 25 years"
  risk?: RiskTolerance; // "go aggressive"
  goalOverride?: number; // "aim for SGD 2M"
};

// A hypothetical framing — without one, a bare "save 3,000 a month" is a profile
// command or a plain statement, not a scenario to model against the saved plan.
const HYPOTHETICAL =
  /\b(?:what\s+if|what\s+about|suppose|imagine|say\s+i\b|if\s+i\s+(?:add|save|contribut|invest|put|bump|increase|raise|retire|switch|go|change|aim|were|had|only|up)|instead\s+i|were\s+i\s+to)\b/i;

// A currency/number token — currency symbol or code is optional because a
// what-if adopts the profile's currency; only the magnitude matters here.
const AMT = String.raw`([$€£]?\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m|mil|million|thousand)?)`;
const PER_MONTH = String.raw`(?:\/\s*mo(?:nth)?|(?:a|per|each)\s+month|monthly)`;

const RISK_WORDS: Record<string, RiskTolerance> = {
  conservative: "conservative",
  cautious: "conservative",
  moderate: "moderate",
  balanced: "moderate",
  aggressive: "aggressive",
  growth: "aggressive",
};

/** Magnitude of a captured money token (k/m/thousand/million aware), or null. */
function parseAmountToken(token: string | undefined): number | null {
  if (!token) return null;
  const m = token.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million|thousand)?/i);
  if (!m) return null;
  const numeric = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const suffix = (m[2] || "").toLowerCase();
  const mult = suffix.startsWith("m") ? 1_000_000 : suffix.startsWith("k") || suffix === "thousand" ? 1_000 : 1;
  return Number((numeric * mult).toFixed(2));
}

function years(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : null;
}

/**
 * Parse a hypothetical plan adjustment, or null. Deterministic and additive:
 * several levers can appear in one message ("what if I add 500/month and retire
 * in 25 years"), and each is read independently. Never infers a lever that
 * isn't explicitly stated.
 */
export function parseWhatIf(message: unknown): WhatIf | null {
  if (typeof message !== "string" || !message.trim()) return null;
  const text = message;
  if (!HYPOTHETICAL.test(text)) return null;

  const whatIf: WhatIf = {};

  // Monthly contribution — additive ("add/extra/another") vs. a replacement.
  // The add-vs-replace signal is read only from the words immediately BEFORE the
  // amount, so an unrelated lever elsewhere ("…and increase my horizon") can't
  // flip "contribute 3,000/month" (a replacement) into an addition.
  const monthly = text.match(new RegExp(`${AMT}\\s*${PER_MONTH}\\b`, "i"));
  if (monthly && monthly.index != null) {
    const amt = parseAmountToken(monthly[1]);
    if (amt !== null) {
      const clause = text.slice(Math.max(0, monthly.index - 28), monthly.index);
      const additive = /\b(?:add|extra|another|additional|more|bump|raise|top\s+up|on\s+top)\b/i.test(clause);
      if (additive) whatIf.addMonthly = amt;
      else whatIf.monthlyOverride = amt;
    }
  }

  // Horizon — "retire in 25 years", "over 30 years", "horizon of 15 years".
  // NB: a bare "for N years" is deliberately NOT a horizon — it usually
  // qualifies how long a contribution runs ("add 500/month for 5 years"), which
  // this model can't represent, and reading it as the plan horizon would shorten
  // the whole projection and mislead badly.
  const horizon =
    text.match(/\bretire\s+(?:in|after)\s+(\d{1,3})\s*years?\b/i) ||
    text.match(/\bhorizon\s+(?:were|was|is|of|to)?\s*(\d{1,3})\s*years?\b/i) ||
    text.match(/\b(?:in|over|within|after)\s+(\d{1,3})\s*years?\b/i);
  if (horizon) {
    const y = years(horizon[1]);
    if (y !== null) whatIf.horizonYears = y;
  }

  // Risk appetite — "go aggressive", "switch to conservative", "balanced instead".
  const risk =
    text.match(/\b(?:go|going|switch(?:ed|ing)?\s+to|move\s+to|become|be|were|was|with|to|get)\s+(conservative|cautious|moderate|balanced|aggressive|growth)\b/i) ||
    text.match(/\b(conservative|cautious|moderate|balanced|aggressive|growth)\s+(?:instead|risk|approach|portfolio|mix|allocation)\b/i);
  if (risk) whatIf.risk = RISK_WORDS[risk[1].toLowerCase()];

  // Goal size — "aim for SGD 2M", "goal were 2,000,000". Bound the gap so a
  // distant monthly figure isn't mistaken for the goal.
  const goal = text.match(new RegExp(`\\b(?:goal|target|aim(?:ing)?\\s+for|aim\\s+at)\\b[^.\\d]{0,30}?${AMT}`, "i"));
  if (goal) {
    const amt = parseAmountToken(goal[1]);
    if (amt !== null) whatIf.goalOverride = amt;
  }

  return Object.keys(whatIf).length ? whatIf : null;
}

// A strong scenario opener means the turn is modeling a hypothetical against the
// saved plan — the advisor's job — even when the sentence contains "save" and a
// figure that the standalone savings calculator would otherwise grab as a goal.
// The upstream savings gateway checks this so a compound what-if ("what if I
// save 3,000/month and retire in 25 years") reaches the advisor intact.
const SCENARIO_OPENER = /\b(?:what\s+if|what\s+about|suppose|imagine)\b/i;

export function hasScenarioOpener(message: unknown): boolean {
  return typeof message === "string" && SCENARIO_OPENER.test(message);
}
