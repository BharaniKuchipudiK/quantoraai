/**
 * Outcome gap detection — compare what the user asked for vs what the AI delivered.
 * Powers proactive continue chips so users don't have to say "that's missing."
 */

function beat(id, label, value, priority = 0) {
  return { id, label, value, priority };
}

/** Detect gaps between user intent and assistant reply. Returns proactive fix chips. */
export function detectOutcomeGaps(userPrompt = '', aiResponse = '') {
  const user = String(userPrompt).toLowerCase();
  const ai = String(aiResponse);
  const gaps = [];

  const wantsUrls = /\b(url|urls|link|links|website|web site|click|visit|book(?:ing)?)\b/i.test(userPrompt);
  const hasUrls = /https?:\/\//i.test(ai);

  if (wantsUrls && !hasUrls) {
    gaps.push(beat(
      'gap-missing-urls',
      'Add direct links',
      'Please give me the direct, clickable website URLs for each option you mentioned — raw https links, one per property.',
      100,
    ));
  }

  const wantsPrices = /\b(price|prices|cost|budget|how much|rate|rates)\b/i.test(userPrompt);
  const hasPrices = /\$\s?\d|€\s?\d|£\s?\d|\b\d+\s*(?:usd|eur|gbp|night|per night)\b/i.test(ai);

  if (wantsPrices && !hasPrices && !wantsUrls) {
    gaps.push(beat(
      'gap-missing-prices',
      'Add price ranges',
      'Include realistic price ranges or nightly rates for each option you mentioned.',
      90,
    ));
  }

  const wantsDates = /\b(when|dates?|itinerary|schedule|day-by-day|days?\s+\d)\b/i.test(userPrompt);
  const hasDates = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[/-]\d|day\s+\d|week \d)\b/i.test(ai.toLowerCase());

  if (wantsDates && !hasDates) {
    gaps.push(beat(
      'gap-missing-dates',
      'Add dates / itinerary',
      'Turn this into a day-by-day plan with specific dates based on what we discussed.',
      85,
    ));
  }

  const wantsComparison = /\b(compare|versus|vs\.?|which one|pros and cons|side by side)\b/i.test(userPrompt);
  const hasComparison = /\b(vs\.?|versus|compared to|pros|cons|better for)\b/i.test(ai.toLowerCase());

  if (wantsComparison && !hasComparison && ai.length > 200) {
    gaps.push(beat(
      'gap-missing-compare',
      'Compare side by side',
      'Compare these options in a simple side-by-side table with pros and cons.',
      80,
    ));
  }

  const wantsActionable = /\b(action|next step|what should i|checklist|to-do|todo)\b/i.test(user);
  const hasActionable = /\b\d+\.\s|\-\s|\*\s|step \d|next step/i.test(ai);

  if (wantsActionable && !hasActionable && ai.length > 300) {
    gaps.push(beat(
      'gap-missing-actions',
      'Make it actionable',
      'Give me a short numbered action plan — what should I do next, in order?',
      75,
    ));
  }

  return gaps.sort((a, b) => b.priority - a.priority);
}

/** Merge gap-fix chips ahead of model/domain continues (deduped, max 3). */
export function injectGapContinues(continueSet, gaps = []) {
  if (!gaps.length) return continueSet;

  const existing = continueSet?.items ? [...continueSet.items] : [];
  const seen = new Set(existing.map((i) => i.label.toLowerCase()));

  const merged = [];
  for (const gap of gaps) {
    if (merged.length >= 3) break;
    if (seen.has(gap.label.toLowerCase())) continue;
    merged.push({ id: gap.id, label: gap.label, value: gap.value });
    seen.add(gap.label.toLowerCase());
  }

  for (const item of existing) {
    if (merged.length >= 3) break;
    if (seen.has(item.label.toLowerCase())) continue;
    merged.push(item);
    seen.add(item.label.toLowerCase());
  }

  return {
    prompt: gaps.length ? 'I noticed something may be missing — fix it with one tap:' : (continueSet?.prompt || 'Where next?'),
    items: merged,
  };
}
