import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLATFORM_DAILY_TURNS,
  DEFAULT_USER_DAILY_TURNS,
  PLATFORM_TURN_KEY,
  describeResetIn,
  describeTurnBudget,
  isTurnBudgetExempt,
  platformDailyTurnBudget,
  turnBudgetVerdict,
  userDailyTurnBudget,
  userTurnKey,
} from './user-turn-budget.js';
import { readFileSync } from 'node:fs';

const ok = async () => ({ limited: false, hits: 1, resetsAt: null, unavailable: false });
const full = async () => ({ limited: true, hits: 999, resetsAt: null, unavailable: false });

test('an unset budget is a real number, not infinity', () => {
  assert.equal(userDailyTurnBudget({}), DEFAULT_USER_DAILY_TURNS);
  assert.equal(platformDailyTurnBudget({}), DEFAULT_PLATFORM_DAILY_TURNS);
  for (const bad of ['', '  ', '0', '-5', 'lots']) {
    assert.equal(userDailyTurnBudget({ USER_DAILY_TURN_BUDGET: bad }), DEFAULT_USER_DAILY_TURNS, bad);
    assert.equal(platformDailyTurnBudget({ PLATFORM_DAILY_TURN_BUDGET: bad }), DEFAULT_PLATFORM_DAILY_TURNS, bad);
  }
  assert.equal(userDailyTurnBudget({ USER_DAILY_TURN_BUDGET: '12' }), 12);
  assert.equal(platformDailyTurnBudget({ PLATFORM_DAILY_TURN_BUDGET: '400' }), 400);
});

test('one user cannot be the whole platform', () => {
  // The defect this module exists for: a single person draining a prepaid
  // balance in an afternoon. If one user's share equalled the platform total,
  // the per-user cap would bound nothing at all.
  assert.ok(DEFAULT_USER_DAILY_TURNS < DEFAULT_PLATFORM_DAILY_TURNS,
    'a per-user budget at or above the platform total is not a budget');
  assert.ok(DEFAULT_PLATFORM_DAILY_TURNS >= DEFAULT_USER_DAILY_TURNS * 2,
    'the platform must hold at least a couple of full user shares, or the first user closes the door on the rest');
});

test('the window is a day, on both counters', async () => {
  const asked: Array<{ key: string; limit: number; windowSeconds: number }> = [];
  await turnBudgetVerdict('user-1', {
    env: {},
    checkDurable: async (key, limit, windowSeconds) => {
      asked.push({ key, limit, windowSeconds });
      return { limited: false, hits: 1, resetsAt: null, unavailable: false };
    },
  });
  assert.equal(asked.length, 2, 'the platform total and this person\'s share');
  assert.deepEqual(asked.map((a) => a.windowSeconds), [86_400, 86_400]);
  assert.equal(asked[0].key, PLATFORM_TURN_KEY);
  assert.equal(asked[1].key, userTurnKey('user-1'));
  assert.equal(asked[0].limit, DEFAULT_PLATFORM_DAILY_TURNS);
  assert.equal(asked[1].limit, DEFAULT_USER_DAILY_TURNS);
});

test('each person gets their own counter', () => {
  assert.notEqual(userTurnKey('alice'), userTurnKey('bob'));
  assert.match(userTurnKey('alice'), /alice/);
  assert.notEqual(userTurnKey('alice'), PLATFORM_TURN_KEY);
});

test('a person over their share is refused; everyone else is not', async () => {
  const overFor = (who: string) => async (key: string) =>
    key === userTurnKey(who)
      ? { limited: true, hits: 99, resetsAt: null, unavailable: false }
      : { limited: false, hits: 1, resetsAt: null, unavailable: false };

  const alice = await turnBudgetVerdict('alice', { env: {}, checkDurable: overFor('alice') });
  assert.equal(alice.allowed, false);
  assert.equal(alice.exhausted, 'user');

  const bob = await turnBudgetVerdict('bob', { env: {}, checkDurable: overFor('alice') });
  assert.equal(bob.allowed, true, "one person's overrun must not close the door on everyone else");
});

test('the platform total is checked FIRST, and binds a caller with no identity', async () => {
  /*
   * An anonymous turn still spends the platform's money. Reached only through a
   * per-user counter, a caller with no resolvable sub would bypass every budget
   * here — which is the hole that makes a per-user cap feel safe and not be.
   */
  const asked: string[] = [];
  const v = await turnBudgetVerdict(null, {
    env: {},
    checkDurable: async (key) => {
      asked.push(key);
      return { limited: false, hits: 1, resetsAt: null, unavailable: false };
    },
  });
  assert.deepEqual(asked, [PLATFORM_TURN_KEY], 'no identity still costs the platform, and is still counted');
  assert.equal(v.allowed, true);

  const capped = await turnBudgetVerdict(null, { env: {}, checkDurable: full });
  assert.equal(capped.allowed, false, 'and an anonymous turn is refused once the platform total is spent');
  assert.equal(capped.exhausted, 'platform');
});

test('the platform total refuses before a user is even considered', async () => {
  const asked: string[] = [];
  const v = await turnBudgetVerdict('alice', {
    env: {},
    checkDurable: async (key) => {
      asked.push(key);
      return { limited: true, hits: 999, resetsAt: null, unavailable: false };
    },
  });
  assert.equal(v.exhausted, 'platform');
  assert.deepEqual(asked, [PLATFORM_TURN_KEY], "a spent platform must not also burn this person's share");
});

test('a durable store that is down bounds harder, it does not open the door', async () => {
  // Not a new policy: applyDurableCostBearingGuard already owns what a
  // cost-bearing route does when Supabase is unreachable.
  const unreachable = async () => ({ limited: false, hits: null, resetsAt: null, unavailable: true });
  // A sub unique to this run, because the in-memory fallback buckets are module
  // scope and a 24-hour window outlives the suite that trips them.
  const who = `outage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const env = { USER_DAILY_TURN_BUDGET: '3', PLATFORM_DAILY_TURN_BUDGET: '3000' };
  const first = await turnBudgetVerdict(who, { env, checkDurable: unreachable });
  assert.equal(first.allowed, true, 'the first turn still works');
  const second = await turnBudgetVerdict(who, { env, checkDurable: unreachable });
  assert.equal(second.allowed, false, 'an outage must not restore the full daily allowance');
  assert.equal(second.degraded, true, 'and it says which bound decided');
});

test('what a student is told is kind, true, and actionable', () => {
  /*
   * These are students on a borrowed budget, not operators reading a log. A
   * bare "quota exceeded" reads as the platform being broken, and the person
   * who hits it does not come back.
   */
  const inTwoHours = new Date(Date.now() + 2 * 3_600_000 + 3 * 60_000).toISOString();
  const mine = describeTurnBudget({ allowed: false, exhausted: 'user', userLimit: 30, platformLimit: 120, degraded: false, used: 30, remaining: 0, resetsAt: inTwoHours, exempt: false });
  assert.match(mine, /30 AI turns/, 'the number, so it is a fact and not a mystery');
  /*
   * "within 24 hours" was true and useless -- the same sentence one minute
   * before the reset and twenty-three hours before it. Someone deciding
   * whether to wait or give up for the day needs the duration.
   */
  assert.match(mine, /in 2h 3m/, 'when it comes back, exactly');
  assert.match(mine, /all come back at once/i, 'and that it returns whole, not a few at a time');

  /* No reset time from the store is a reason to say less, never to invent one. */
  const blind = describeTurnBudget({ allowed: false, exhausted: 'user', userLimit: 30, platformLimit: 120, degraded: false, used: 30, remaining: 0, resetsAt: null, exempt: false });
  assert.match(blind, /reset within 24 hours/i, 'the vaguer sentence survives for when the store said nothing');
  assert.doesNotMatch(blind, /\bin \d+[hm]/, 'and no duration is fabricated');
  assert.match(mine, /everything you have built is saved/i, 'that nothing is lost — the first fear');
  assert.match(mine, /your own API key/i, 'and the way out');
  assert.doesNotMatch(mine, /error|fail|denied|exceeded|forbidden/i, 'this is a budget, not a fault');

  const shared = describeTurnBudget({ allowed: false, exhausted: 'platform', userLimit: 30, platformLimit: 120, degraded: false, used: null, remaining: null, resetsAt: inTwoHours, exempt: false });
  assert.match(shared, /shared daily limit/i);
  assert.match(shared, /Nothing you did caused this/i, 'a shared limit must never read as the user\'s fault');
  assert.doesNotMatch(shared, /error|fail|denied|exceeded/i);

  assert.equal(describeTurnBudget({ allowed: true, exhausted: null, userLimit: 30, platformLimit: 120, degraded: false, used: 4, remaining: 26, resetsAt: inTwoHours, exempt: false }), '',
    'nothing to explain when nothing was held back');
});

test('WIRING: the chat turn asks the budget, before routing and only on platform keys', () => {
  /*
   * The failure this repo keeps finding is a cost control written, tested, and
   * called by nothing — user-paid-quota.ts is guarded correctly and, in
   * production today, never consulted at all.
   */
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /import \{ describeTurnBudget, turnBudgetVerdict \} from "\.\/user-turn-budget\.js";/);
  /*
   * Bounded, not adjacent. The call must sit INSIDE the platform-pays guard --
   * a budget consulted outside it would charge a BYOK turn against an
   * allowance it never spends -- but pinning it to the very next line made an
   * explanatory comment above it read as a broken contract.
   */
  assert.match(handler, /if \(usingServerOwnedModelAccess && !goldenCanary\) \{[\s\S]{0,800}?const budget = await turnBudgetVerdict\(/,
    'counted only when the platform is paying: a BYOK turn spends the user\'s own key and is exempt');
  /*
   * And the email must travel, or the exemption below can never fire for
   * anyone: a verdict asked with only a sub cannot know whose account it is.
   */
  assert.match(handler, /email: activeSessionUser\?\.email \|\| null/,
    'the exemption is keyed on the address, so the address has to reach the verdict');

  const gateAt = handler.indexOf('await turnBudgetVerdict(');
  const routeAt = handler.indexOf('await planInferenceRoutes(');
  assert.ok(gateAt > 0 && routeAt > 0);
  assert.ok(gateAt < routeAt,
    'the budget must be settled BEFORE routing, so it can never change which model a turn gets');
});


test('the countdown is a duration, and never a fabricated one', () => {
  /*
   * The window is FIXED, not rolling: hit_rate_limit floors now() to the
   * window size, so a 24h budget resets at midnight UTC and the whole
   * allowance returns at once. Telling someone it trickles back sends them to
   * retry every ten minutes for half a day; telling them a bare timestamp
   * makes them do timezone arithmetic while they are already annoyed.
   */
  const now = Date.parse('2026-09-08T10:00:00Z');
  const at = (iso: string) => describeResetIn(iso, now);

  assert.equal(at('2026-09-09T00:00:00Z'), 'in 14h');
  assert.equal(at('2026-09-08T12:03:00Z'), 'in 2h 3m');
  assert.equal(at('2026-09-08T10:12:00Z'), 'in 12m', 'under an hour is minutes, not "0h 12m"');

  /*
   * A reset that has passed, or is seconds away, must not render as "in 0m" --
   * which reads as a stuck clock at the exact moment the news is good.
   */
  assert.equal(at('2026-09-08T10:00:30Z'), 'shortly');
  assert.equal(at('2026-09-08T09:00:00Z'), 'shortly');

  /* Unknown is not zero. Nothing from the store means nothing on the screen. */
  assert.equal(at(''), null);
  assert.equal(describeResetIn(null, now), null);
  assert.equal(describeResetIn(undefined, now), null);
  assert.equal(at('not a date'), null);
});


test('[was-red] the owner is not locked out of a limit written to protect a shared key', () => {
  /*
   * The per-user budget exists so ONE pilot student cannot drain a shared
   * key. On 2026-09-08 it stopped the platform's owner on his own product,
   * mid-pilot, on borrowed money -- the one account that must always be able
   * to demo and debug.
   */
  const env = { TURN_BUDGET_EXEMPT_EMAILS: 'owner@example.com, Second.Owner@Example.COM' };
  assert.equal(isTurnBudgetExempt('owner@example.com', env), true);
  assert.equal(isTurnBudgetExempt('OWNER@EXAMPLE.COM', env), true, 'an address is not case sensitive');
  assert.equal(isTurnBudgetExempt('second.owner@example.com', env), true, 'and neither is the list');
  assert.equal(isTurnBudgetExempt('student@example.com', env), false);

  /*
   * Unset must exempt NOBODY. A blank list that matched a blank email would
   * lift the budget for every unauthenticated caller -- the protection
   * deleting itself on a deployment where someone forgot the variable.
   */
  assert.equal(isTurnBudgetExempt('owner@example.com', {}), false, 'no list means no exemptions');
  assert.equal(isTurnBudgetExempt('', env), false);
  assert.equal(isTurnBudgetExempt(null, env), false);
  assert.equal(isTurnBudgetExempt(undefined, { TURN_BUDGET_EXEMPT_EMAILS: '' }), false);
  assert.equal(isTurnBudgetExempt('', { TURN_BUDGET_EXEMPT_EMAILS: ' , ' }), false, 'an empty entry matches no one');
});

test('[was-red] an exempt account passes its own limit and is still stopped by the shared one', async () => {
  /*
   * The two budgets guard different things. The per-user one keeps a student
   * from draining a shared key; the PLATFORM total is the guard on the money
   * itself. An account that silently ignored the second could spend a whole
   * borrowed balance without anyone choosing to, so the exemption must not
   * reach it -- raising PLATFORM_DAILY_TURN_BUDGET is that decision, made on
   * purpose.
   */
  const env = { TURN_BUDGET_EXEMPT_EMAILS: 'owner@example.com', USER_DAILY_TURN_BUDGET: '2', PLATFORM_DAILY_TURN_BUDGET: '100' };
  const spentUser = async (key: string) => ({
    limited: key !== PLATFORM_TURN_KEY,
    hits: key === PLATFORM_TURN_KEY ? 5 : 9,
    resetsAt: '2026-09-09T00:00:00Z',
    unavailable: false,
  });

  const owner = await turnBudgetVerdict('owner-sub', { email: 'owner@example.com', env, checkDurable: spentUser });
  assert.equal(owner.allowed, true, 'the owner works past their own allowance');
  assert.equal(owner.exempt, true);
  assert.equal(owner.used, 9, 'and is still COUNTED — an owner who cannot see their spend drains the key quietly');

  const student = await turnBudgetVerdict('student-sub', { email: 'student@example.com', env, checkDurable: spentUser });
  assert.equal(student.allowed, false, 'everyone else is still held to it');
  assert.equal(student.exhausted, 'user');

  /* The shared ceiling stops the owner too. */
  const platformSpent = async () => ({ limited: true, hits: 500, resetsAt: '2026-09-09T00:00:00Z', unavailable: false });
  const capped = await turnBudgetVerdict('owner-sub', { email: 'owner@example.com', env, checkDurable: platformSpent });
  assert.equal(capped.allowed, false, 'the exemption must never reach the guard on the money');
  assert.equal(capped.exhausted, 'platform');
});
