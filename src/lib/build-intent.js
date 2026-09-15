import { resolveIsCodingRequest as resolveSharedIsCodingRequest } from '../../shared/build-intent.js';

export * from '../../shared/build-intent.js';

/**
 * The shared build vocabulary recognizes `storefront` but not the equally common
 * `shop` wording. Normalize that synonym before classification so an explicit
 * "build an online shop" request reaches the Coding planner without weakening
 * the shared question/analysis guards.
 */
export function resolveIsCodingRequest(text, options = {}) {
  const normalized = typeof text === 'string'
    ? text.replace(/\bonline\s+shop\b/gi, 'storefront').replace(/\bshop\b/gi, 'storefront')
    : text;
  return resolveSharedIsCodingRequest(normalized, options);
}
