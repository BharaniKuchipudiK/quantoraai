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
    unverified: 'Preview has not confirmed Add to Cart yet.',
  },
  {
    ids: ['currency'],
    factMissing: (facts) => facts?.hasCurrency === false,
    topic: /\b(currency|multi-currency|currency switcher)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have a currency switcher yet.',
    unverified: 'Preview has not confirmed a currency switcher yet.',
  },
  {
    ids: ['photos'],
    factMissing: (facts) => facts?.hasPhotos === false || facts?.hasDistinctPhotos === false,
    topic: /\b(product photos?|catalog (photos?|images?)|high-resolution|images? are (now |all )?ready)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live|overhauled)\b/i,
    honest: 'Preview does not have real product photos yet.',
    unverified: 'Preview has not confirmed real product photos yet.',
  },
  {
    ids: ['calc-display'],
    factMissing: (facts) => facts?.hasCalculatorDisplay === false,
    topic: /\bcalculator display\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have a working calculator display yet.',
    unverified: 'Preview has not confirmed a calculator display yet.',
  },
  {
    ids: ['calc-key'],
    factMissing: (facts) => facts?.hasCalculatorKey === false,
    topic: /\b(calculator keys?|number buttons?)\b/i,
    ready: /\b(ready|working|added|done|is on|are on|you can|now (has|have)|live)\b/i,
    honest: 'Preview does not have working calculator keys yet.',
    unverified: 'Preview has not confirmed calculator keys yet.',
  },
  {
    ids: ['calc-scientific'],
    factMissing: (facts) => facts?.hasScientificKeys === false,
    topic: /\b(scientific|sin\b|cos\b|tan\b|DEG|RAD)\b/i,
    ready: /\b(ready|working|added|updated|done|is on|are on|you can|now (has|have)|live|scientific)\b/i,
    honest: 'Preview does not show scientific keys yet — update the web entry (index.html), not only Python files.',
    unverified: 'Preview has not confirmed scientific keys yet.',
  },
  {
    ids: ['job-add-item'],
    topic: /\b(items? can be added|adding an item|add control|add button)\b/i,
    ready: /\b(ready|working|can be added|works|done|is on|are on)\b/i,
    honest: 'Preview cannot add an item yet.',
    unverified: 'Preview has not confirmed that an item can be added yet.',
  },
  {
    ids: ['job-controls'],
    topic: /\b(controls? (respond|work)|buttons? (respond|work))\b/i,
    ready: /\b(ready|working|respond|works|done)\b/i,
    honest: 'Preview controls do not respond yet.',
    unverified: 'Preview has not confirmed that controls respond yet.',
  },
];

function jobImplies(job, id) {
  const lines = Array.isArray(job?.mustWork) ? job.mustWork : [];
  return lines.some((line) => findObservableCriterion(line)?.id === id);
}

/** `fix` is a negative fact. `unverified` is absence of evidence, not a denial. */
function ruleBlock(packet, rule, { previewWarming = false } = {}) {
  // Missing desk packet = no live proof. Control claims must not pass through.
  if (!packet || typeof packet !== 'object') return 'unverified';
  let failed = rule.factMissing?.(packet.facts) === true;
  let unverified = false;
  for (const id of rule.ids) {
    const check = (Array.isArray(packet.checks) ? packet.checks : []).find((row) => row && row.id === id);
    if (check?.ok === true) continue;
    if (check?.state === 'unverified') {
      unverified = true;
      continue;
    }
    if (check && check.ok !== true) {
      failed = true;
      continue;
    }
    if (!check && jobImplies(packet.job, id)) unverified = true;
  }
  if (failed) return 'fix';
  if (unverified) return 'unverified';
  // Shell still warming: even a green check is not enough to leave ready/done claims intact.
  if (previewWarming) return 'unverified';
  return '';
}

/*
 * Split into sentences WITHOUT losing a character.
 *
 * THE DEFECT. The leading `[^\n.!?]+` was required and cannot match a newline,
 * so after a sentence ended in '.', the following '\n\n' matched nothing — and
 * String.match(/g) silently drops what it does not match. out.join('') then
 * glued the paragraphs together, rendering:
 *
 *   "...wired them into the nav.Nav clicking and smooth scroll still work..."
 *   "...for a consulting business.Generated files remain on the Coding desk"
 *
 * Both were read from a user's screenshot on 2026-09-04. Every paragraph break
 * in every coding-desk reply was destroyed whenever any rule was active — which
 * includes the common case of an absent desk packet, where ruleBlock() returns
 * 'unverified' for all eight rules.
 *
 * A markdown newline would have rendered as a SPACE. These had none, which is
 * what says the character was deleted rather than collapsed.
 *
 * THE RULE. Every alternative must be reachable for every character, so the
 * split is total: text runs, punctuation runs, and newline runs each have a
 * branch. splitKeep(x).join('') === x is asserted over a corpus in the tests;
 * a split that can drop input is the class, not just this one lost newline.
 */
function splitKeep(text) {
  const value = String(text || '');
  if (!value) return [];
  return value.match(/[^\n.!?]+(?:[.!?]+|\n+|$)|[.!?]+|\n+/g) || [value];
}

function clausesOf(sentence) {
  return String(sentence || '').split(/\s*(?:\bbut\b|\bhowever\b|;)\s*/i);
}

function sentenceIsLie(sentence, rule) {
  const text = String(sentence || '');
  if (!rule.topic.test(text)) return false;
  return clausesOf(text).some((clause) => rule.ready.test(clause) && !DENIAL.test(clause));
}

function wording(rule, level) {
  return level === 'unverified' ? (rule.unverified || rule.honest) : rule.honest;
}

/**
 * @param {string} text
 * @param {object|null} packet desk context; null denies control claims (not pass-through)
 * @param {string|null} studioDomain
 * @param {{ previewWarming?: boolean }} [options] when Preview shell is not past embedReady
 */
export function filterDeskChatClaims(text = '', packet = null, studioDomain = null, options = {}) {
  const source = String(text || '');
  if (!source) return '';
  if (advisorBlocksPreviewBuild(studioDomain)) return source;
  const previewWarming = options?.previewWarming === true;
  const active = RULES
    .map((rule) => ({ rule, level: ruleBlock(packet, rule, { previewWarming }) }))
    .filter((row) => row.level);
  if (!active.length) return source;

  const used = new Set();
  const out = [];
  for (const part of splitKeep(source)) {
    const liars = active.filter((row) => sentenceIsLie(part, row.rule));
    if (!liars.length) {
      out.push(part);
      continue;
    }
    for (const row of liars) {
      const line = wording(row.rule, row.level);
      if (used.has(line)) continue;
      used.add(line);
      out.push(line);
    }
    if (/\n+$/.test(part)) out.push(part.match(/\n+$/)[0]);
  }
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export function deskChatClaimWasFiltered(original, filtered) {
  return String(original || '') !== String(filtered || '');
}
