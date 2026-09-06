import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudioPlusAction,
  studioToolsMenuGroups,
  STUDIO_PLUS_ACTION,
} from './studio-tools-menu.js';

function ids(domain) {
  return studioToolsMenuGroups(domain).flatMap((group) => group.items.map((item) => item.id));
}

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

test('Study secondary actions stay compact and do not duplicate the primary focus controls', () => {
  const studyIds = ids('education');
  assert.deepEqual(studyIds, [
    'new-topic',
    'study-icebreaker',
    'study-flashcards',
    'study-apply',
    'study-plan',
    'study-notes',
  ]);
  assert.equal(studyIds.includes('study-explain'), false);
  assert.equal(studyIds.includes('study-quiz'), false);
});

test('Study menu labels stay topic-neutral while the resolved action receives context', () => {
  const notes = studioToolsMenuGroups('education', "Newton's Laws of Motion")
    .flatMap((group) => group.items)
    .find((item) => item.id === 'study-notes');
  assert.equal(notes.subtitle.includes('Newton'), false);

  const action = resolveStudioPlusAction(
    'study-notes',
    'education',
    'Thermodynamics',
    { sendLead: 'Stay at CBSE Class 10 depth only.' },
  );
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  assert.match(action.text, /Class 10/);
  assert.match(action.text, /Thermodynamics/);
  assert.equal(action.visibleText, 'Turn our work on Thermodynamics into concise notes.');
  assert.doesNotMatch(action.visibleText, /Class 10|Do not|conversation/i);
});

test('Study icebreaker remains Study-scoped and context-driven', () => {
  const action = resolveStudioPlusAction('study-icebreaker', 'education', 'kinematics');
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  /*
   * Assert the BEHAVIOUR, not one phrasing of it. This used to pin the literal
   * "signal that I am ready" wording, which the human-tutor rewrite replaced
   * with a diagnostic question that serves the same purpose — and which the
   * Study contamination cleanup independently flags as a private-instruction
   * marker that should never reach a learner. Pinning the sentence made the
   * test guard a copy of the intent instead of the intent: the tutor must ask
   * one question and stop rather than dumping the lesson.
   */
  assert.match(action.text, /ask ONE short question/i);
  assert.match(action.text, /STOP\. Do not dump the lesson/i);
  assert.match(action.text, /Do not plan trips/i);
});

test('Study menu work leaves Travel, Finance, Research, and general catalogs unchanged', () => {
  assert.deepEqual(ids('travel'), [
    'new-trip',
    'travel-icebreaker',
    'travel-flights',
    'travel-hotels',
    'travel-attractions',
    'travel-itinerary',
  ]);
  assert.deepEqual(ids('finance'), ['new-advisor-chat']);
  assert.deepEqual(ids('research'), ['new-advisor-chat']);
  // Deep Research and Travel are intentionally absent: Travel owns a sidebar
  // desk, and a second door to the same place is not a second capability.
  assert.deepEqual(ids(null), [
    'Search',
    'Podcast',
    'PowerPoint',
    'Excel',
    'Word',
    'PDF',
  ]);
  assert.equal(resolveStudioPlusAction('travel-icebreaker', 'travel').visibleText, undefined);
  assert.equal(resolveStudioPlusAction('Search', null).visibleText, undefined);
});
