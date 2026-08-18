import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPromptEnhancementInput, resolvePromptEnhancerModel } from './prompt-enhancement.js';

test('prompt enhancement keeps current draft distinct from bounded conversation context', () => {
  const text = buildPromptEnhancementInput({
    prompt: 'make it cleaner',
    history: [
      { sender: 'user', text: 'Prepare a CIO cloud modernization deck' },
      { sender: 'ai', text: 'I prepared the first version.' },
    ],
    sessionContext: { goal: 'Secure Phase 1 approval', facts: ['Audience is CIO leadership'] },
  });
  assert.match(text, /CURRENT USER DRAFT[\s\S]*make it cleaner/);
  assert.match(text, /RECENT CONVERSATION[\s\S]*cloud modernization/);
  assert.match(text, /Goal: Secure Phase 1 approval/);
  assert.match(text, /Audience is CIO leadership/);
});

test('prompt enhancer model is centrally configurable', () => {
  assert.equal(resolvePromptEnhancerModel({ PROMPT_ENHANCER_MODEL: 'gemini-custom' }), 'gemini-custom');
  assert.ok(resolvePromptEnhancerModel({}).length > 0);
});
