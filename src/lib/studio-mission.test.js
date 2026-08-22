import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStudioMission } from './studio-mission.js';

test('keeps the boutique goal after a short follow-up in the same chat', () => {
  const mission = deriveStudioMission({
    messages: [
      { sender: 'user', text: 'build a calculator' },
      { sender: 'user', text: 'develop a website for a boutique that sells sarees' },
      { sender: 'user', text: 'add a payment gateway' },
    ],
    hasPreview: true,
    continueLabel: 'Domestic or international?',
  });
  assert.match(mission.goal, /boutique/i);
  assert.doesNotMatch(mission.goal, /calculator/i);
  assert.match(mission.next, /international/i);
});

test('infers a goal from the first build request when memory is empty', () => {
  const mission = deriveStudioMission({
    messages: [{ sender: 'user', text: 'build a scientific calculator with an iOS look' }],
    hasPreview: false,
  });
  assert.match(mission.goal, /calculator/i);
});

test('empty studio has no mission card', () => {
  assert.equal(deriveStudioMission({ messages: [] }), null);
});

test('an Office mission does not tell the user to publish a website', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'HAM SAM kickoff deck', facts: ['Outcome kind: powerpoint'] },
    messages: [{ sender: 'user', text: 'pre-kick off presentation' }],
    hasPreview: true,
    officeKind: 'powerpoint',
  });
  assert.doesNotMatch(mission.next, /publish/i);
  assert.match(mission.understanding || mission.goal, /Office|presentation|HAM/i);
});

test('Travel is planning a trip, not building a website', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'Plan a balanced trip to Mauritius for 2 adults' },
    messages: [{ sender: 'user', text: '7 Days / 1 Week' }],
    studioDomain: 'travel',
  });
  assert.equal(mission.lead, 'Planning');
  assert.doesNotMatch(mission.next || '', /publish|working page/i);
});
