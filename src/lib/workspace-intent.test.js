import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldKeepWorkspaceForPrompt, shouldRefineRunningDesk } from './workspace-intent.js';

const open = { hasWorkspace: true };
test('general questions collapse an unrelated workspace', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'What is the weather like in Singapore?' }), false);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'How is the weather in Singapore?' }), false);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Explain quantum computing simply' }), false);
});
test('follow-up visual edits keep an open workspace without naming the app', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Make it look more like iOS' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Change the theme to dark mode' }), true);
});
test('currency and cart asks keep the boutique on the desk', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Please include a currency converter' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Please give an option to Add to Cart' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'What is a shopping cart?' }), false);
});

test('a running desk follow-up is a refine, not a new product', () => {
  assert.equal(shouldRefineRunningDesk({
    prompt: 'Please include a currency converter',
    hasDeskFiles: true,
  }), true);
  assert.equal(shouldRefineRunningDesk({
    prompt: 'Please include a currency converter',
    hasDeskFiles: false,
  }), false);
  assert.equal(shouldRefineRunningDesk({
    prompt: 'Please include a currency converter',
    hasDeskFiles: true,
    studioDomain: 'travel',
  }), false);
  assert.equal(shouldRefineRunningDesk({
    prompt: 'Please include a currency converter',
    hasDeskFiles: true,
    studioDomain: 'education',
  }), false);
});

test('explicit build and refinement requests keep workspace open', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Change the button color in this app' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Fix this code' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Build a responsive website for the clinic' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, officeKind: 'powerpoint', prompt: 'Make it cleaner and more professional' }), true);
});
