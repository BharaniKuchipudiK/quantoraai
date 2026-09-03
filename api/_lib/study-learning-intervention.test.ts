import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStudyLearningIntervention } from './study-learning-intervention.js';

test('keeps an ordinary learning trajectory stable', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'What happens next?',
    history: [{ role: 'user', text: 'Explain Newton second law.' }],
  });
  assert.equal(result.state, 'stable');
  assert.equal(result.action, 'continue');
});

test('compresses after a first clear struggle signal', () => {
  const result = evaluateStudyLearningIntervention({ message: "I don't understand" });
  assert.equal(result.state, 'struggling');
  assert.equal(result.action, 'compress');
  assert.equal(result.struggleSignals, 1);
});

test('changes representation after repeated struggle instead of adding more prose', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'Make it easier for me',
    history: [
      { role: 'user', text: 'Explain potential difference.' },
      { role: 'assistant', text: 'Potential difference is energy transferred per coulomb.' },
      { role: 'user', text: "I still don't understand" },
    ],
  });
  assert.equal(result.state, 'struggling');
  assert.equal(result.action, 'change_representation');
  assert.equal(result.reason, 'repeated_struggle');
});

test('recognises repeated modality switching as a failed representation trajectory', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'Can you show me with images?',
    history: [
      { role: 'user', text: "I don't understand" },
      { role: 'assistant', text: 'Let me simplify it.' },
      { role: 'user', text: 'Tell me with a story instead.' },
      { role: 'assistant', text: 'Imagine a battery castle.' },
      { role: 'user', text: 'Still difficult to understand.' },
    ],
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.action, 'guided_reconstruction');
  assert.equal(result.reason, 'representation_failure');
  assert.ok(result.representationRequests >= 2);
});

test('visually counts as a real learner representation request', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'Can you show me visually?',
    history: [
      { role: 'user', text: "I don't understand" },
      { role: 'user', text: 'Tell me with a story instead.' },
      { role: 'user', text: 'Still difficult to understand.' },
    ],
  });
  assert.equal(result.state, 'blocked');
  assert.equal(result.action, 'guided_reconstruction');
  assert.ok(result.representationRequests >= 2);
});

test('representation preferences alone never label the learner blocked', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'Now show me an example',
    history: [
      { role: 'user', text: 'Show me a diagram.' },
      { role: 'user', text: 'Tell it as a story.' },
    ],
  });
  assert.equal(result.struggleSignals, 0);
  assert.equal(result.state, 'stable');
  assert.equal(result.action, 'continue');
});

test('verified prerequisite evidence outranks prose impressions', () => {
  const result = evaluateStudyLearningIntervention({
    message: 'Explain EMF again.',
    verifiedPrerequisiteGap: true,
  });
  assert.equal(result.state, 'prerequisite_gap');
  assert.equal(result.action, 'rewind_prerequisite');
  assert.equal(result.reason, 'verified_prerequisite_gap');
});

test('can offer a reference when the learner explicitly asks after struggling', () => {
  const result = evaluateStudyLearningIntervention({ message: "I'm confused. Is there a short reference or video I can study?" });
  assert.equal(result.state, 'struggling');
  assert.equal(result.action, 'offer_reference');
});
