import assert from 'node:assert/strict';
import test from 'node:test';
import { readTurnPlan, requestTurnPlan, turnPlanOverrides, turnPlanRequest, TURN_PLAN_ENDPOINT } from './turn-plan-client.js';

test('the request carries the whole message, attachments as inputs, six bounded turns and the pin', () => {
  const body = turnPlanRequest({
    text: 'build a site',
    attachments: [{ name: 'bylaws.pdf', type: 'document', dataUrl: 'data:...' }, { name: 'logo.png', type: 'image' }],
    messages: [{ id: 1, sender: 'ai', text: 'greeting' }, ...Array.from({ length: 9 }, (_, i) => ({ id: i + 2, sender: i % 2 ? 'ai' : 'user', text: `turn ${i} ${'x'.repeat(900)}` }))],
    pinnedDesk: 'coding',
    hasDeskFiles: true,
    buildOwned: true,
  });
  assert.equal(body.message, 'build a site');
  assert.deepEqual(body.attachments, [{ name: 'bylaws.pdf', kind: 'document' }, { name: 'logo.png', kind: 'image' }]);
  assert.equal(body.history.length, 6);
  assert.ok(body.history.every((turn) => turn.text.length <= 600));
  assert.ok(!body.history.some((turn) => turn.text === 'greeting'), 'the greeting is not history');
  assert.equal(body.pinnedDesk, 'coding');
  assert.equal(body.hasDeskFiles, true);
  assert.equal(body.buildOwned, true);
});

test('a plan is read only when it names a lane; a stub answering something else is null', () => {
  assert.equal(readTurnPlan({ ok: true }), null);
  assert.equal(readTurnPlan(null), null);
  const plan = readTurnPlan({ plan: { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: '0.9', source: 'planner', agreed: false, reason: 'a site' } });
  assert.deepEqual(plan, { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: 0.9, source: 'planner', agreed: false, reason: 'a site' });
});

test('the request never fails the turn: a 500, a throw, a timeout and a missing fetch all read as no plan', async () => {
  assert.equal(await requestTurnPlan({ message: 'x' }, { fetchFn: async () => ({ ok: false, status: 500, json: async () => ({}) }) }), null);
  assert.equal(await requestTurnPlan({ message: 'x' }, { fetchFn: async () => { throw new Error('offline'); } }), null);
  assert.equal(await requestTurnPlan({ message: 'x' }, { fetchFn: null }), null);
  const slow = (url, init) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  assert.equal(await requestTurnPlan({ message: 'x' }, { fetchFn: slow, timeoutMs: 20 }), null);
  let seen = null;
  const ok = await requestTurnPlan({ message: 'x' }, { fetchFn: async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ plan: { lane: 'chat', confidence: 0.8, source: 'planner' } }) }; } });
  assert.equal(seen.url, TURN_PLAN_ENDPOINT);
  assert.equal(seen.body.message, 'x');
  assert.equal(ok.lane, 'chat');
});

test('overrides: the planner adds lanes and never removes what the desk owns or moves a pinned chat', () => {
  const build = { lane: 'build', desk: 'coding', officeKind: null, buildMode: true, confidence: 0.9, source: 'planner' };
  const office = { lane: 'office', desk: null, officeKind: 'excel', buildMode: false, confidence: 0.9, source: 'planner' };
  const travel = { lane: 'advisor', desk: 'travel', officeKind: null, buildMode: false, confidence: 0.9, source: 'planner' };
  const chat = { lane: 'chat', desk: null, officeKind: null, buildMode: false, confidence: 0.9, source: 'planner' };

  // The website brief that the word "excel" used to send to the Excel generator.
  assert.deepEqual(turnPlanOverrides(build, { deterministicBuild: false }), { officeKind: null, isCodingRequest: true, desk: null, applied: true });
  // A real Office ask still reaches the generator.
  assert.equal(turnPlanOverrides(office, {}).officeKind, 'excel');
  // A build the desk already owns is not vetoed by a chat plan.
  assert.equal(turnPlanOverrides(chat, { deterministicBuild: true }).isCodingRequest, true);
  // A pinned chat never moves, and a hand-picked tool is never second-guessed.
  assert.equal(turnPlanOverrides(travel, { pinnedDesk: 'coding' }).desk, undefined);
  assert.equal(turnPlanOverrides(travel, {}).desk, 'travel');
  assert.deepEqual(turnPlanOverrides(travel, { chosenOfficeKind: 'powerpoint', currentDesk: 'finance' }), { officeKind: 'powerpoint', isCodingRequest: false, desk: 'finance', applied: false });
  // No plan: nothing changes.
  assert.deepEqual(turnPlanOverrides(null, { deterministicBuild: true }), { officeKind: undefined, isCodingRequest: true, desk: undefined, applied: false });
  // A chat plan in an unpinned advisor chat keeps the chat's desk.
  assert.equal(turnPlanOverrides(chat, { currentDesk: 'finance' }).desk, undefined);
});
