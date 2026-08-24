/**
 * Senior Partner Control: interrupt before we spend a model turn on a lie.
 * Soft gate — propose the sane plan, wait for agree, then act.
 */

import {
  SHOP_INTAKE_CATALOG_SIZE,
  assessShopBuildAsk,
  expandShopIntakeAccept,
  isShopIntakeAcceptShorthand,
} from './shop-catalog-scale.js';

/**
 * @typedef {{
 *   kind: string,
 *   blockModel: boolean,
 *   reply: string,
 *   chips: Array<{ id: string, label: string, value: string, priority?: number }>,
 *   assessment?: object,
 * }} PartnerInterrupt
 */

/**
 * Build the human partner reply for an oversize shop photo ask.
 * Tone: senior engineer who refuses to waste the user's turn.
 */
export function buildShopOversizePartnerReply(assessment) {
  const asked = Number(assessment?.userAsked || assessment?.imageAskCount) || 0;
  const target = Number(assessment?.proposedCatalogSize) || SHOP_INTAKE_CATALOG_SIZE;
  return (
    `Hold on — **${asked} unique product photos in one Coding Desk turn** isn't a plan, it's a timeout. `
    + `Coding Desk Preview is a web shop, not an image factory. If I pretend otherwise you'll get empty boxes, SVG fakes, or a two-minute “hang tight.”\n\n`
    + `**Proposal:** build this shop with **about ${target} real catalog photos**, prices, and Add to Cart now. `
    + `You can upload more images or expand the catalog after Preview is actually running.\n\n`
    + `Agree? Tap **Start with ${target}**, or tell me a different number (max about 24 for one turn).`
  );
}

/**
 * Decide whether to interrupt before calling the model.
 * Accepts ("start with 10") never interrupt — they already agreed.
 *
 * @returns {PartnerInterrupt | null}
 */
export function assessPartnerInterrupt({
  message = '',
  priorUserMessages = [],
} = {}) {
  const raw = String(message || '').trim();
  if (!raw) return null;

  if (isShopIntakeAcceptShorthand(raw) || expandShopIntakeAccept(raw, priorUserMessages).expanded) {
    return null;
  }

  // Chip value that already encodes the smaller catalog — proceed.
  if (/\babout\s+\d{1,2}\s+working\s+catalog\s+photos\b/i.test(raw)
    && /\bnot\s+\d{2,3}\s+unique\b/i.test(raw)) {
    return null;
  }

  const assessment = assessShopBuildAsk(raw);
  if (!assessment.oversize) return null;

  const reply = buildShopOversizePartnerReply(assessment);
  const chips = (assessment.chips || []).map((chip) => (
    chip.id === 'shop-intake-start-10'
      ? { ...chip, label: `Agree — start with ${assessment.proposedCatalogSize || SHOP_INTAKE_CATALOG_SIZE}` }
      : chip
  ));

  return {
    kind: 'shop-catalog-oversize',
    blockModel: true,
    reply,
    chips,
    assessment,
  };
}

/**
 * Human status when a provider is overloaded / rate-limited mid-turn.
 * Prefer switching with an explanation over silent 2/10 spin.
 */
export function partnerProviderPressureCopy({
  attempt = 1,
  maxAttempts = 3,
  nextModelLabel = '',
  reason = 'overloaded',
} = {}) {
  const next = String(nextModelLabel || '').trim();
  if (reason === 'overloaded' || reason === '429' || reason === '503') {
    if (next) {
      return (
        `The model is overloaded right now (${attempt}/${maxAttempts}). `
        + `I'm switching to ${next} so we don't sit here retrying forever — same job, different engine.`
      );
    }
    return (
      `The model is overloaded (${attempt}/${maxAttempts}). `
      + `I'll retry once more, then stop and tell you what we can still do without waiting on a dead provider.`
    );
  }
  if (next) {
    return `That route failed (${attempt}/${maxAttempts}). Switching to ${next}.`;
  }
  return `That route failed (${attempt}/${maxAttempts}). Retrying with a fallback…`;
}
