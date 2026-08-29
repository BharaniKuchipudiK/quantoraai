import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessSessionContinuity,
  createSessionHandoverContract,
  sessionHandoverLabel,
  shouldOfferSessionHandover,
} from './session-continuity.js';

const user = (text) => ({ sender: 'user', text });
const ai = (text) => ({ sender: 'ai', text });

test('small follow-up loops remain stable and do not create a handover', () => {
  const pressure = assessSessionContinuity({ messages: [user('Teach me vectors'), ai('Let us begin.')] });
  assert.equal(pressure.level, 'stable');
  assert.equal(pressure.recommendHandover, false);
  assert.equal(createSessionHandoverContract({ sourceSessionId: 'session-1', pressure }), null);
});

test('message count can signal pressure even when turns are short', () => {
  const messages = Array.from({ length: 86 }, (_, index) => index % 2 ? ai('ok') : user(`follow-up ${index}`));
  const pressure = assessSessionContinuity({ messages });
  assert.equal(pressure.level, 'handover_recommended');
  assert.ok(pressure.reasons.includes('history_items'));
});

test('actual trimming always recommends handover', () => {
  const pressure = assessSessionContinuity({
    messages: [user('continue')],
    historyResult: { trimmed: 1, dropped: 0 },
  });
  assert.equal(pressure.recommendHandover, true);
  assert.ok(pressure.reasons.includes('history_trimmed'));
});

test('handover carries bounded meaning, unresolved intent, and no transcript bulk', () => {
  const messages = [
    user('Start Newton laws'),
    ai('x'.repeat(100_000)),
    user('Challenge my second-law explanation'),
    user('Then revisit free-body diagrams'),
    user('Use a pulley example'),
  ];
  const pressure = assessSessionContinuity({ messages: Array.from({ length: 90 }, (_, i) => user(`turn ${i}`)) });
  const contract = createSessionHandoverContract({
    sourceSessionId: 'session-study',
    projectId: 'project-physics',
    studioDomain: 'education',
    conversationContext: {
      goal: 'Master Newton laws',
      understanding: 'Applying the second law',
      facts: Array.from({ length: 16 }, (_, i) => `fact ${i}`),
    },
    messages,
    pressure,
    createdAt: 123,
  });

  assert.equal(contract.kind, 'session_handover');
  assert.equal(contract.sourceSessionId, 'session-study');
  assert.equal(contract.studioDomain, 'education');
  assert.equal(contract.summary.facts.length, 8);
  assert.deepEqual(contract.summary.recentIntents, [
    'Challenge my second-law explanation',
    'Then revisit free-body diagrams',
    'Use a pulley example',
  ]);
  assert.ok(contract.context.facts.includes('Challenge my second-law explanation'));
  assert.ok(contract.context.facts.includes('Then revisit free-body diagrams'));
  assert.ok(contract.context.facts.includes('Use a pulley example'));
  assert.equal(JSON.stringify(contract).includes('x'.repeat(1000)), false, 'assistant transcript bulk must not cross sessions');
  assert.equal('text' in contract, false, 'contract owns state, not scripted assistant speech');
  assert.equal('label' in contract.action, false, 'UI wording is not embedded in the platform contract');
  assert.equal(sessionHandoverLabel(contract), 'New topic · Master Newton laws');
});

/*
 * Fixtures carry recommendHandover because every real pressure object does —
 * assessSessionContinuity always sets it. Omitting it let these cases pass
 * while the function was answering a question nobody had asked yet.
 */
const under = (metrics) => ({ recommendHandover: true, level: 'handover_recommended', metrics });

test('an unresolved offer suppresses duplicate handover chips', () => {
  assert.equal(shouldOfferSessionHandover([{ sessionContinuity: { id: 'h1' } }], under({})), false);
  const dismissed = [{
    sessionContinuity: { id: 'h1', trigger: { metrics: { pressureRatio: 0.85, trimmedItems: 0, droppedItems: 0 } } },
    sessionContinuityDismissed: true,
  }];
  assert.equal(shouldOfferSessionHandover(dismissed, under({ pressureRatio: 0.9 })), false);
  assert.equal(shouldOfferSessionHandover(dismissed, under({ pressureRatio: 0.96 })), true);
  assert.equal(shouldOfferSessionHandover(dismissed, under({ pressureRatio: 0.9, droppedItems: 1 })), true);
});

/*
 * The bug this closes: with no prior offers the function fell straight through
 * to `return true`, so a brand-new chat qualified for a handover chip on turn
 * one. It was masked only because createSessionHandoverContract re-checks.
 */
test('INVARIANT: nothing is offered before pressure is observed', () => {
  assert.equal(shouldOfferSessionHandover([], null), false, 'a fresh chat is not a candidate');
  assert.equal(shouldOfferSessionHandover([], { recommendHandover: false, level: 'stable' }), false);
  assert.equal(shouldOfferSessionHandover([], { recommendHandover: false, level: 'watch' }), false);
  assert.equal(shouldOfferSessionHandover([], under({})), true, 'and it is offered once pressure is real');
});

test('the offer agrees with what assessSessionContinuity actually measured', () => {
  // Bound to the real assessor rather than a hand-made object, so the two
  // cannot drift apart the way the gate and the policy did.
  const quiet = assessSessionContinuity({ messages: [{ sender: 'user', text: 'hi' }] });
  assert.equal(quiet.recommendHandover, false);
  assert.equal(shouldOfferSessionHandover([], quiet), false);

  const trimmed = assessSessionContinuity({
    messages: [{ sender: 'user', text: 'hi' }],
    historyResult: { trimmed: 2, dropped: 0 },
  });
  assert.equal(trimmed.recommendHandover, true);
  assert.equal(shouldOfferSessionHandover([], trimmed), true);
});
