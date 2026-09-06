import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudioPlusAction,
  studioToolsMenuGroups,
  STUDIO_PLUS_ACTION,
} from './studio-tools-menu.js';

function items(domain) {
  return studioToolsMenuGroups(domain).flatMap((group) => group.items);
}

function ids(domain) {
  return items(domain).map((item) => item.id);
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

test('Study plus exposes one truthful door per learner action without duplicating AI interventions', () => {
  const studyItems = items('education');
  const studyIds = studyItems.map((item) => item.id);
  assert.deepEqual(studyIds, [
    'new-topic',
    'study-assessment',
    'study-flashcards',
    'study-notebook',
  ]);
  for (const duplicate of ['study-icebreaker', 'study-apply', 'study-plan', 'study-notes', 'study-explain', 'study-quiz']) {
    assert.equal(studyIds.includes(duplicate), false);
  }
  assert.equal(studyItems.find((item) => item.id === 'study-assessment')?.surface, 'assessment');
  assert.equal(studyItems.find((item) => item.id === 'study-notebook')?.surface, 'notebook');
});

test('Study menu labels stay topic-neutral while conversational actions still receive context', () => {
  const flashcards = studioToolsMenuGroups('education', "Newton's Laws of Motion")
    .flatMap((group) => group.items)
    .find((item) => item.id === 'study-flashcards');
  assert.equal(flashcards.subtitle.includes('Newton'), false);

  const action = resolveStudioPlusAction(
    'study-flashcards',
    'education',
    'Thermodynamics',
    { sendLead: 'Stay at CBSE Class 10 depth only.' },
  );
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  assert.match(action.text, /Class 10/);
  assert.match(action.text, /Thermodynamics/);
  assert.match(action.visibleText, /Thermodynamics/);
  assert.doesNotMatch(action.visibleText, /Class 10|Do not|conversation/i);
});

test('hidden legacy Study resolvers remain compatible without returning to the visible menu', () => {
  const action = resolveStudioPlusAction('study-icebreaker', 'education', 'kinematics');
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  assert.match(action.text, /ask ONE short question/i);
  assert.match(action.text, /STOP\. Do not dump the lesson/i);
  assert.match(action.text, /Do not plan trips/i);
  assert.equal(ids('education').includes('study-icebreaker'), false);
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
