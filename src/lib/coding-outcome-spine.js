/**
 * Coding Desk Outcome Spine — one partner voice for every failed coding turn.
 *
 * Contract: never dump a raw gateway string and walk away.
 * Always: what failed → what we will do → optional Agree chips.
 */

import { SHOP_INTAKE_CATALOG_SIZE, shopPhotoTurnFailureCopy } from './shop-catalog-scale.js';

/**
 * @typedef {{
 *   kind: 'timeout' | 'no-preview' | 'provider-dead' | 'stream-ended' | 'stopped',
 *   text: string,
 *   isError: boolean,
 *   continueSet: { items: Array<{ id: string, label: string, value: string }> } | null,
 * }} CodingTurnOutcome
 */

function shopChips(shopIntakeAsk) {
  if (!shopIntakeAsk?.oversize || !Array.isArray(shopIntakeAsk.chips)) return null;
  return {
    items: shopIntakeAsk.chips.map((chip) => ({
      id: chip.id,
      label: chip.label,
      value: chip.value,
    })),
  };
}

/**
 * Resolve the final user-facing outcome when a coding turn cannot deliver Preview.
 */
export function resolveCodingTurnOutcome({
  kind,
  turnDeadlineSec = 90,
  errorMessage = '',
  shopIntakeAsk = null,
  isShopPhotoTurn = false,
} = {}) {
  if (kind === 'stopped') {
    return {
      kind,
      text: 'Stopped. Nothing further will run on this turn — say when to continue.',
      isError: true,
      continueSet: null,
    };
  }

  if (kind === 'timeout') {
    if (shopIntakeAsk?.oversize || isShopPhotoTurn) {
      return {
        kind,
        text: shopPhotoTurnFailureCopy({
          timedOut: true,
          seconds: turnDeadlineSec,
          assessment: shopIntakeAsk,
        }),
        isError: true,
        continueSet: shopChips(shopIntakeAsk),
      };
    }
    return {
      kind,
      text: (
        `That turn hit the ${Math.round(turnDeadlineSec)}s limit before Preview had a runnable page.\n\n`
        + `**What failed:** the model did not finish writing files in time.\n`
        + `**What we’ll do:** retry a smaller, concrete slice — one working page first — instead of sitting on a dead spinner.`
      ),
      isError: true,
      continueSet: {
        items: [{
          id: 'outcome-retry-smaller',
          label: 'Retry a smaller build',
          value: (
            'Retry with a smaller scope: one working HTML page that runs in Preview now. '
            + 'Do not expand scope. Ship files, not a chat-only plan.'
          ),
          priority: 110,
        }],
      },
    };
  }

  if (kind === 'no-preview') {
    return {
      kind,
      text: (
        `Preview cannot run — that turn produced a chat plan with no runnable files.\n\n`
        + `**What failed:** Coding Desk needs HTML/CSS/JS (or a React VFS) on the desk, not a description.\n`
        + `**What we’ll do:** rebuild once into a complete page you can open in Preview.`
      ),
      isError: true,
      continueSet: {
        items: [{
          id: 'outcome-rebuild-page',
          label: 'Rebuild a runnable page',
          value: (
            'Rebuild now as a complete, self-contained HTML page that runs in Quantora Preview. '
            + 'Include real structure and working UI. Do not answer with a plan-only chat message.'
          ),
          priority: 110,
        }],
      },
    };
  }

  if (kind === 'provider-dead' || kind === 'stream-ended') {
    const detail = String(errorMessage || '').trim();
    const overloaded = /overload|429|503|high demand|capacity/i.test(detail);
    return {
      kind,
      text: (
        (overloaded
          ? `The model route died under load before we got a usable Preview.\n\n`
          : `The connection to the model died before Preview was ready.\n\n`)
        + `**What failed:** ${detail || 'the AI gateway closed the stream without a runnable result.'}\n`
        + `**What we’ll do:** retry once on a fallback engine, or shrink the job `
        + `(about ${SHOP_INTAKE_CATALOG_SIZE} catalog photos if this is a shop) — not another silent retry loop.`
      ),
      isError: true,
      continueSet: shopIntakeAsk?.oversize
        ? shopChips(shopIntakeAsk)
        : {
          items: [{
            id: 'outcome-retry-fallback',
            label: 'Retry with fallback',
            value: 'Retry this same job on the next available model. Keep scope small enough to finish in one turn.',
            priority: 108,
          }],
        },
    };
  }

  return {
    kind: kind || 'provider-dead',
    text: `That turn did not finish.\n\n**What we’ll do:** retry, or tell me a smaller outcome to ship first.`,
    isError: true,
    continueSet: null,
  };
}
