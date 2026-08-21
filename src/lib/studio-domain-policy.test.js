import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAutoOpenCodeWorkspace,
  canExplicitlyPreviewCode,
  canUseMediaCanvas,
  studioDomainPolicy,
} from './studio-domain-policy.js';

test('Travel never auto-opens or exposes the generic developer Canvas', () => {
  const travel = studioDomainPolicy('travel');
  assert.equal(travel.autoOpenCodeWorkspace, false);
  assert.equal(travel.explicitCodePreview, false);
  assert.equal(travel.showGenericCanvasNavigation, false);
  assert.equal(canUseMediaCanvas('travel'), false);
});

test('Study keeps deliberate media and explicit preview capability without surprise code workspace', () => {
  const study = studioDomainPolicy('education');
  assert.equal(study.autoOpenCodeWorkspace, false);
  assert.equal(study.explicitCodePreview, true);
  assert.equal(study.mediaCanvas, true);
  assert.equal(canUseMediaCanvas('education'), true);
});

test('neutral Studio remains a full build workspace', () => {
  assert.equal(canAutoOpenCodeWorkspace(null), true);
  assert.equal(canExplicitlyPreviewCode(null), true);
});
