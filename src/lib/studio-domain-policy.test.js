import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAutoOpenCodeWorkspace,
  canExplicitlyPreviewCode,
  studioDomainPolicy,
} from './studio-domain-policy.js';

test('neutral Studio remains a full build workspace', () => {
  assert.equal(canAutoOpenCodeWorkspace(null), true);
  assert.equal(canExplicitlyPreviewCode(null), true);
});

