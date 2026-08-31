/**
 * Duffel tokens carry their environment in the token itself: `duffel_live_…`
 * reaches real airline inventory, `duffel_test_…` reaches Duffel's sandbox.
 *
 * WHY THIS IS WORTH REPORTING
 *
 * A sandbox token is not a broken one. It authenticates, it returns offers,
 * and those offers carry real carrier names and plausible fares — so the desk
 * shows flight cards that satisfy every honesty rule this repo has, for fares
 * nobody can buy. "Never invent a fare" is enforced everywhere; "these fares
 * are real" was not checkable anywhere.
 *
 * The health endpoint already reported placesConfigured and said nothing about
 * flights at all, so an operator could see whether hotels were connected but
 * had no way to tell whether flight search was live, sandboxed, or absent
 * short of running a search and trusting what came back.
 *
 * Nothing here returns key material. Shape and mode are not secrets; the token
 * is.
 */

export type DuffelKeyShape = 'live' | 'test' | 'other' | 'missing';

export function duffelKeyShape(value: unknown): DuffelKeyShape {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return 'missing';
  if (/^duffel_live_/i.test(key)) return 'live';
  if (/^duffel_test_/i.test(key)) return 'test';
  return 'other';
}

/** True when a token exists at all — sandbox tokens do reach a provider. */
export function isDuffelConfigured(value: unknown): boolean {
  return duffelKeyShape(value) !== 'missing';
}

type DuffelEnvReport = {
  configured: boolean;
  /** The mode of the key that serves first, which is the fallback's when there is no primary. */
  shape: DuffelKeyShape;
  hint: string | null;
  fallbackShape: DuffelKeyShape;
  /**
   * A live primary with a sandbox fallback (or the reverse). The fallback is
   * tried once when the primary fails, so a mismatched pair means a retry can
   * quietly answer with fares from the other environment — the hardest version
   * of this bug to see, because it only appears when something else went wrong.
   */
  mixedModes: boolean;
};

export function duffelEnvPublicHint(env: NodeJS.ProcessEnv = process.env): DuffelEnvReport {
  const primaryShape = duffelKeyShape(env.DUFFEL_API_KEY);
  const fallbackShape = duffelKeyShape(env.DUFFEL_FALLBACK_API_KEY);
  /*
   * executeFlightSearch tries the fallback even when no primary client exists,
   * so a fallback-only deployment really can search. Reading either field from
   * the primary alone would report flights dead where they work, and the board
   * consuming that would dark its chips on a deployment that answers fine.
   */
  const shape = primaryShape !== 'missing' ? primaryShape : fallbackShape;
  const modes = [shape, fallbackShape].filter((value) => value === 'live' || value === 'test');
  const mixedModes = new Set(modes).size > 1;

  const hint = shape === 'missing'
    ? null
    : shape === 'live'
      ? 'duffel_live_… — real airline inventory and bookable fares'
      : shape === 'test'
        ? 'duffel_test_… — Duffel sandbox: offers look real but are not real availability or bookable prices'
        : '(unexpected — not a duffel_live_/duffel_test_ token)';

  return {
    configured: isDuffelConfigured(env.DUFFEL_API_KEY) || isDuffelConfigured(env.DUFFEL_FALLBACK_API_KEY),
    shape,
    hint,
    fallbackShape,
    mixedModes,
  };
}

/**
 * The mode of the client that actually returned the fares.
 *
 * The fallback answers when the primary fails, and the two can be different
 * modes. Reporting the primary's mode for a result the fallback produced puts
 * "Live from Duffel" over sandbox fares — the exact claim this reporting
 * exists to prevent, arriving through the one path nobody watches, because it
 * only opens when something else has already failed.
 */
export function servingDuffelMode(
  report: DuffelEnvReport,
  { fallbackUsed = false }: { fallbackUsed?: boolean } = {},
): DuffelKeyShape {
  return fallbackUsed ? report.fallbackShape : report.shape;
}
