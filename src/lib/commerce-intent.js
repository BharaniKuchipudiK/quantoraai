/**
 * Commerce intent — the ONE definition of "is this brief asking to sell online?"
 *
 * This concept was previously written four separate times, each subtly
 * different, and the copies drifted:
 *
 *   api/_lib/verify-build.ts      scoring   → attached a critical photo check
 *   src/lib/outcome-gap-detection.js chips  → offered payment-gateway chips
 *   src/lib/studio-desk-context.js  probes  → decided if the desk is a shop
 *   src/lib/shop-catalog-scale.js   intake  → sized the catalog ask
 *
 * The user-visible damage: "a one-page site for a coffee shop" matched a bare
 * \bshop\b and was treated as e-commerce — a phantom catalog was injected, a
 * critical ">=10 product photos" check capped the score below the pass bar so
 * the build could never pass, and the chip row offered a payment gateway and
 * asked whether the cafe ships internationally.
 *
 * A venue noun is not a request to sell. Require an explicit selling signal.
 */

/*
 * Note: "<venue> shop website" ("barber shop website", "coffee shop website")
 * is still a venue page, so a bare "shop site/website" is deliberately NOT a
 * selling signal. A genuine shop turn carries a job card whose mustWork items
 * name "Add to Cart" and "catalog photos", which match on their own.
 */
const SELLS_ONLINE_RE =
  /\b(e-?commerce|online\s+(?:shop|store|boutique)|web\s?shop|storefront|shopping\s+(?:cart|bag)|add[\s-]?to[\s-]?(?:cart|bag)|check\s?out|payment\s+gateway|sell(?:s|ing)?|cart|boutique|catalog(?:ue)?|merchandise)\b/i;

/*
 * Only a genuine merchandise/catalog brief may impose the CRITICAL photo bar.
 * "sell a subscription with a checkout" is commerce, but it has no catalog of
 * product shots to prove, so a missing image must not cap its score.
 */
const MERCHANDISE_BRIEF_RE =
  /\b(boutique|catalog(?:ue)?|merchandise|storefront|e-?commerce|online\s+(?:shop|store)|product\s+(?:photos?|images?|shots?))\b/i;

/*
 * "no images", "without photos", "text only" — asking for a page with no
 * pictures must never produce an "Add real product photos" nudge.
 */
const NO_IMAGES_RE =
  /\b(no|without|zero|skip(?:ping)?|avoid|don'?t\s+(?:use|add|include)|do\s+not\s+(?:use|add|include))\s+(?:any\s+)?(?:images?|photos?|pictures?|graphics?|visuals?)\b|\btext[\s-]only\b/i;

/** True when the brief actually asks to sell online, not merely names a venue. */
export function briefWantsOnlineSelling(brief = '') {
  return SELLS_ONLINE_RE.test(String(brief || ''));
}

/** True when the brief asks for a product catalog whose photos must be real. */
export function briefWantsProductCatalog(brief = '') {
  const b = String(brief || '');
  return briefWantsOnlineSelling(b) && MERCHANDISE_BRIEF_RE.test(b);
}

/** True when the brief explicitly asks for NO images. */
export function briefWantsNoImages(brief = '') {
  return NO_IMAGES_RE.test(String(brief || ''));
}
