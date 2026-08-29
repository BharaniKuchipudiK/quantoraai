/**
 * Intent detection for the Finance advisor layer:
 *  - parseAdviceIntent: an open request for a grounded plan / guidance. Broad on
 *    purpose, but it runs AFTER the specific engines (fx, debt, savings), so a
 *    concrete "pay off X" or "save Y" is still handled by those, not here.
 *  - isProfileShowQuery: a read-back of the stored financial profile.
 */

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
