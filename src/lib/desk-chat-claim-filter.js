/**
 * Chat must not outrun Preview. A sentence that claims a control the packet
 * or probes have not confirmed is rewritten so the lie cannot be the last word.
 * Advisors never get this filter — they never get the desk packet.
 */

import { advisorBlocksPreviewBuild } from './build-intent.js';
import { findObservableCriterion } from './studio-desk-criteria.js';

const DENIAL = /\b(missing|not yet|not on|does not|doesn't|do not|don't|cannot|can't|still need|failed|broken|dead|nothing)\b/i;

const RULES = [
  {
    ids: ['cart', 'cart-click'],
    factMissing: (facts) => facts?.hasCart === false || facts?.bagIncremented === false,
    topic: /\badd to cart|shopping bag|cart drawer|cart totals|\bbag\b|check ?out\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live|increments?)\b/i,
    honest: 'Preview does not have a working Add to Cart yet.',
  },
  {
    ids: ['currency'],
    factMissing: (facts) => facts?.hasCurrency === false,
    topic: /\b(currency|multi-currency|currency switcher)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have a currency switcher yet.',
  },
  {
    ids: ['photos'],
    factMissing: (facts) => facts?.hasPhotos === false || facts?.hasDistinctPhotos === false,
    topic: /\b(product photos?|catalog (photos?|images?)|high-resolution|images? are (now |all )?ready)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live|overhauled)\b/i,
    honest: 'Preview does not have real product photos yet.',
  },
  {
    ids: ['calc-display'],
    factMissing: (facts) => facts?.hasCalculatorDisplay === false,
    topic: /\bcalculator display\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have a working calculator display yet.',
  },
  {
    ids: ['calc-key'],
    factMissing: (facts) => facts?.hasCalculatorKey === false,
    topic: /\b(calculator keys?|number buttons?)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have working calculator keys yet.',
  },
  {
    ids: ['job-add-item'],
    topic: /\b(items? can be added|adding an item|add control|add button)\b/i,
    ready: /\b(ready|working|can be added|works|done|is on|are on)\b/i,
    honest: 'Preview cannot add an item yet.',
  },
  {
    ids: ['job-controls'],
    topic: /\b(controls? (respond|work)|buttons? (respond|work))\b/i,
    ready: /\b(ready|working|respond|works|done)\b/i,
    honest: 'Preview controls do not respond yet.',
  },
];

function checkBlocksClaim(checks, id) {
  const check = (Array.isArray(checks) ? checks : []).find((row) => row && row.id === id);
  return Boolean(check && check.ok !== true);
}

function jobBlocksClaim(job, id) {
  const lines = Array.isArray(job?.mustWork) ? job.mustWork : [];
  return lines.some((line) => findObservableCriterion(line)?.id === id);
}

function activeRules(packet) {
  return RULES.filter((rule) => (
    rule.ids.some((id) => checkBlocksClaim(packet.checks, id)
      || (jobBlocksClaim(packet.job, id) && !packet.checks?.some((row) => row.id === id && row.ok === true)))
    || rule.factMissing?.(packet.facts) === true
  ));
}

function splitKeep(text) {
  const value = String(text || '');
  if (!value) return [];
  return value.match(/[^\n.!?]+(?:[.!?]+|\n+|$)/g) || [value];
}

function sentenceIsLie(sentence, rule) {
  const text = String(sentence || '');
  if (!rule.topic.test(text) || !rule.ready.test(text)) return false;
  return !DENIAL.test(text);
}

export function filterDeskChatClaims(text = '', packet = null, studioDomain = null) {
  const source = String(text || '');
  if (!source) return '';
  if (advisorBlocksPreviewBuild(studioDomain)) return source;
  if (!packet || typeof packet !== 'object') return source;
  const rules = activeRules(packet);
  if (!rules.length) return source;

  const used = new Set();
  const out = [];
  for (const part of splitKeep(source)) {
    const liars = rules.filter((rule) => sentenceIsLie(part, rule));
    if (!liars.length) {
      out.push(part);
      continue;
    }
    for (const rule of liars) {
      if (used.has(rule.honest)) continue;
      used.add(rule.honest);
      out.push(rule.honest);
    }
    if (/\n+$/.test(part)) out.push(part.match(/\n+$/)[0]);
  }
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function deskChatClaimWasFiltered(original, filtered) {
  return String(original || '') !== String(filtered || '');
}
