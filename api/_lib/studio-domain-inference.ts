import { normalizeStudioDomain, type StudioDomain } from "./studio-domains.js";

type HistoryItem = { sender?: unknown; text?: unknown };

type DomainSignalProfile = {
  domain: StudioDomain;
  patterns: RegExp[];
};

const HISTORY_LIMIT = 8;
const CURRENT_TURN_WEIGHT = 2;
const HISTORY_WEIGHT = 2;
const MINIMUM_CONFIDENCE_SCORE = 2;

/** Shop / preview follow-ups mention money without being Finance Advisor work. */
const CODING_DESK_CONTEXT = /\b(boutique|storefront|e-?commerce|saree|kanjeevaram|online shop|add[\s-]?to[\s-]?(?:bag|cart)|shopping cart|currency converter)\b/i;
const CODING_SHOP_FOLLOWUP = /\b(cart|checkout|catalog|currency|prices?|costs?)\b/i;
const CODING_BUILD_CUE = /\b(build|create|develop|design|website|html|preview|css|add[\s-]?to[\s-]?(?:bag|cart))\b/i;

/** Declarative domain semantics; provider/model routing must not own this knowledge. */
const DOMAIN_SIGNAL_REGISTRY: DomainSignalProfile[] = [
  {
    domain: "travel",
    patterns: [
      /\btravel\b/i, /\btrips?\b/i, /\bflights?\b/i, /\bhotels?\b/i, /\bitinerar(?:y|ies)\b/i,
      /\bdestinations?\b/i, /\bvisa\b/i, /\bholidays?\b/i, /\bvacations?\b/i, /\bairports?\b/i,
      /\bresorts?\b/i, /\battractions?\b/i, /\battactions?\b/i, /\btours?\b/i,
    ],
  },
  {
    domain: "education",
    patterns: [
      /\bstudy\b/i, /\blearn\b/i, /\btutor\b/i, /\bexams?\b/i, /\bquiz(?:zes)?\b/i,
      /\bhomework\b/i, /\bcurriculum\b/i, /\bjee\b/i, /\bneet\b/i,
    ],
  },
  {
    domain: "finance",
    patterns: [
      /\bfinance\b/i, /\bbudgets?\b/i, /\bportfolios?\b/i, /\binvest(?:ing|ment|ments)?\b/i,
      /\bsavings?\b/i, /\bdebt\b/i, /\bcash flow\b/i, /\btaxes?\b/i,
    ],
  },
  {
    domain: "research",
    patterns: [
      /\bresearch\b/i, /\binvestigate\b/i, /\bevidence\b/i, /\bliterature review\b/i,
      /\bmarket scan\b/i, /\bdeep dive\b/i,
    ],
  },
];

function historyText(history: unknown): string {
  if (!Array.isArray(history)) return "";
  return history.slice(-HISTORY_LIMIT).flatMap((item: HistoryItem) => {
    if (!item || typeof item !== "object" || typeof item.text !== "string") return [];
    const sender = typeof item.sender === "string" ? item.sender.toLowerCase() : "";
    if (sender && sender !== "user" && sender !== "ai" && sender !== "assistant") return [];
    return item.text.trim() ? [item.text] : [];
  }).join("\n");
}

function signalScore(profile: DomainSignalProfile, current: string, prior: string): number {
  let score = 0;
  for (const pattern of profile.patterns) {
    if (pattern.test(current)) score += CURRENT_TURN_WEIGHT;
    if (pattern.test(prior)) score += HISTORY_WEIGHT;
  }
  return score;
}

function hasCodingDeskContext(current: string, prior: string): boolean {
  const hay = `${current}\n${prior}`;
  const shopFollowUp = CODING_DESK_CONTEXT.test(hay)
    || (CODING_SHOP_FOLLOWUP.test(hay) && /\b(shop|product|website|boutique|html|preview)\b/i.test(hay));
  // A boutique in a tax question is still Finance. Only suppress advisor
  // inference when the thread already looks like a site being built.
  return shopFollowUp && CODING_BUILD_CUE.test(hay);
}

/**
 * Fail-safe domain continuity for clients that omit studioDomain.
 * Explicit domain always wins. A live coding workspace stays coding: later
 * money / cart / price talk must not promote Finance (or Travel/Study).
 * A clear current or recent domain cue is enough to preserve continuity;
 * ties remain ambiguous and fail closed to general chat.
 */
export function inferStudioDomain(input: {
  explicit?: unknown;
  message?: unknown;
  history?: unknown;
  codingWorkspace?: boolean;
}): StudioDomain | null {
  const explicit = normalizeStudioDomain(input.explicit);
  // Session desk wins: a Study thread about "force" must not become Travel
  // because the word "trip" appeared, and a trip must not become a tutor.
  if (explicit) return explicit;

  const current = typeof input.message === "string" ? input.message : "";
  const prior = historyText(input.history);
  if (!current.trim() && !prior.trim()) return null;
  // Coding desk is represented as a null domain. Once that desk (or its
  // preview/VFS) is live, keyword inference must not swap the whole studio.
  if (input.codingWorkspace || hasCodingDeskContext(current, prior)) return null;

  const ranked = DOMAIN_SIGNAL_REGISTRY
    .map((profile) => ({ domain: profile.domain, score: signalScore(profile, current, prior) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.score < MINIMUM_CONFIDENCE_SCORE) return null;
  if (runnerUp && runnerUp.score === best.score) return null;
  return best.domain;
}

/**
 * Client turn routing: an advisor desk stays put, and an active coding
 * workspace stays coding even when this turn is not classified as a build.
 */
export function resolveTurnStudioDomain(input: {
  explicit?: unknown;
  message?: unknown;
  history?: unknown;
  isCodingRequest?: boolean;
  hasCodingWorkspace?: boolean;
} = {}): StudioDomain | null {
  return inferStudioDomain({
    explicit: input.explicit,
    message: input.message,
    history: input.history,
    codingWorkspace: Boolean(input.isCodingRequest || input.hasCodingWorkspace),
  });
}
