import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_DOORS,
  describeDoors,
  doorStateFor,
  doorsBlocking,
  pendingAskFor,
  pendingAskIsReady,
} from './capability-doors.js';

/**
 * The distinction this file protects: a shut door is not a wall.
 *
 * Both used to be `available: false`, so a capability the user could switch on
 * in two minutes and one that will never exist produced the same dead end. The
 * tests below hold both halves — a door must offer steps, and a wall must never
 * pretend to be a door, because sending somebody looking for a handle that is
 * not there is crueller than the dead end it replaced.
 */

test('a capability that is on is open, and blocks nothing', () => {
  assert.equal(doorStateFor('market_data', { enabled: { market_data: true } }), 'open');
  assert.deepEqual(doorsBlocking(['market_data'], { enabled: { market_data: true } }), []);
});

test('a capability that is off is a door, not a refusal', () => {
  assert.equal(doorStateFor('market_data'), 'closed');
  const doors = doorsBlocking(['market_data']);
  assert.equal(doors.length, 1);
  assert.ok(doors[0].steps.length >= 2, 'a door without steps is just a locked door');
  assert.ok(doors[0].verify, 'and the person must be able to check it themselves');
});

test('INVARIANT: a genuine no is never dressed as a door', () => {
  // unique_ai_mockups_at_scale times out or ships SVG fakes. Nothing the user
  // can switch on changes that, and offering steps would send them hunting for
  // a handle that does not exist.
  assert.equal(doorStateFor('unique_ai_mockups_at_scale'), 'walled');
  assert.deepEqual(doorsBlocking(['unique_ai_mockups_at_scale']), []);
  // Even claiming it is enabled cannot promote an undeclared capability.
  assert.equal(doorStateFor('unique_ai_mockups_at_scale', { enabled: { unique_ai_mockups_at_scale: true } }), 'walled');
  assert.equal(doorStateFor('a_capability_nobody_built'), 'walled');
});

test('the same door is asked for once, however many times a turn needs it', () => {
  const doors = doorsBlocking(['market_data', 'market_data', 'places_lookup']);
  assert.deepEqual(doors.map((d) => d.id), ['market_data', 'places_lookup']);
});

test('every declared door can actually be opened by the person reading it', () => {
  // A door whose steps name no concrete action, or that cannot be verified,
  // is a refusal wearing better clothes.
  for (const door of Object.values(CAPABILITY_DOORS)) {
    assert.ok(door.label && door.needs, door.id);
    assert.ok(door.steps.length >= 2, `${door.id} needs real steps`);
    assert.ok(door.verify.length > 20, `${door.id} needs a way to check it worked`);
    for (const step of door.steps) {
      assert.ok(step.length > 15, `${door.id}: "${step}" is not an instruction`);
    }
  }
});

// ------------------------------------------------------------------- copy ---

test('the message says what I can do, what is missing, and how to check', () => {
  const text = describeDoors(doorsBlocking(['market_data']), { ask: 'a currency converter' });
  assert.match(text, /I can build a currency converter/);
  assert.match(text, /needs a Supabase project/);
  assert.match(text, /^1\. /m, 'numbered steps a non-technical person can follow');
  assert.match(text, /You'll know it worked/);
  assert.match(text, /pick this up exactly where we left it/);
});

test('two doors are counted honestly rather than merged into one ask', () => {
  const text = describeDoors(doorsBlocking(['market_data', 'places_lookup']), { ask: 'a store finder' });
  assert.match(text, /I need 2 things switched on first/);
  assert.match(text, /Live market and currency data/);
  assert.match(text, /Real places and addresses/);
});

test('no doors, no message', () => {
  assert.equal(describeDoors([]), '');
});

// ----------------------------------------------------------------- resume ---

test('the ask is parked so it never has to be retyped', () => {
  // Opening a door takes minutes, a page reload and sometimes a redeploy. A
  // request that has to be retyped afterwards is a request that gets abandoned.
  const doors = doorsBlocking(['market_data']);
  const pending = pendingAskFor({ ask: 'convert 100 USD to INR', doors, turnId: 't1' });
  assert.equal(pending.ask, 'convert 100 USD to INR');
  assert.deepEqual(pending.waitingOn, ['market_data']);
});

test('INVARIANT: parked state never carries a credential', () => {
  // This outlives the turn and gets written where a later session can read it.
  const pending = pendingAskFor({ ask: 'convert 100 USD', doors: doorsBlocking(['market_data']) });
  assert.deepEqual(Object.keys(pending).sort(), ['ask', 'at', 'turnId', 'waitingOn']);
});

test('a parked ask resumes only once every door it waited on is open', () => {
  const pending = pendingAskFor({ ask: 'x', doors: doorsBlocking(['market_data', 'places_lookup']) });
  assert.equal(pendingAskIsReady(pending), false);
  assert.equal(pendingAskIsReady(pending, { enabled: { market_data: true } }), false, 'one of two is not ready');
  assert.equal(
    pendingAskIsReady(pending, { enabled: { market_data: true, places_lookup: true } }),
    true,
  );
});

test('nothing is parked when nothing was blocking', () => {
  assert.equal(pendingAskFor({ ask: 'build a page', doors: [] }), null);
  assert.equal(pendingAskFor({ ask: '', doors: doorsBlocking(['market_data']) }), null);
  assert.equal(pendingAskIsReady(null), false);
  assert.equal(pendingAskIsReady({ waitingOn: [] }), false);
});
