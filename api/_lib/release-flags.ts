import { flagsClient } from '@vercel/flags-core';
import type { SessionUser } from './session.js';

export const CLIENT_RELEASE_FLAG = Object.freeze({
  PRODUCT_TELEMETRY_V1: 'product-telemetry-v1',
});

export type ClientReleaseFlags = {
  productTelemetryV1: boolean;
};

export type ReleaseFlagEntities = {
  session: {
    authenticated: boolean;
  };
  user?: {
    id: string;
  };
};

type BooleanFlagResult = {
  value?: unknown;
};

export type BooleanFlagEvaluator = (
  flag: string,
  fallback: boolean,
  entities: ReleaseFlagEntities,
) => Promise<BooleanFlagResult>;

/**
 * Only server-derived, bounded attributes may participate in release targeting.
 *
 * Do not add email, name, prompt text, learner state or request-provided cohort
 * labels here. Vercel Flags controls release exposure; it must never become a
 * second identity/learner profile store. A signed session's stable `sub` is the
 * minimum identifier required for deterministic percentage rollouts and exact
 * allow-list targeting.
 */
export function buildReleaseFlagEntities(sessionUser: SessionUser | null): ReleaseFlagEntities {
  if (!sessionUser?.sub) {
    return { session: { authenticated: false } };
  }

  return {
    session: { authenticated: true },
    user: { id: String(sessionUser.sub) },
  };
}

async function evaluateWithVercel(
  flag: string,
  fallback: boolean,
  entities: ReleaseFlagEntities,
): Promise<BooleanFlagResult> {
  return flagsClient.evaluate<boolean>(flag, fallback, entities);
}

/**
 * Resolve the complete public/client-safe release surface in one place.
 *
 * Every flag has an explicit fail-closed default. A dashboard outage, missing
 * SDK key, unknown flag, or SDK failure therefore cannot accidentally release
 * experimental behavior. Callers receive booleans only; SDK reasons/errors and
 * provider internals stay server-side.
 */
export async function resolveClientReleaseFlags(
  sessionUser: SessionUser | null,
  evaluate: BooleanFlagEvaluator = evaluateWithVercel,
): Promise<ClientReleaseFlags> {
  const entities = buildReleaseFlagEntities(sessionUser);

  try {
    const telemetry = await evaluate(
      CLIENT_RELEASE_FLAG.PRODUCT_TELEMETRY_V1,
      false,
      entities,
    );

    return {
      productTelemetryV1: telemetry?.value === true,
    };
  } catch {
    return {
      productTelemetryV1: false,
    };
  }
}
