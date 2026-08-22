import assert from 'node:assert/strict';
import test from 'node:test';
import { studioFileCount, studioTerminalBlocker } from './studio-terminal.js';

test('terminal refuses to fake output when the page is not isolated', () => {
  assert.match(studioTerminalBlocker({ isolated: false, fileCount: 2 }), /cannot start/i);
});

test('terminal refuses to run with no project files', () => {
  assert.match(studioTerminalBlocker({ isolated: true, fileCount: 0 }), /No files/i);
});

test('terminal is allowed when files exist on an isolated page', () => {
  assert.equal(studioTerminalBlocker({ isolated: true, fileCount: 1 }), '');
});

test('file count ignores empty slots', () => {
  assert.equal(studioFileCount({ 'index.html': { content: '<html></html>' }, skip: null }), 1);
});
