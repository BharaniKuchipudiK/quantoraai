import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLATFORM_DAILY_TURNS,
  DEFAULT_USER_DAILY_TURNS,
  PLATFORM_TURN_KEY,
  describeTurnBudget,
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
  const mine = describeTurnBudget({ allowed: false, exhausted: 'user', userLimit: 30, platformLimit: 120, degraded: false });
  assert.match(mine, /30 AI turns/, 'the number, so it is a fact and not a mystery');
  assert.match(mine, /reset within 24 hours/i, 'that it comes back');
  assert.match(mine, /everything you have built is saved/i, 'that nothing is lost — the first fear');
  assert.match(mine, /your own API key/i, 'and the way out');
  assert.doesNotMatch(mine, /error|fail|denied|exceeded|forbidden/i, 'this is a budget, not a fault');

  const shared = describeTurnBudget({ allowed: false, exhausted: 'platform', userLimit: 30, platformLimit: 120, degraded: false });
  assert.match(shared, /shared daily limit/i);
  assert.match(shared, /Nothing you did caused this/i, 'a shared limit must never read as the user\'s fault');
  assert.doesNotMatch(shared, /error|fail|denied|exceeded/i);

  assert.equal(describeTurnBudget({ allowed: true, exhausted: null, userLimit: 30, platformLimit: 120, degraded: false }), '',
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
  assert.match(handler, /if \(usingServerOwnedModelAccess && !goldenCanary\) \{\s*\n\s*const budget = await turnBudgetVerdict\(/,
    'counted only when the platform is paying: a BYOK turn spends the user\'s own key and is exempt');

  const gateAt = handler.indexOf('await turnBudgetVerdict(');
  const routeAt = handler.indexOf('await planInferenceRoutes(');
  assert.ok(gateAt > 0 && routeAt > 0);
  assert.ok(gateAt < routeAt,
    'the budget must be settled BEFORE routing, so it can never change which model a turn gets');
});
