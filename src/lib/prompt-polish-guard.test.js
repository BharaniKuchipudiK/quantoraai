import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldApplyPromptPolishResult } from './prompt-polish-guard.js';

test('applies a prompt polish result only to the unchanged originating draft', () => {
  assert.equal(shouldApplyPromptPolishResult({
    requestSessionId: 'session-1',
    currentSessionId: 'session-1',
    draftAtStart: 'rough prompt',
    currentDraft: 'rough prompt',
  }), true);
});

test('preserves newer edits and drafts in another session', () => {
  assert.equal(shouldApplyPromptPolishResult({
    requestSessionId: 'session-1',
    currentSessionId: 'session-1',
    draftAtStart: 'rough prompt',
    currentDraft: 'rough prompt with new details',
  }), false);
  assert.equal(shouldApplyPromptPolishResult({
    requestSessionId: 'session-1',
    currentSessionId: 'session-2',
    draftAtStart: 'rough prompt',
    currentDraft: 'another chat draft',
  }), false);
});
