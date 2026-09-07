/**
 * One person's share of the paid rung.
 *
 * WHAT THIS IS FOR
 *
 * `paid-route-gate.ts` is the brake on the wallet: it reads OpenRouter's own
 * meter and refuses paid routing when the money is gone. It works, and it is
 * not enough for more than one user, because that meter is per KEY and every
 * user shares one key. So the whole allowance is first-come-first-served: one
 * person leaving an expensive loop running consumes it, and everyone else gets
 * a downgrade they did not cause and cannot explain. That is not a hypothetical
 * — a Gemini spend cap did exactly this to production on 2026-09-04, and the
 * only reason it was diagnosable is that the desk names the hold out loud.
 *
 * This module is the second brake, and a different kind: FAIRNESS, not cost.
 * It caps how many paid calls one person may make in a rolling window, so no
 * single user can take the whole allowance before the others arrive.
 *
 * WHY COUNTS AND NOT DOLLARS
 *
 * The provider publishes one number for one key and cannot say who spent what.
 * Attributing dollars per user would mean pricing every call from a catalogue
 * that drifts from what is actually charged — the arithmetic paid-route-gate
 * deliberately refused to build, for the same reason. A call count is a number
 * this platform observes exactly. Naming this a fairness brake rather than a
 * budget keeps the claim true: the dollar ceiling is still what protects the
 * money, and this only decides who gets to it.
 *
 * WHY THIS ONE FAILS OPEN WHEN THE DOLLAR GATE FAILS CLOSED
 *
 * They are opposite by design, and each is right for what it guards.
 *
 * The spend gate fails closed because unknown spend is never zero spend: if it
 * guessed, the guess spends real money that cannot be recalled.
 *
 * This gate fails open, because a quota outage denies EVERY user the paid rung
 * to prevent ONE user overrunning a share — and the overrun is still bounded by
 * the dollar ceiling standing behind it. Failing closed here would convert a
 * database blip into a platform-wide downgrade, which is the larger harm and
 * the one nobody would attribute correctly. The refusal to guess is kept where
 * a guess costs money, and dropped where it costs only fairness that a second
 * brake already bounds.
 *
 * WHY UNSET DOES NOT MEAN UNLIMITED
 *
 * `OPENROUTER_SPEND_CEILING_USD` has been unset in production this whole time,
 * so the platform brake has been running with no ceiling of its own. A quota
 * that needs an environment variable before it does anything would repeat that
 * exactly: the protection would exist in the repository and not on the
 * deployment. So an unset limit is a real default, not infinity, and a test
 * holds that. Operators may raise or lower it; they cannot forget it.
 */
import { countPaidCallsSince } from "./store.js";

/**
 * Paid calls one person may make per window when nothing is configured.
 *
 * Sized to be invisible to a person working normally and decisive against a
 * loop: well above a heavy day at the desk, and reached within minutes by
 * anything running unattended.
 */
export const DEFAULT_USER_PAID_CALL_LIMIT = 250;

/** The rolling window the limit is measured over. */
export const USER_PAID_WINDOW_HOURS = 24;

export interface UserPaidQuotaVerdict {
  allowed: boolean;
  reason: string;
  /** Calls counted in the window; null exactly when the ledger could not be read. */
  usedCalls: number | null;
  limitCalls: number;
  /** null exactly when usedCalls is null — there is nothing to subtract from. */
  remainingCalls: number | null;
  /** True when the verdict allowed because the ledger was unreachable, not because there is room. */
  unmeasured: boolean;
}

/**
 * The configured limit, or the default.
 *
 * A value that is absent, unparseable or non-positive falls back to the
 * default rather than to no limit: "0" and "banana" both plainly fail to
 * express an allowance, and reading either as unlimited is how a brake
 * silently stops existing.
 */
export function userPaidCallLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = String(env.QUANTORA_USER_PAID_CALL_LIMIT || "").trim();
  if (!raw) return DEFAULT_USER_PAID_CALL_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_USER_PAID_CALL_LIMIT;
  return Math.floor(parsed);
}

/**
 * Decide from a count that has already been read.
 *
 * Split from the read so the decision is testable without a store, and so the
 * two failure modes above are visible as two branches rather than one.
 */
export function decideUserPaidQuota(
  usedCalls: number | null,
  limitCalls: number,
): UserPaidQuotaVerdict {
  if (usedCalls === null) {
    return {
      allowed: true,
      reason: "the per-user call ledger could not be read, so this turn is not held back on an unmeasured share",
      usedCalls: null,
      limitCalls,
      remainingCalls: null,
      unmeasured: true,
    };
  }
  const remaining = Math.max(0, limitCalls - usedCalls);
  if (usedCalls >= limitCalls) {
    return {
      allowed: false,
      reason: `this account has used ${usedCalls} of ${limitCalls} premium calls in the last ${USER_PAID_WINDOW_HOURS} hours`,
      usedCalls,
      limitCalls,
      remainingCalls: 0,
      unmeasured: false,
    };
  }
  return {
    allowed: true,
    reason: `${remaining} of ${limitCalls} premium calls left in this account's ${USER_PAID_WINDOW_HOURS}-hour window`,
    usedCalls,
    limitCalls,
    remainingCalls: remaining,
    unmeasured: false,
  };
}

/**
 * Whether this person may take the paid rung on this turn.
 *
 * A turn with no signed-in person is allowed through unmeasured: there is no
 * account to charge the share to, and the dollar ceiling still applies. The
 * quota governs shares between accounts; it is not a second sign-in wall.
 */
export async function userPaidQuotaAllowed(
  userSub: string | null | undefined,
  {
    now = Date.now(),
    env = process.env,
    count = countPaidCallsSince,
  }: {
    now?: number;
    env?: Record<string, string | undefined>;
    count?: (userSub: string, sinceIso: string) => Promise<number | null>;
  } = {},
): Promise<UserPaidQuotaVerdict> {
  const limit = userPaidCallLimit(env);
  const sub = String(userSub || "").trim();
  if (!sub) {
    return {
      allowed: true,
      reason: "no account on this turn, so there is no share to measure",
      usedCalls: null,
      limitCalls: limit,
      remainingCalls: null,
      unmeasured: true,
    };
  }
  const sinceIso = new Date(now - USER_PAID_WINDOW_HOURS * 3_600_000).toISOString();
  let used: number | null = null;
  try {
    used = await count(sub, sinceIso);
  } catch {
    // Same branch as an unreadable ledger: a throw is not evidence of a used share.
    used = null;
  }
  return decideUserPaidQuota(used, limit);
}

/**
 * What to tell a person whose own share is spent.
 *
 * Deliberately different from `describePaidHold`: that sentence says the
 * platform's money ran out and points at the OpenRouter ceiling, which is the
 * wrong remedy and the wrong culprit when the platform has money and this
 * account has simply used its share. Returns '' when nothing is held.
 */
export function describeUserQuotaHold(verdict: UserPaidQuotaVerdict | null): string {
  if (!verdict || verdict.allowed) return "";
  return `Premium models are paused for this account: ${verdict.usedCalls} of `
    + `${verdict.limitCalls} premium calls used in the last ${USER_PAID_WINDOW_HOURS} hours. `
    + `Free routes still work and are unaffected. The allowance refills as the `
    + `oldest calls age out of the window.`;
}
