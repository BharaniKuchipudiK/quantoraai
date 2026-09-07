import { normalizeStudioDomain, type StudioDomain } from "./domains.js";
import { detectBuildIntent, isSpecifiedRunnableTool } from "../build-intent.js";

type HistoryItem = { sender?: unknown; text?: unknown };

type DomainSignalProfile = {
  domain: StudioDomain;
  patterns: RegExp[];
};

const HISTORY_LIMIT = 8;
const CURRENT_TURN_WEIGHT = 2;
const HISTORY_WEIGHT = 2;
const MINIMUM_CONFIDENCE_SCORE = 2;
/**
 * A reply to the desk's own question carries no signal of its own —
 * "September 12 to 15", "two adults", "yes, go ahead" — and history must be
 * allowed to keep it on the desk that asked. A new request long enough to
 * carry its own signals and carrying none for this desk is a new topic, and
 * history must not claim it (2026-09-06: interview preparation for an
 * aviation data job, sixty words, answered on Travel). Eight words is the
 * line: every recorded follow-up fits under it, and the hijack was far over.
 */
const FOLLOW_UP_MAX_WORDS = 8;

/** Shop / preview follow-ups mention money without being Finance Advisor work. */
const CODING_DESK_CONTEXT = /\b(boutique|storefront|e-?commerce|saree|kanjeevaram|online shop|add[\s-]?to[\s-]?(?:bag|cart)|shopping cart|currency converter)\b/i;
const CODING_SHOP_FOLLOWUP = /\b(cart|checkout|catalog|currency|prices?|costs?)\b/i;
const CODING_BUILD_CUE = /\b(build|create|develop|design|website|html|preview|css|add[\s-]?to[\s-]?(?:bag|cart))\b/i;
/** Preview / VFS markers that prove a coding desk already ran in this thread. */
const CODING_PREVIEW_ARTIFACT = /\b(filepath=["'][^"']+\.(?:html|jsx|tsx|css|js)|```(?:html|jsx|tsx)|index\.html|vite|src\/app)\b/i;

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

/** The current message's own signal for a desk, with history left out. */
function currentTurnScore(profile: DomainSignalProfile, current: string): number {
  let score = 0;
  for (const pattern of profile.patterns) {
    if (pattern.test(current)) score += CURRENT_TURN_WEIGHT;
  }
  return score;
}

function isShortFollowUp(current: string): boolean {
  const words = current.trim().split(/\s+/).filter(Boolean);
  return words.length <= FOLLOW_UP_MAX_WORDS;
}

/** Strong coding nouns — excludes advisor-ambiguous words like portfolio. */
const STRONG_CODING_NOUN = /\b(app|application|web ?site|website|landing page|web ?page|html|preview|calculator|dashboard|component|widget|todo(?:s| list)?|timer|stopwatch|game|storefront|boutique|shop)\b/i;

function lineLooksLikeCodingBuild(line: string): boolean {
  if (!line.trim()) return false;
  // Reuse build-intent semantics, then require a coding-strong noun so
  // “create an investment portfolio?” cannot lock the thread as a desk.
  if (isSpecifiedRunnableTool(line)) return true;
  return detectBuildIntent(line) && STRONG_CODING_NOUN.test(line);
}

/** True when earlier turns already started a coding build / preview desk. */
function historyHasCodingBuild(prior: string): boolean {
  if (!prior.trim()) return false;
  for (const chunk of prior.split("\n")) {
    if (lineLooksLikeCodingBuild(chunk)) return true;
  }
  // Artifact / shop-desk evidence is stronger than ambiguous verb+noun pairs.
  if (CODING_PREVIEW_ARTIFACT.test(prior)) return true;
  if (CODING_DESK_CONTEXT.test(prior) && CODING_BUILD_CUE.test(prior)) return true;
  return false;
}

function hasCodingDeskContext(current: string, prior: string): boolean {
  const hay = `${current}\n${prior}`;
  const shopFollowUp = CODING_DESK_CONTEXT.test(hay)
    || (CODING_SHOP_FOLLOWUP.test(hay) && /\b(shop|product|website|boutique|html|preview)\b/i.test(hay));
  // A boutique in a tax question is still Finance. Only suppress advisor
  // inference when the thread already looks like a site being built.
  if (shopFollowUp && CODING_BUILD_CUE.test(hay)) return true;
  // Same sticky rule for Study / Travel / Research cues after any coding build.
  return historyHasCodingBuild(prior);
}

/**
 * Fail-safe domain continuity for clients that omit studioDomain.
 * Explicit domain always wins. A live coding workspace stays coding: later
 * money / cart / price / exam / trip / research talk must not promote an
 * advisor. A clear current or recent domain cue is enough to preserve
 * continuity; ties remain ambiguous and fail closed to general chat.
 */
export function inferStudioDomain(input: {
  explicit?: unknown;
  message?: unknown;
  history?: unknown;
  codingWorkspace?: boolean;
  /**
   * A chat created inside a workspace belongs to it for life (2026-09-06).
   * The Coding desk is the null domain, so "explicit wins" never protected
   * it: a coding chat with no build yet could be moved to Travel by one
   * trip word. Pinned means the workspace decided, whatever the message.
   */
  pinned?: boolean;
  /**
   * ROUTING MEMORY, and deliberately NOT `explicit` (2026-09-07).
   *
   * The caller used to fold this into `explicit` — `studioDomain ||
   * rememberedDomain` — and `explicit` short-circuits above the coding check.
   * So one travel word anywhere in a thread pinned it to Travel for life: with
   * a live coding workspace AND an explicit build ask it still returned
   * `travel`, and the studio chrome showed the Travel desk while the person
   * was building a site. Reproduced before this was written.
   *
   * Membership outranks a live coding workspace, because a person chose it.
   * A remembered desk does not — it is only what the words happened to say
   * earlier, and an open workspace is the stronger evidence of the two.
   */
  remembered?: unknown;
}): StudioDomain | null {
  const explicit = normalizeStudioDomain(input.explicit);
  if (input.pinned === true) return explicit;
  // Session desk wins: a Study thread about "force" must not become Travel
  // because the word "trip" appeared, and a trip must not become a tutor.
  if (explicit) return explicit;

  const current = typeof input.message === "string" ? input.message : "";
  const prior = historyText(input.history);
  if (!current.trim() && !prior.trim()) return null;
  // Coding desk is represented as a null domain. Once that desk (or its
  // preview/VFS) is live, keyword inference must not swap the whole studio.
  if (input.codingWorkspace || hasCodingDeskContext(current, prior)) return null;

  // Only now: the desk this thread has been answering as. Below the coding
  // check so a build can always take the thread back, above scoring so turn
  // two of a trip still gets travel tools when the words alone say nothing.
  const remembered = normalizeStudioDomain(input.remembered);
  if (remembered) return remembered;

  /*
   * THE CURRENT MESSAGE MUST SAY SO (2026-09-06).
   *
   * History used to be able to move a chat on its own: with no explicit desk,
   * one travel word in an earlier turn scored the floor by itself, so a new
   * message with no signal for any desk — an interview-preparation question
   * about an aviation data job — was routed to Travel by a trip discussed
   * before it. The rule this file already states, "a Study thread about force
   * must not become Travel because the word trip appeared", was true only for
   * an explicit desk. Now a desk is a candidate only when the current message
   * carries at least one of its signals; history still reinforces a candidate
   * and still breaks ties between candidates. The one place history may still
   * choose on its own is a short follow-up (FOLLOW_UP_MAX_WORDS) — the answer
   * to a question the desk asked, which has no words of its own to score.
   */
  const scored = DOMAIN_SIGNAL_REGISTRY.map((profile) => ({
    domain: profile.domain,
    current: currentTurnScore(profile, current),
    score: signalScore(profile, current, prior),
  }));
  const spoken = scored.filter((entry) => entry.current >= CURRENT_TURN_WEIGHT);
  const candidates = spoken.length ? spoken : (isShortFollowUp(current) ? scored : []);
  const ranked = candidates.sort((a, b) => b.score - a.score);

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
  pinned?: boolean;
  remembered?: unknown;
} = {}): StudioDomain | null {
  return inferStudioDomain({
    explicit: input.explicit,
    message: input.message,
    history: input.history,
    codingWorkspace: Boolean(input.isCodingRequest || input.hasCodingWorkspace),
    pinned: input.pinned === true,
    remembered: input.remembered,
  });
}

/**
 * MEMBERSHIP IS NOT ROUTING (2026-09-06).
 *
 * A turn's inferred desk used to be written straight onto the session as
 * `studioDomain`, which is the field the sidebar groups by. So the first
 * message of a top-level New Chat moved the chat: "help me plan a trip to
 * Kyoto" filed it under Travel, "I want to learn calculus" under Study Tutor.
 * The person had opened a general chat and watched it leave — reported as
 * "suddenly this chat jumps to a different Workspace".
 *
 * Inference was never wrong to run; it was wrong to be believed about
 * OWNERSHIP. So the two are separated rather than one being muted:
 *
 *   - `studioDomain` is MEMBERSHIP. Only a person sets it — the "+" beside a
 *     workspace, an advisor card, a move from the chat's own menu.
 *   - `inferredDomain` is ROUTING MEMORY. The desk this thread has been
 *     answering as, so turn two of a trip conversation still gets the travel
 *     tools when the message itself says nothing about travel.
 *
 * Routing is unchanged by this split: the request still carries the inferred
 * desk. Only the sidebar stops moving.
 *
 * This function is the single place that decision is made, so the class is
 * closable by a test rather than by review: it may never return a
 * `studioDomain` key, whatever it is asked.
 */
export function turnDomainSessionPatch(input: {
  turnDomain?: unknown;
  sessionDomain?: unknown;
  pinned?: boolean;
}): { inferredDomain?: StudioDomain } {
  // A pinned chat's workspace already decided; it carries no routing memory.
  if (input.pinned === true) return {};
  const turnDomain = normalizeStudioDomain(input.turnDomain);
  if (!turnDomain) return {};
  if (turnDomain === normalizeStudioDomain(input.sessionDomain)) return {};
  return { inferredDomain: turnDomain };
}
