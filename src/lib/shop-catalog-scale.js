/**
 * Coding Desk Preview is a web shop, not an image studio.
 * Cap catalog size honestly and never treat empty picture boxes as success.
 */

export const SHOP_CATALOG_CAP = 24;
export const SHOP_CATALOG_DEFAULT = 12;
export const SHOP_PHOTO_FLOOR = 6;
/** Honest first slice when the brief asks for dozens of unique AI mockups. */
export const SHOP_INTAKE_CATALOG_SIZE = 10;
/** ≥ this many unique images / designs in one turn → oversize intake. */
export const SHOP_OVERSIZE_IMAGE_ASK = 20;

/** Shop / merchandise intent — do not treat checklists or galleries as catalog intake. */
const SHOP_BUILD_INTENT_RE = /\b(boutique|saree|sari|e-?commerce|storefront|online\s+shop|\bshop\b|merchandise|product\s+catalog|product\s+pages?|kids?\s+(?:wear|apparel|collection)|clothing\s+(?:store|shop)|apparel|checkout|add\s+to\s+(?:cart|bag)|catalog\s+photos?|storefront)\b/i;

/**
 * True when the brief is actually a shop / merchandise build (not a generic count of items/images).
 */
export function messageLooksLikeShopBuild(message = '') {
  return SHOP_BUILD_INTENT_RE.test(String(message || ''));
}

/** User asked for N unique designs / photos / SKUs in one turn. */
export function requestedShopCatalogSize(text = '') {
  const raw = String(text || '');
  const patterns = [
    /\b(\d{2,3})\s*(?:unique\s+)?(?:design(?:s|ed)?|products?|items?|skus?|photos?|images?|mockups?|pieces?)\b/i,
    /\b(?:generate|create|make|build)\s+(\d{2,3})\s+(?:unique\s+)?(?:design(?:s|ed)?|products?|items?|skus?|photos?|images?|mockups?|pieces?)\b/i,
    /\b(?:unique|merchandise|product)\s+(?:design\s+)?(?:images?|photos?|mockups?)\s*[:=]?\s*(\d{2,3})\b/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Assess a shop / merchandise build brief before Coding Desk pretends it can
 * generate dozens of unique AI product photos in one turn.
 *
 * @returns {{
 *   imageAskCount: number,
 *   oversize: boolean,
 *   proposedCatalogSize: number,
 *   userCopy: string,
 *   chips: Array<{ id: string, label: string, value: string, priority?: number }>,
 *   catalogTarget: number | null,
 *   userAsked: number,
 * }}
 */
export function assessShopBuildAsk(message = '') {
  const shopIntent = messageLooksLikeShopBuild(message);
  const imageAskCount = shopIntent ? requestedShopCatalogSize(message) : 0;
  const oversize = shopIntent && imageAskCount >= SHOP_OVERSIZE_IMAGE_ASK;
  const proposedCatalogSize = oversize
    ? SHOP_INTAKE_CATALOG_SIZE
    : (imageAskCount
      ? Math.min(SHOP_CATALOG_CAP, Math.max(SHOP_PHOTO_FLOOR, imageAskCount))
      : SHOP_CATALOG_DEFAULT);

  if (!oversize) {
    return {
      imageAskCount,
      oversize: false,
      proposedCatalogSize,
      userCopy: '',
      chips: [],
      catalogTarget: imageAskCount ? proposedCatalogSize : null,
      userAsked: imageAskCount,
    };
  }

  const userCopy = (
    `We can’t generate ${imageAskCount} unique product photos in one Coding Desk turn. `
    + `We’ll build the shop with about ${SHOP_INTAKE_CATALOG_SIZE} working catalog photos now. `
    + `You can upload more images later, or ask to expand the catalog.`
  );

  const chips = [
    {
      id: 'shop-intake-start-10',
      label: `Start with ${SHOP_INTAKE_CATALOG_SIZE}`,
      value: (
        `Build the shop now with about ${SHOP_INTAKE_CATALOG_SIZE} working catalog photos `
        + `(not ${imageAskCount} unique AI mockups). Every product needs a real loadable <img> photo, `
        + 'price, and Add to Cart. Do not invent empty picture boxes.'
      ),
      priority: 112,
    },
    {
      id: 'shop-intake-upload',
      label: 'I’ll upload images',
      value: (
        `Build the shop shell with about ${SHOP_INTAKE_CATALOG_SIZE} placeholder catalog slots `
        + 'and tell me how to upload my own product photos next. Do not claim 100 unique AI mockups are ready.'
      ),
      priority: 111,
    },
  ];

  return {
    imageAskCount,
    oversize: true,
    proposedCatalogSize: SHOP_INTAKE_CATALOG_SIZE,
    userCopy,
    chips,
    catalogTarget: SHOP_INTAKE_CATALOG_SIZE,
    userAsked: imageAskCount,
  };
}

/** Session / PCL facts so follow-ups do not re-promise the original huge image count. */
export function shopIntakeSessionFacts(assessment) {
  if (!assessment?.oversize) return [];
  const asked = Number(assessment.userAsked) || 0;
  const target = Number(assessment.catalogTarget) || SHOP_INTAKE_CATALOG_SIZE;
  return [
    `shopCatalogTarget:${target}`,
    `shopCatalogUserAsked:${asked}`,
    `Catalog photos this turn: about ${target} working images (user asked for ${asked}; not generating ${asked} unique AI mockups in one turn).`,
  ];
}

export function shopCatalogTargetSize(text = '', existingCount = 0) {
  const assessment = assessShopBuildAsk(text);
  if (assessment.oversize) {
    return assessment.proposedCatalogSize;
  }
  const asked = assessment.imageAskCount;
  const base = asked || existingCount || SHOP_CATALOG_DEFAULT;
  return Math.min(SHOP_CATALOG_CAP, Math.max(SHOP_PHOTO_FLOOR, base));
}

export function shopCatalogWasCapped(text = '') {
  return assessShopBuildAsk(text).oversize;
}

/**
 * Partner-facing honesty when the brief asked for dozens of unique AI mockups.
 */
export function shopCatalogScaleNote(text = '') {
  return assessShopBuildAsk(text).userCopy;
}

export function expandCatalogChip() {
  return {
    id: 'gap-expand-catalog',
    label: 'Expand catalog',
    value: `Add more named products to this shop catalog (keep under ${SHOP_CATALOG_CAP} total for now), each with its own real <img> photo, price, and Add to Cart. Do not promise unique AI-generated mockups at scale.`,
    priority: 94,
  };
}

/** Timeout / repair copy for shop-photo turns — plain language, next step. */
export function shopPhotoTurnFailureCopy({
  timedOut = false,
  seconds = 90,
  assessment = null,
} = {}) {
  const ask = assessment && typeof assessment === 'object'
    ? assessment
    : assessShopBuildAsk(typeof assessment === 'string' ? assessment : '');
  const target = ask?.oversize
    ? (ask.proposedCatalogSize || SHOP_INTAKE_CATALOG_SIZE)
    : SHOP_INTAKE_CATALOG_SIZE;
  if (timedOut) {
    return (
      `That shop-photo turn hit the ${Math.round(Number(seconds) || 90)}s limit before Preview was fixed. `
      + `What failed: the model did not finish writing loadable catalog photos in time. `
      + `What we’ll do: inject about ${target} working product photos into the shop now — tap Add real product photos, or send “Start with ${target}”.`
    );
  }
  return (
    `Shop photo repair did not finish. What failed: catalog images are still empty picture boxes. `
    + `What we’ll do: inject about ${target} working product photos into Preview now.`
  );
}
