/**
 * Premium escalation must be decided by budget, and must never be blocked by
 * ignorance.
 *
 * THE DEFECT. `allowPaid: Boolean(getClientSecret('openrouter'))` — is a key
 * present. Not whether this mission had any premium reserve, not whether it had
 * already spent it. The Resource & Budget Governor answers exactly that and was
 * called by nothing (Phase 0 re-audit, §8).
 *
 * THE HAZARD THIS FILE GUARDS AGAINST. The obvious fix — refuse when the budget
 * is unreadable — would recreate the worst bug of this whole spine: a build that
 * does not run because some bookkeeping layer could not answer. #516 removed
 * that when a spent TURN budget was sealing whole MISSIONS. Every "unknown" case
 * below must resolve to allowed, and each is asserted separately so a future
 * refactor cannot collapse them into one silent `return false`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { missionMayAffordPremium, resolveAllowPaid } from './premium-escalation.js';

const withPremium = (premiumEscalationRemaining) => ({
  runId: 'run-1',
  budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining },
});

test('[was-red] a spent premium reserve refuses, even with a credential', () => {
  assert.equal(missionMayAffordPremium(withPremium(0)), false);
  assert.equal(resolveAllowPaid({ hasPaidCredential: true, run: withPremium(0) }), false);
});

test('a reserve with units left allows', () => {
  assert.equal(resolveAllowPaid({ hasPaidCredential: true, run: withPremium(5) }), true);
  assert.equal(resolveAllowPaid({ hasPaidCredential: true, run: withPremium(1) }), true);
});

test('no credential still refuses', () => {
  assert.equal(resolveAllowPaid({ hasPaidCredential: false, run: withPremium(5) }), false);
});

test('[was-red] every unreadable budget FAILS OPEN', () => {
  /*
   * Each of these is a different way of not knowing, and every one of them must
   * allow the build to run. This is the assertion that stops the fix becoming
   * the bug it replaced.
   */
  const unknowns = [
    ['no run at all (durable store unconfigured, or not booted yet)', null],
    ['undefined run', undefined],
    ['a run with no budget object', { runId: 'run-1' }],
    ['an unmetered lane — null means unlimited, same as the governor', withPremium(null)],
    ['a budget field that never arrived', withPremium(undefined)],
    ['a corrupt, non-numeric budget', withPremium('lots')],
  ];
  for (const [why, run] of unknowns) {
    assert.equal(missionMayAffordPremium(run), true, `must allow when: ${why}`);
    assert.equal(
      resolveAllowPaid({ hasPaidCredential: true, run }),
      true,
      `a build must not be blocked by an unreadable budget — ${why}`,
    );
  }
});

test('negative units are treated as spent, not as unknown', () => {
  assert.equal(missionMayAffordPremium(withPremium(-1)), false, 'below zero is still exhausted');
});

test('[was-red] the hook asks the reserve, not just the credential', () => {
  /*
   * A unit cannot see a 5,000-line hook revert to the credential check. The old
   * expression is precisely the defect, so its absence is the assertion — and
   * both call sites must go through the resolved value, since the fallback
   * ranker escalates too.
   */
  const hook = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    hook,
    /allowPaid: Boolean\(getClientSecret\('openrouter'\)\)/,
    'allowPaid must not go back to asking only whether a credential exists',
  );
  assert.match(hook, /resolveAllowPaid\(\{/, 'the turn must resolve allowPaid from the mission');
  assert.equal(
    (hook.match(/allowPaid: turnAllowPaid,/g) || []).length,
    2,
    'both the resolver and the fallback ranker must see the same verdict',
  );
});

test('[was-red] the debit charges only for an engine that actually starts, and only a paid one', () => {
  /*
   * Charging at selection would bill for engines that never ran — a reserve that
   * lies in the expensive direction. Charging for a free engine would drain a
   * premium budget that was never used.
   */
  const hook = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(hook, /qirTurn\.chargePremium\(\)/, 'the premium reserve must actually be debited');
  assert.match(
    hook,
    /!isFreeReady\(startingEngine\)/,
    'only a paid engine may be charged to the premium reserve',
  );

  const journal = fs.readFileSync(new URL('./qir-turn-journal.js', import.meta.url), 'utf8');
  const charge = journal.slice(journal.indexOf('chargePremium'));
  assert.match(
    charge.slice(0, charge.indexOf('\n    },')),
    /return true;[\s\S]*catch[\s\S]*return true;/,
    'chargePremium must resolve true when the governor cannot answer, never block the turn',
  );
});

test('paid detection has one authority', () => {
  /*
   * The resolver and the debit must agree about which engines are paid. A second
   * definition would drift, and the two would disagree about what to charge for.
   */
  const shared = fs.readFileSync(new URL('../../shared/coding-desk-auto-model.js', import.meta.url), 'utf8');
  assert.match(shared, /export function isFreeReady/, 'the one definition must be the exported one');
  const hook = fs.readFileSync(new URL('../hooks/useChatStream.js', import.meta.url), 'utf8');
  assert.match(
    hook,
    /import \{ isFreeReady \} from '\.\.\/\.\.\/shared\/coding-desk-auto-model\.js'/,
    'the debit must import that definition rather than restate it',
  );
});
