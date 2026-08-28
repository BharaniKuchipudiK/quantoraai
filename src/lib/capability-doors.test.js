import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_DOORS,
  describeDoors,
  doorStateFor,
  doorsBlocking,
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
  assert.equal(doorStateFor('market_prices', { enabled: { market_prices: true } }), 'open');
  assert.deepEqual(doorsBlocking(['market_prices'], { enabled: { market_prices: true } }), []);
});

test('a capability that is off is a door, not a refusal', () => {
  assert.equal(doorStateFor('market_prices'), 'closed');
  const doors = doorsBlocking(['market_prices']);
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
  const doors = doorsBlocking(['market_prices', 'market_prices', 'places_lookup']);
  assert.deepEqual(doors.map((d) => d.id), ['market_prices', 'places_lookup']);
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
  const text = describeDoors(doorsBlocking(['market_prices']), { ask: 'a stock tracker' });
  assert.match(text, /I can build a stock tracker/);
  assert.match(text, /needs a Supabase project/);
  assert.match(text, /^1\. /m, 'numbered steps a non-technical person can follow');
  assert.match(text, /You'll know it worked/);
  assert.match(text, /ask me again and I'll build it/);
});

test('two doors are counted honestly rather than merged into one ask', () => {
  const text = describeDoors(doorsBlocking(['market_prices', 'places_lookup']), { ask: 'a store finder' });
  assert.match(text, /I need 2 things switched on first/);
  assert.match(text, /Stock prices and market history/);
  assert.match(text, /Real places and addresses/);
});

test('no doors, no message', () => {
  assert.equal(describeDoors([]), '');
});

/*
 * The parked-ask tests are gone with the code they covered. They asserted that
 * an ask was captured for a resume that nothing performed: no writer, no reader,
 * and a promise in the copy that no code kept. A green test over an unkept
 * promise is worse than no test, because it reads as proof.
 */

test('INVARIANT: the copy promises only what the code does', () => {
  const text = describeDoors(doorsBlocking(['market_prices']), { ask: 'a stock tracker' });
  assert.match(text, /ask me again and I'll build it/);
  assert.doesNotMatch(text, /pick this up|won't have to ask again/, 'no resume is performed, so none is promised');
});

test('INVARIANT: a door names only what the platform can actually accept', () => {
  // The Vault renders two inputs and byokRequestHeaders forwards two headers.
  // Naming a third provider sends somebody to a form that cannot take their key.
  const vault = CAPABILITY_DOORS.own_provider_key;
  assert.match(vault.needs, /Gemini or OpenRouter/);
  for (const absent of ['Anthropic', 'OpenAI', 'Claude']) {
    assert.ok(!JSON.stringify(vault).includes(absent), `${absent} is not accepted by the Vault`);
  }
});

test('INVARIANT: the privacy line describes who really handles the key', () => {
  // byokRequestHeaders attaches the key to a request to Quantora's /api/chat,
  // which reads it before calling the provider. Saying it goes nowhere but the
  // provider would misdescribe who handles a secret.
  const steps = CAPABILITY_DOORS.own_provider_key.steps.join(' ');
  assert.match(steps, /through Quantora/);
  assert.ok(!/never sent anywhere but the provider/.test(steps));
});

test('currency conversion is not behind a door it does not need', () => {
  // FX is answered live from the keyless ECB feed and needs no store at all.
  // A door telling somebody to configure Supabase first would be asking for
  // work the deployment does not require.
  const ids = Object.keys(CAPABILITY_DOORS);
  assert.ok(!ids.includes('market_data'), 'the old currency-gated door is gone');
  assert.match(CAPABILITY_DOORS.market_prices.label, /Stock prices/);
  assert.ok(!/currency|conversion/i.test(CAPABILITY_DOORS.market_prices.label));
});
