/**
 * How long a Gemini SDK call may take before it is abandoned.
 *
 * WHY THIS FILE EXISTS
 *
 * On 2026-09-09, twelve `models.generateContent` call sites under api/ passed
 * no abortSignal at all. The SDK is only interruptible through that signal, so
 * each of them could hold its serverless function until the platform killed it
 * — the same defect that gave one user a 69.4-second dead route in the chat
 * handler, in twelve more places: autocomplete (which runs as you type), the
 * intent router, both research paths, the repair loop, the build critic, the
 * pipeline, Office generation and domain suggestions.
 *
 * WHY THERE IS NO SINGLE NUMBER
 *
 * A bound that is too tight breaks a working path, which is a worse bug than
 * the hang it replaces. Autocomplete is useless after a few seconds; a deck can
 * legitimately take a minute and a half. So each call site takes the budget its
 * own file already states for the SAME job on its OpenRouter path — those
 * numbers were chosen by whoever wrote the feature, and they were simply never
 * applied to the Gemini branch:
 *
 *   semantic-router.ts    20_000   its own fetchWithTimeout
 *   verify-build.ts       45_000   its own fetchWithTimeout
 *   research-verify.ts    45_000   its own MODEL_TIMEOUT_MS
 *   repair.ts             90_000   its own fetchWithTimeout
 *   domains.ts             8_000   its own fetchWithTimeout
 *   generate-office.ts    remainingMs — its own parameter, already computed
 *                                  and, until now, ignored
 *   research-deep-dive.ts 45_000   its sibling research module's constant; its
 *                                  own comment already says these calls "share
 *                                  the function's time budget"
 *
 * WHAT IS LEFT, AND WHY IT IS A CEILING RATHER THAN A TUNING
 *
 * Four sites state no budget anywhere: autocomplete, enhance and both pipeline
 * calls. Inventing a tight number for them would be guessing with a user's
 * working turn as the stake, so this constant is deliberately generous. It
 * exists for exactly one purpose — a dead provider must not hold a function
 * open indefinitely — and not to make anything faster.
 *
 * The number is anchored on evidence rather than taste. A production trace on
 * 2026-09-09 recorded a SUCCESSFUL gemini-flash reply that took 51 seconds. Any
 * ceiling below that would have killed a call that was working. 120s sits well
 * clear of it and still well inside the 300s maxDuration that vercel.json
 * declares for pipeline.ts and generate-office.ts, so the function keeps time to
 * answer with a real error instead of being killed mid-flight.
 *
 * Tighten per site when there is latency evidence to tighten against. Until
 * then, generous and finite beats precise and wrong.
 */
export const UNTUNED_GEMINI_CEILING_MS = 120_000;

/**
 * The research desk's shared budget. research-verify.ts fixed this number for
 * its own OpenRouter call; research-deep-dive.ts does the same work against the
 * same sources and had only a note about sharing the function's budget.
 */
export const RESEARCH_GEMINI_BUDGET_MS = 45_000;
