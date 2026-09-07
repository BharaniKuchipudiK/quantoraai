import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLACES_DAILY_REQUESTS,
  MAX_REQUESTS_PER_LOOKUP,
  PLACES_DAILY_KEY,
  describePlacesDailyCap,
  isPlacesBackedTool,
  placesDailyLookupAllowance,
  placesDailyRequestCeiling,
  placesDailyCapVerdict,
} from './places-daily-cap.js';
import { PHOTO_LIMIT } from './places-photos.js';
import { resetRateLimitBuckets } from './rate-limit.js';
import { executeToolCall } from './agent-tools.js';

const under = async () => ({ limited: false, hits: 1, resetsAt: null, unavailable: false });
const over = async () => ({ limited: true, hits: 999, resetsAt: '2026-09-08T00:00:00Z', unavailable: false });

test('an unset ceiling is a real number, not infinity', () => {
  assert.equal(placesDailyRequestCeiling({}), DEFAULT_PLACES_DAILY_REQUESTS);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '' }), DEFAULT_PLACES_DAILY_REQUESTS);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '   ' }), DEFAULT_PLACES_DAILY_REQUESTS);
  // "0" meaning unlimited would be the trap this file exists to close.
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '0' }), DEFAULT_PLACES_DAILY_REQUESTS);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '-40' }), DEFAULT_PLACES_DAILY_REQUESTS);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: 'plenty' }), DEFAULT_PLACES_DAILY_REQUESTS);
  assert.ok(DEFAULT_PLACES_DAILY_REQUESTS > 0, 'a default of zero would refuse every lookup, not bound them');
});

test('an operator who sets a ceiling gets exactly that ceiling', () => {
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '40' }), 40);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: ' 1000 ' }), 1000);
  assert.equal(placesDailyRequestCeiling({ PLACES_DAILY_REQUEST_CEILING: '12.9' }), 12, 'a fraction of a call is not a call');
});

test('the window asked for is a DAY — which is the entire point of this module', async () => {
  /*
   * A per-minute limit already exists on the chat turn and bounds how FAST
   * money leaves. It never bounds how much. If this asked for a 60-second
   * window it would duplicate the limiter above it and cap nothing new.
   */
  const asked: Array<{ key: string; limit: number; windowSeconds: number }> = [];
  await placesDailyCapVerdict({
    env: { PLACES_DAILY_REQUEST_CEILING: '250' },
    checkDurable: async (key, limit, windowSeconds) => {
      asked.push({ key, limit, windowSeconds });
      return { limited: false, hits: 1, resetsAt: null, unavailable: false };
    },
  });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].windowSeconds, 86_400, 'a day, not a minute');
  assert.equal(asked[0].limit, 250 / MAX_REQUESTS_PER_LOOKUP, 'the limiter counts lookups; the ceiling is in requests');
  assert.equal(asked[0].key, PLACES_DAILY_KEY);
});

test('the counter is platform-wide, not per user', () => {
  // This is the platform's Google bill. Sharing it out per person would bound
  // each share and leave the total — the number that gets charged — unbounded.
  assert.equal(PLACES_DAILY_KEY, 'places:day');
  assert.doesNotMatch(PLACES_DAILY_KEY, /\$\{|sub|user|ip/, 'no per-caller component');
});

test('under the ceiling passes, at the ceiling refuses', async () => {
  const below = await placesDailyCapVerdict({ env: {}, checkDurable: under });
  assert.equal(below.reached, false);
  assert.equal(below.degraded, false);

  const above = await placesDailyCapVerdict({ env: {}, checkDurable: over });
  assert.equal(above.reached, true);
  assert.equal(above.ceiling, DEFAULT_PLACES_DAILY_REQUESTS);
  assert.equal(above.lookups, placesDailyLookupAllowance({}));
});

test('a durable store that is down bounds harder, it does not open the door', async () => {
  /*
   * Not a new policy. applyDurableCostBearingGuard already owns "what happens
   * to a paid route when Supabase is down" and answers it with a stricter
   * per-instance burst. This asserts we inherited that answer rather than
   * forking a second one that would drift from it.
   */
  resetRateLimitBuckets();
  const unreachable = async () => ({ limited: false, hits: null, resetsAt: null, unavailable: true });
  // 15 requests buys 3 lookups; the degraded bound is a third of that: 1.
  const env = { PLACES_DAILY_REQUEST_CEILING: String(3 * MAX_REQUESTS_PER_LOOKUP) };
  const first = await placesDailyCapVerdict({ env, checkDurable: unreachable });
  assert.equal(first.reached, false, 'the first call through still works');
  const second = await placesDailyCapVerdict({ env, checkDurable: unreachable });
  assert.equal(second.reached, true, 'an outage must not restore the full daily allowance');
  assert.equal(second.degraded, true, 'and it says which bound decided');
  resetRateLimitBuckets();
});

test('only the tools Google actually charges for are covered', () => {
  // Precision, per the rule that a gate firing on ambiguous evidence is the one
  // muted next: flights go to Duffel and are not on the Google bill at all.
  assert.equal(isPlacesBackedTool('search_hotels'), true);
  assert.equal(isPlacesBackedTool('search_attractions'), true);
  assert.equal(isPlacesBackedTool('get_places_routing'), true);
  assert.equal(isPlacesBackedTool('search_flights'), false, 'Duffel is not on this bill');
  assert.equal(isPlacesBackedTool('web_search'), false);
  assert.equal(isPlacesBackedTool(undefined), false);
  assert.equal(isPlacesBackedTool(null), false);
});

test('the refusal names the number, the variable, and its own scope', () => {
  /*
   * A silent failure here reads as "the travel desk is broken" and sends
   * somebody debugging an API key that is working perfectly. Rule 8 turned on
   * this gate's own copy: it is not verified until the words are read.
   */
  const note = describePlacesDailyCap({ reached: true, ceiling: 250, lookups: 50, degraded: false });
  assert.match(note, /250 Google Places requests/);
  assert.match(note, /50 lookups/, 'both units, because the operator thinks in one and Google bills the other');
  assert.match(note, /PLACES_DAILY_REQUEST_CEILING/, 'the operator is told which knob raises it');
  assert.match(note, /resets within 24 hours/i, 'and that waiting also works');
  assert.match(note, /live place lookups only/i, 'and that the rest of the desk is fine');
  assert.doesNotMatch(note, /error|failed|broken/i, 'this is a decision, not a fault');

  const degraded = describePlacesDailyCap({ reached: true, ceiling: 250, lookups: 50, degraded: true });
  assert.match(degraded, /stricter fallback bound/, 'a degraded verdict says so rather than implying a real count');
});

test('WIRING: a Places-backed tool is actually refused when the ceiling is reached', async () => {
  /*
   * The tests above prove the arithmetic. This one proves the module is
   * CONNECTED — the failure this repo keeps finding is a cost control that was
   * written, tested and called by nothing.
   *
   * Driven through the real executeToolCall with no SUPABASE_URL, so the
   * durable check reports unavailable and the degraded bound decides: a
   * ceiling of 3 gives a per-instance allowance of 1.
   */
  const savedUrl = process.env.SUPABASE_URL;
  const savedCeiling = process.env.PLACES_DAILY_REQUEST_CEILING;
  delete process.env.SUPABASE_URL;
  process.env.PLACES_DAILY_REQUEST_CEILING = String(3 * MAX_REQUESTS_PER_LOOKUP);
  resetRateLimitBuckets();
  try {
    const first = await executeToolCall('search_hotels', { location: 'Singapore' });
    assert.notEqual(first?.reason, 'PLATFORM_DAILY_CAP', 'the first lookup is not held back');

    const second = await executeToolCall('search_hotels', { location: 'Singapore' });
    assert.equal(second?.status, 'unavailable');
    assert.equal(second?.reason, 'PLATFORM_DAILY_CAP', 'the ceiling reaches the tool seam, not just the module');
    assert.match(String(second?.message), /PLACES_DAILY_REQUEST_CEILING/);
  } finally {
    resetRateLimitBuckets();
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedCeiling === undefined) delete process.env.PLACES_DAILY_REQUEST_CEILING;
    else process.env.PLACES_DAILY_REQUEST_CEILING = savedCeiling;
  }
});

test('one lookup is priced at every request it can spend', () => {
  /*
   * THE FINDING THAT ALMOST SHIPPED (2026-09-07, caught in review).
   *
   * The counter increments once per tool invocation. A lookup is not one
   * request: searchGooglePlaces makes the text search, and attachPhotoUrls then
   * makes one billed media request per photo, up to PHOTO_LIMIT of them. Priced
   * at one, a ceiling of 250 permitted 1,250 Google requests — and Google bills
   * the second number.
   */
  assert.equal(MAX_REQUESTS_PER_LOOKUP, 1 + PHOTO_LIMIT,
    'the search itself, plus one media request per photo');
  assert.ok(MAX_REQUESTS_PER_LOOKUP > 1,
    'pricing a lookup at one request is exactly the bug this test exists to hold shut');

  // The ceiling is in requests, so the lookups it buys is the ceiling divided
  // by the worst case — never the ceiling itself.
  assert.equal(placesDailyLookupAllowance({ PLACES_DAILY_REQUEST_CEILING: '500' }), Math.floor(500 / MAX_REQUESTS_PER_LOOKUP));
  assert.equal(placesDailyLookupAllowance({ PLACES_DAILY_REQUEST_CEILING: '10' }), Math.floor(10 / MAX_REQUESTS_PER_LOOKUP));
  assert.ok(
    placesDailyLookupAllowance({ PLACES_DAILY_REQUEST_CEILING: '500' }) < 500,
    'a request ceiling must never be spent as if every lookup cost one request',
  );
});

test('a ceiling smaller than one lookup still allows one, rather than nothing', () => {
  // Flooring to zero would refuse every lookup forever on a small ceiling —
  // an outage dressed as a cost control, which nobody would diagnose as one.
  assert.equal(placesDailyLookupAllowance({ PLACES_DAILY_REQUEST_CEILING: '1' }), 1);
  assert.equal(placesDailyLookupAllowance({ PLACES_DAILY_REQUEST_CEILING: '2' }), 1);
});

test('the default ceiling buys a usable number of lookups', () => {
  // A default that is safe but unusable gets raised blindly by the first person
  // it blocks, which is how a considered number becomes an arbitrary one.
  const lookups = placesDailyLookupAllowance({});
  assert.ok(lookups >= 50, `the default should buy a working day of lookups, got ${lookups}`);
  assert.ok(lookups * MAX_REQUESTS_PER_LOOKUP <= DEFAULT_PLACES_DAILY_REQUESTS,
    'and never promise more requests than the ceiling allows');
});
