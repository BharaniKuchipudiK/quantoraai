import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStudyCapabilityRouting, formatStudyCognitiveDirective, interpretStudyTurn, publicStudyCognitiveMetadata } from './study-cognitive-routing.js';

const baseDecision = { primaryModelId: 'gemini-flash-latest', fallbackModelIds: ['nvidia/nemotron-3-super-120b-a12b:free', 'openai/gpt-oss-120b:free'], reason: 'speed', provider: 'gemini' as const, hasVisionSupport: true, selectionSource: 'ranked_free' };

test('is a strict no-op outside Study Tutor', () => {
  for (const studioDomain of [null, 'finance', 'research', 'travel', 'coding', 'general']) {
    const interpretation = interpretStudyTurn({ studioDomain, message: 'Check whether my answer is correct and explain why.', history: [{ role: 'user', text: 'Other workspace context.' }] });
    assert.equal(interpretation, null);
    assert.equal(formatStudyCognitiveDirective(interpretation), '');
    assert.equal(publicStudyCognitiveMetadata(interpretation), undefined);
    assert.strictEqual(applyStudyCapabilityRouting({ interpretation, baseDecision }), baseDecision);
  }
});

test('interprets a Study follow-up challenge and requires verification', () => {
  const interpretation = interpretStudyTurn({ studioDomain: 'education', message: 'But why is that proof valid? Are you sure?', history: [{ role: 'user', text: 'Explain the Pythagorean theorem.' }, { role: 'assistant', text: 'Consider a right triangle.' }] });
  assert.ok(interpretation);
  assert.equal(interpretation.intent, 'challenge');
  assert.equal(interpretation.continuity, 'follow_up');
  assert.equal(interpretation.requiresVerification, true);
  assert.ok(interpretation.capabilities.includes('answer_verification'));
  assert.match(formatStudyCognitiveDirective(interpretation), /preserve the current lesson context/i);
});

test('does not mistake a clear new Study topic for a short follow-up', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Explain photosynthesis.',
    history: [{ role: 'user', text: 'Teach me quadratic equations.' }],
  });
  assert.equal(interpretation?.continuity, 'new_topic');
});

test('distinguishes diagnosis, practice, planning, and advanced depth', () => {
  const cases = [['Where did I go wrong in this calculation?', 'diagnose'], ['Quiz me on cell division.', 'practice'], ['Make a revision plan for thermodynamics.', 'plan']] as const;
  for (const [message, intent] of cases) assert.equal(interpretStudyTurn({ studioDomain: 'education', message })?.intent, intent);
  assert.equal(interpretStudyTurn({ studioDomain: 'education', message: 'Derive the Euler-Lagrange equation rigorously.' })?.difficulty, 'advanced');
  assert.equal(interpretStudyTurn({ studioDomain: 'education', message: 'Explain fractions in simple terms.' })?.difficulty, 'foundational');
});

test('adds visual interpretation without replacing the learning capability', () => {
  const interpretation = interpretStudyTurn({ studioDomain: 'education', message: 'Walk me through this diagram step by step.', hasImages: true });
  assert.ok(interpretation?.capabilities.includes('worked_example'));
  assert.ok(interpretation?.capabilities.includes('visual_interpretation'));
});

test('routes deep Study turns within the existing eligible ladder', () => {
  const interpretation = interpretStudyTurn({ studioDomain: 'education', message: 'Verify my proof and identify the first invalid assumption.' });
  const decision = applyStudyCapabilityRouting({ interpretation, baseDecision, models: [
    { id: 'gemini-flash-latest', specialty: 'Fast general answers' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', specialty: 'Reasoning' },
    { id: 'openai/gpt-oss-120b:free', specialty: 'General reasoning' },
    { id: 'paid/model-that-was-not-eligible', specialty: 'Reasoning', pricingKind: 'paid' },
  ] });
  assert.equal(decision.selectionSource, 'study_capability_route');
  assert.equal(decision.reason, 'study_verification');
  assert.equal(decision.primaryModelId, 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.deepEqual(new Set([decision.primaryModelId, ...decision.fallbackModelIds]), new Set([baseDecision.primaryModelId, ...baseDecision.fallbackModelIds]));
  assert.ok(!decision.fallbackModelIds.includes('paid/model-that-was-not-eligible'));
});

test('does not override explicit model choices or vision routing', () => {
  const interpretation = interpretStudyTurn({ studioDomain: 'education', message: 'Prove this theorem.' });
  assert.strictEqual(applyStudyCapabilityRouting({ interpretation, baseDecision, explicitModelSelected: true }), baseDecision);
  assert.strictEqual(applyStudyCapabilityRouting({ interpretation, baseDecision, hasImages: true }), baseDecision);
});

/*
 * A routing decision must not contradict itself.
 *
 * The reroute recomputed `provider` from the new primary and let
 * `hasVisionSupport` ride through from the old one, so a swap across gateways
 * produced an object describing two different models at once.
 */
test('a rerouted decision describes one model, not two', () => {
  const base = {
    primaryModelId: 'gemini-flash-latest',
    fallbackModelIds: ['deepseek/deepseek-r1'],
    reason: 'base',
    provider: 'gemini' as const,
    hasVisionSupport: true,
    selectionSource: 'base',
  };
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Derive the Lagrangian and prove the theorem rigorously',
  });
  assert.ok(interpretation, 'an advanced Study turn is interpreted');

  const routed = applyStudyCapabilityRouting({
    interpretation,
    baseDecision: base,
    models: [
      { id: 'gemini-flash-latest' },
      { id: 'deepseek/deepseek-r1' },
    ],
  });

  // Whether or not this particular turn reorders, the two fields must agree.
  assert.equal(
    routed.hasVisionSupport,
    routed.primaryModelId.startsWith('gemini'),
    'the vision flag must describe the primary the decision actually names',
  );
  assert.equal(
    routed.provider,
    routed.primaryModelId.startsWith('gemini') ? 'gemini' : 'openrouter',
    'and so must the provider',
  );
});
