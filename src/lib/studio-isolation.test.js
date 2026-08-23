import assert from 'node:assert/strict';
import test from 'node:test';
import {
  homeHrefForTab,
  isIsolatedStudioPath,
  isolatedStudioHref,
  tabFromLocation,
} from './studio-isolation.js';

test('Studio after login lives at /desk, not the marketing page', () => {
  assert.equal(isIsolatedStudioPath('/desk'), true);
  assert.equal(isIsolatedStudioPath('/desk/'), true);
  assert.equal(isIsolatedStudioPath('/'), false);
  assert.equal(isIsolatedStudioPath('/studio'), false);
  assert.equal(isolatedStudioHref(), '/desk');
});

test('leaving the isolated desk returns to home tabs without keeping /desk', () => {
  assert.equal(homeHrefForTab('landing'), '/');
  assert.equal(homeHrefForTab('hub'), '/?tab=hub');
  assert.equal(tabFromLocation('/desk', ''), 'studio');
  assert.equal(tabFromLocation('/', '?tab=hub'), 'hub');
  assert.equal(tabFromLocation('/', ''), 'landing');
});
