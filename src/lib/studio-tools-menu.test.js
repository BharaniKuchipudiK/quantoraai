import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudioPlusAction,
  studioToolsMenuGroups,
  STUDIO_PLUS_ACTION,
} from './studio-tools-menu.js';

test('Studio plus Travel opens the Travel advisor instead of mixing a trip prompt into Studio', () => {
  assert.deepEqual(resolveStudioPlusAction('open-travel'), {
    kind: STUDIO_PLUS_ACTION.OPEN_DOMAIN,
    domain: 'travel',
  });
  assert.deepEqual(resolveStudioPlusAction('new-trip'), {
    kind: STUDIO_PLUS_ACTION.FRESH_THREAD,
    domain: 'travel',
  });
  assert.deepEqual(resolveStudioPlusAction('new-topic'), {
    kind: STUDIO_PLUS_ACTION.FRESH_THREAD,
    domain: 'education',
  });
});

test('Study plus Explain does not print the topic name on the card', () => {
  const explain = studioToolsMenuGroups('education', "Newton's Laws of Motion")
    .flatMap((group) => group.items)
    .find((item) => item.id === 'study-explain');
  assert.equal(explain.subtitle.includes('Newton'), false);
});

test('Study icebreaker prompt stays on the tutor desk', () => {
  const action = resolveStudioPlusAction('study-icebreaker', 'education', 'kinematics');
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  assert.match(action.text, /I’m with you|I'm with you/);
  assert.match(action.text, /Do not plan trips/i);
});

test('Study plus Explain carries a stored syllabus cap', () => {
  const action = resolveStudioPlusAction(
    'study-explain',
    'education',
    'Thermodynamics',
    { sendLead: 'Stay at CBSE Class 10 depth only.' },
  );
  assert.match(action.text, /Class 10/);
  assert.match(action.text, /Thermodynamics/);
});
