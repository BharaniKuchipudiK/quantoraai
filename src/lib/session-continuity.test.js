import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessSessionContinuity,
  createSessionHandoverContract,
  sessionHandoverLabel,
  shouldOfferSessionHandover,
  describeSessionHandover,
  providerExhaustionPressure,
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
  // Facts and intents share the receiving session's capacity. Taking 8 of 16
  // here threw away half the context for no reason the child session imposed.
  assert.equal(contract.summary.facts.length, 13);
  assert.equal(contract.summary.facts.length + contract.summary.recentIntents.length, 16);
  // Nothing is silently lost on the way in: everything the packet claims to
  // carry is actually in the context the next chat receives.
  for (const fact of contract.summary.facts) assert.ok(contract.context.facts.includes(fact), fact);
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

test('a handover says what it carries before it carries it', () => {
  const pressure = assessSessionContinuity({
    messages: Array.from({ length: 90 }, (_, i) => user(`turn ${i}`)),
    historyResult: { trimmed: 0, dropped: 4 },
  });
  const contract = createSessionHandoverContract({
    sourceSessionId: 'session-finance',
    studioDomain: 'finance',
    conversationContext: {
      goal: 'Clear the card debt',
      facts: ['Debt: 5,000 at 19.99% APR, minimum 150/month', 'Monthly income stated: 4,000'],
    },
    messages: [user('What if I consolidate?')],
    pressure,
    createdAt: 1,
  });

  const preview = describeSessionHandover(contract);
  assert.equal(preview.carried, preview.lines.length);
  assert.ok(preview.lines.some((line) => /Goal: Clear the card debt/.test(line)));
  assert.ok(preview.lines.some((line) => /19\.99% APR/.test(line)));
  assert.ok(preview.lines.some((line) => /You asked: What if I consolidate\?/.test(line)));
  // The reason names what already happened to this chat, not a vague warning.
  assert.match(preview.reason, /4 older turns/);

  const quiet = describeSessionHandover({ summary: {}, trigger: { metrics: {} } });
  assert.equal(quiet.carried, 0);
  assert.match(quiet.reason, /close to the size/);
});

test('provider exhaustion is a real handover trigger, not just context pressure', () => {
  const pressure = providerExhaustionPressure('no healthy AI route');
  assert.equal(pressure.recommendHandover, true);
  assert.match(pressure.reasons[0], /provider-exhausted/);

  // The same contract builder must accept it, so a route death can seed a fresh
  // chat with this session's goal and facts.
  const contract = createSessionHandoverContract({
    sourceSessionId: 'sess-1',
    conversationContext: { goal: 'Plan a debt payoff', facts: ['Salary 15000'] },
    messages: [{ sender: 'user', text: 'How do I clear my card first?' }],
    pressure,
  });
  assert.ok(contract, 'a route death can hand over');
  assert.equal(contract.summary.goal, 'Plan a debt payoff');
  assert.match(contract.trigger.reasons[0], /provider-exhausted/);
});
