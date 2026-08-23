/**
 * Review criteria for a desk that is neither a shop nor a calculator.
 *
 * The job card already carries what must still work. Each line is matched
 * against a closed list of things the running page can actually be asked, and
 * a line with no such question — or one the probe never managed to watch —
 * is reported as unverified. A criterion is never green unless the running
 * Preview said so.
 */

import { normalizeStudioJobCard } from './studio-job-card.js';

const MAX_JOB_CHECKS = 4;

const OBSERVABLE_CRITERIA = [
  {
    id: 'job-add-item',
    match: /\bitems?\b[^.]*\b(?:can|could|are|is)\b[^.]*\badd/i,
    fact: 'itemAdded',
    okLabel: 'A new item can be added on the running Preview',
    failLabel: 'Adding an item does nothing on the running Preview',
  },
  {
    id: 'job-controls',
    match: /\b(?:interactive )?(?:controls?|buttons?|inputs?)\b[^.]*\b(?:work|respond)/i,
    fact: 'controlResponded',
    okLabel: 'Controls on the running Preview respond',
    failLabel: 'Controls on the running Preview do not respond',
  },
  {
    id: 'job-runs',
    match: /\bpage\b[^.]*\b(?:runs|renders|loads)\b/i,
    fact: 'pageRendered',
    okLabel: 'The running Preview renders content',
    failLabel: 'The running Preview renders nothing',
  },
];

export function findObservableCriterion(mustWorkLine = '') {
  const text = String(mustWorkLine || '');
  if (!text.trim()) return null;
  return OBSERVABLE_CRITERIA.find((criterion) => criterion.match.test(text)) || null;
}

/**
 * A check row per must-work line. `state` is the honest part: 'ok' and 'fix'
 * both mean the running page answered, 'unverified' means nobody asked it.
 */
export function deriveJobChecks(job = null, live = null) {
  const card = normalizeStudioJobCard(job);
  if (!card || !card.mustWork.length) return [];
  const observations = live && typeof live === 'object' ? live : {};
  const checks = [];
  const usedIds = new Set();

  for (const line of card.mustWork.slice(0, MAX_JOB_CHECKS)) {
    const criterion = findObservableCriterion(line);
    if (!criterion) {
      checks.push({
        id: `job-unverified-${checks.length + 1}`,
        ok: false,
        state: 'unverified',
        label: `Not checked on Preview: ${line}`,
      });
      continue;
    }
    if (usedIds.has(criterion.id)) continue;
    usedIds.add(criterion.id);
    const observed = observations[criterion.fact];
    if (typeof observed !== 'boolean') {
      checks.push({
        id: criterion.id,
        ok: false,
        state: 'unverified',
        label: `Not checked on Preview yet: ${line}`,
      });
      continue;
    }
    checks.push({
      id: criterion.id,
      ok: observed,
      state: observed ? 'ok' : 'fix',
      label: observed ? criterion.okLabel : criterion.failLabel,
    });
  }
  return checks;
}

/** Only a check the page answered "no" to is a beat. Silence is not a failure. */
export function checkState(check) {
  if (!check) return 'unverified';
  if (check.state === 'unverified') return 'unverified';
  return check.ok === true ? 'ok' : 'fix';
}

export function failingChecks(checks = []) {
  return (Array.isArray(checks) ? checks : []).filter((check) => checkState(check) === 'fix');
}

export function unverifiedChecks(checks = []) {
  return (Array.isArray(checks) ? checks : []).filter((check) => checkState(check) === 'unverified');
}
