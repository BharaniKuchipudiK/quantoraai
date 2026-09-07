/**
 * One person's daily share of the platform's own model spend.
 *
 * WHY THIS EXISTS WHEN A PAID-CALL QUOTA ALREADY DOES
 *
 * user-paid-quota.ts caps paid calls per person and is correct about what it
 * counts. It is also, in production today, unable to see the money actually
 * leaving. Two independent breaks, each verified in the code:
 *
 * 1. GEMINI IS NEVER A PAID ROUTE. inference-control-plane builds a free
 *    ladder that always runs first and reserves the last rung for a paid
 *    rescue; only that rung is tagged `paid: true`. Gemini sits in the free
 *    ladder, so `route.paid` is never true for it, recordPaidCallEvent never
 *    fires, and the quota is never consulted. That classification was true
 *    when the key was on Google's free tier. It stopped being true the day
 *    billing was enabled — every Gemini call now bills — and the code never
 *    learned.
 *
 * 2. THE LEDGER IT COUNTS FROM IS NOT DEPLOYED. countPaidCallsSince reads
 *    paid_call_events, whose migration is written and unapplied, so the read
 *    fails and the quota deliberately fails open.
 *
 * Net effect on 2026-09-07: one user could spend the entire prepaid balance in
 * an afternoon and nothing in the platform would stop them. The whole
 * cost-control apparatus was watching OpenRouter, which had barely been
 * touched, while the meter that actually drained had no guard at all.
 *
 * WHY A TURN AND NOT A DOLLAR
 *
 * Attributing dollars per user means pricing every call from a catalogue that
 * drifts from what is charged — the arithmetic paid-route-gate deliberately
 * refused to build, for the same reason. A turn is a number this platform
 * observes exactly, and the measured cost of the most expensive kind of turn
 * is known, so a turn budget converts to a dollar bound without guessing.
 *
 * WHY NOT SIMPLY RECLASSIFY GEMINI AS PAID
 *
 * Because that would move it out of the free ladder and change which model
 * every user gets, silently, as a side effect of a cost fix. This gate sits
 * BEFORE routing and touches no pricing taxonomy: the ladder is unchanged, and
 * a turn either happens as it always did or does not happen at all.
 *
 * BYOK IS EXEMPT, deliberately. A user spending their own key costs this
 * platform nothing, and rationing somebody else's money is not a cost control.
 */
import {
  applyDurableCostBearingGuard,
  isRateLimitedDurable,
  type DurableRateResult,
} from "./rate-limit.js";

/**
 * Turns one person may take on the platform's own keys per day.
 *
 * Sized against the pot rather than picked round: at the measured cost of a
 * full build turn, this bounds a single runaway user to a small fraction of a
 * prepaid balance per day, while sitting well above a student exploring the
 * desk for an afternoon. Operators should set USER_DAILY_TURN_BUDGET
 * deliberately once real usage is measured; this is the floor under not having.
 */
export const DEFAULT_USER_DAILY_TURNS = 30;

/**
 * Turns EVERYONE may take on the platform's own keys per day, together.
 *
 * The per-user cap answers "can one person drain it". It does not answer "can
 * ten people drain it", and with a balance measured in weeks that second
 * question is just as real. Ten users at the per-user cap would still empty a
 * small prepaid balance in days, so the platform keeps a number of its own.
 */
export const DEFAULT_PLATFORM_DAILY_TURNS = 120;

const WINDOW_SECONDS = 24 * 60 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1_000;

export const PLATFORM_TURN_KEY = "turns:day:platform";

export function userTurnKey(userSub: string): string {
  return `turns:day:user:${userSub}`;
}

function positiveIntFrom(raw: string | undefined, fallback: number): number {
  const text = String(raw || "").trim();
  if (!text) return fallback;
  const value = Number(text);
  /*
   * Zero, negative and unparseable all fall back to the default. "0" meaning
   * "unlimited" is the trap this whole family of ceilings exists to close.
   */
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function userDailyTurnBudget(env: Record<string, string | undefined> = process.env): number {
  return positiveIntFrom(env.USER_DAILY_TURN_BUDGET, DEFAULT_USER_DAILY_TURNS);
}

export function platformDailyTurnBudget(env: Record<string, string | undefined> = process.env): number {
  return positiveIntFrom(env.PLATFORM_DAILY_TURN_BUDGET, DEFAULT_PLATFORM_DAILY_TURNS);
}

export type TurnBudgetScope = "user" | "platform";

export interface TurnBudgetVerdict {
  allowed: boolean;
  /** Which budget refused, when one did. Null exactly when allowed. */
  exhausted: TurnBudgetScope | null;
  userLimit: number;
  platformLimit: number;
  /** True when the durable counter was unreachable and a stricter bound decided. */
  degraded: boolean;
}

/**
 * Counted on hit_rate_limit, which has been deployed since migration 0003.
 *
 * Chosen over a new table on purpose: two migrations are already written and
 * unapplied, and a protection that needed a third would exist in this
 * repository and on no deployment — which is precisely break (2) above,
 * repeated. A guard that cannot run is not a guard.
 *
 * Fails the way every other cost-bearing route here fails:
 * applyDurableCostBearingGuard already owns "what happens when Supabase is
 * unreachable" and answers it with a stricter per-instance bound rather than
 * an open door. A second answer would drift from the first.
 */
export async function turnBudgetVerdict(
  userSub: string | null | undefined,
  {
    env = process.env,
    checkDurable = isRateLimitedDurable,
    applyGuard = applyDurableCostBearingGuard,
  }: {
    env?: Record<string, string | undefined>;
    checkDurable?: (key: string, limit: number, windowSeconds: number) => Promise<DurableRateResult>;
    applyGuard?: typeof applyDurableCostBearingGuard;
  } = {},
): Promise<TurnBudgetVerdict> {
  const userLimit = userDailyTurnBudget(env);
  const platformLimit = platformDailyTurnBudget(env);
  const base = { userLimit, platformLimit };

  /*
   * The platform's own total is checked FIRST, and for a reason worth stating:
   * an anonymous or unidentified turn still spends the platform's money. If the
   * total were only reached through a per-user counter, a caller with no
   * resolvable identity would bypass every budget here.
   */
  const platform = await checkDurable(PLATFORM_TURN_KEY, platformLimit, WINDOW_SECONDS);
  const platformGuard = applyGuard(PLATFORM_TURN_KEY, platformLimit, platform, WINDOW_MS);
  if (platformGuard.limited) {
    return { ...base, allowed: false, exhausted: "platform", degraded: platformGuard.degraded };
  }

  const sub = String(userSub || "").trim();
  if (!sub) {
    // No identity to charge: the platform total above is the only bound, and it
    // has already been counted, so this turn is paid for.
    return { ...base, allowed: true, exhausted: null, degraded: platformGuard.degraded };
  }

  const key = userTurnKey(sub);
  const user = await checkDurable(key, userLimit, WINDOW_SECONDS);
  const userGuard = applyGuard(key, userLimit, user, WINDOW_MS);
  if (userGuard.limited) {
    return { ...base, allowed: false, exhausted: "user", degraded: userGuard.degraded };
  }

  return { ...base, allowed: true, exhausted: null, degraded: platformGuard.degraded || userGuard.degraded };
}

/**
 * What a person is told when a budget holds their turn back.
 *
 * These are students on a borrowed budget, not operators reading a log. The
 * copy has to say what happened, that it is not their fault, that it comes
 * back, and what they can do meanwhile — a bare "quota exceeded" reads as the
 * platform being broken, and the person who hits it does not come back.
 */
export function describeTurnBudget(verdict: TurnBudgetVerdict): string {
  if (verdict.allowed) return "";
  if (verdict.exhausted === "platform") {
    return "Quantora has reached its shared daily limit for AI work, so new turns are paused for "
      + "everyone until it resets in the next 24 hours. Nothing you did caused this and nothing "
      + "you have built is lost — your projects and files are exactly where you left them. "
      + "Adding your own API key in Settings lifts this immediately, because your key has its own allowance.";
  }
  return `You have used your ${verdict.userLimit} AI turns for today. They reset within 24 hours, and `
    + "everything you have built is saved — you can still open, read and edit your projects meanwhile. "
    + "Adding your own API key in Settings removes this limit, because your key has its own allowance.";
}
