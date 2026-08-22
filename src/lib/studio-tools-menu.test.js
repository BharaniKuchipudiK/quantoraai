import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStudioPlusAction,
  studioPlusCatalogIds,
  STUDIO_PLUS_ACTION,
} from './studio-tools-menu.js';

test('Travel plus menu has New trip and never Study flashcards or quiz', () => {
  const ids = studioPlusCatalogIds('travel');
  assert.ok(ids.includes('new-trip'));
  assert.ok(ids.includes('travel-icebreaker'));
  assert.equal(ids.includes('new-topic'), false);
  assert.equal(ids.includes('study-flashcards'), false);
  assert.equal(ids.includes('study-quiz'), false);
  assert.equal(ids.includes('PowerPoint'), false);
});

test('Study plus menu has New topic and never flights or hotels', () => {
  const ids = studioPlusCatalogIds('education');
  assert.ok(ids.includes('new-topic'));
  assert.ok(ids.includes('study-icebreaker'));
  assert.ok(ids.includes('study-flashcards'));
  assert.equal(ids.includes('new-trip'), false);
  assert.equal(ids.includes('travel-flights'), false);
  assert.equal(ids.includes('travel-hotels'), false);
  assert.equal(ids.includes('open-travel'), false);
});

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

test('Study icebreaker prompt stays on the tutor desk', () => {
  const action = resolveStudioPlusAction('study-icebreaker', 'education', 'kinematics');
  assert.equal(action.kind, STUDIO_PLUS_ACTION.PROMPT);
  assert.match(action.text, /I’m with you|I'm with you/);
  assert.match(action.text, /Do not plan trips/i);
});
