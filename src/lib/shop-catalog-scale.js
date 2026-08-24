/**
 * Coding Desk Preview is a web shop, not an image studio.
 * Cap catalog size honestly and never treat empty gold frames as success.
 */

export const SHOP_CATALOG_CAP = 24;
export const SHOP_CATALOG_DEFAULT = 12;
export const SHOP_PHOTO_FLOOR = 6;

/** User asked for N unique designs / photos / SKUs in one turn. */
export function requestedShopCatalogSize(text = '') {
  const raw = String(text || '');
  const match = raw.match(
    /\b(\d{2,3})\s*(?:unique\s+)?(?:design(?:s|ed)?|products?|items?|skus?|photos?|images?|mockups?|pieces?)\b/i,
  );
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function shopCatalogTargetSize(text = '', existingCount = 0) {
  const asked = requestedShopCatalogSize(text);
  const base = asked || existingCount || SHOP_CATALOG_DEFAULT;
  return Math.min(SHOP_CATALOG_CAP, Math.max(SHOP_PHOTO_FLOOR, base));
}

export function shopCatalogWasCapped(text = '') {
  const asked = requestedShopCatalogSize(text);
  return asked > SHOP_CATALOG_CAP;
}

/**
 * Partner-facing honesty when the brief asked for dozens of unique AI mockups.
 */
export function shopCatalogScaleNote(text = '') {
  const asked = requestedShopCatalogSize(text);
  if (asked <= SHOP_CATALOG_CAP) return '';
  return (
    `Coding Desk ships a working shop with up to ${SHOP_CATALOG_CAP} catalog photos now — `
    + `not ${asked} unique AI merchandise mockups in one turn. `
    + `Tap Expand catalog when you want more products on the same shop.`
  );
}

export function expandCatalogChip() {
  return {
    id: 'gap-expand-catalog',
    label: 'Expand catalog',
    value: `Add more named products to this shop catalog (keep under ${SHOP_CATALOG_CAP} total for now), each with its own real <img> photo, price, and Add to Cart. Do not promise unique AI-generated mockups at scale.`,
    priority: 94,
  };
}
