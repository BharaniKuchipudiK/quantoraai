import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldKeepWorkspaceForPrompt } from './workspace-intent.js';

const open = { hasWorkspace: true };
test('general questions collapse an unrelated workspace', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'What is the weather like in Singapore?' }), false);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'How is the weather in Singapore?' }), false);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Explain quantum computing simply' }), false);
});
test('explicit build and refinement requests keep workspace open', () => {
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Change the button color in this app' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Fix this code' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, prompt: 'Build a responsive website for the clinic' }), true);
  assert.equal(shouldKeepWorkspaceForPrompt({ ...open, officeKind: 'powerpoint', prompt: 'Make it cleaner and more professional' }), true);
});
