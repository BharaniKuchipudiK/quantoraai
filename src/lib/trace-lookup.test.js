import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTraceStory, traceLookupUrl } from './trace-lookup.js';

const ID = 'studio-719887e2-b5a4-4de5-b84a-f474192befa2';
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('the lookup asks the served route for exactly the reference the desk showed', () => {
  assert.equal(traceLookupUrl(ID), `/api/trace?correlationId=${ID}`);
  assert.equal(traceLookupUrl('not a reference\n'), null);
});

test('a resolved reference hands back the story and the events', async () => {
  const story = { outcome: 'server-cut-off', headline: 'Quantora\'s server was cut off before it finished this turn — a fault on our side.', detail: '…', steps: [] };
  const result = await fetchTraceStory(ID, { fetchImpl: reply(200, { correlationId: ID, events: [{ boundary: 'api.chat', state: 'started' }], story }) });
  assert.equal(result.ok, true);
  assert.equal(result.story.outcome, 'server-cut-off');
  assert.equal(result.events.length, 1);
});

test('every way the call can end is said truthfully, never as a blank', async () => {
  assert.equal((await fetchTraceStory(ID, { fetchImpl: reply(404, { error: 'No record for that reference.' }) })).error, 'Quantora has no record under this reference for your account.');
  assert.equal((await fetchTraceStory(ID, { fetchImpl: reply(401, { error: 'Active session required.' }) })).error, 'Sign in to resolve this reference.');
  assert.equal((await fetchTraceStory(ID, { fetchImpl: reply(503, { error: 'This deployment keeps no trace store, so the reference cannot be resolved here.' }) })).error, 'This deployment keeps no trace store, so the reference cannot be resolved here.');
  assert.equal((await fetchTraceStory(ID, { fetchImpl: async () => { throw new Error('offline'); } })).error, 'Quantora could not be reached to resolve this reference.');
  assert.equal((await fetchTraceStory(ID, { fetchImpl: reply(200, { correlationId: ID }) })).error, 'Quantora answered without an account of this reference.');
  assert.equal((await fetchTraceStory('junk', { fetchImpl: reply(200, {}) })).error, 'That reference is not one Quantora issued.');
});
