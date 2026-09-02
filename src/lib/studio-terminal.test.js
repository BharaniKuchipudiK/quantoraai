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

test('on the desktop the terminal asks for a folder, then needs no isolation', () => {
  assert.match(studioTerminalBlocker({ isolated: false, fileCount: 2, desktop: { attached: false } }), /Attach a folder/);
  assert.equal(studioTerminalBlocker({ isolated: false, fileCount: 2, desktop: { attached: true } }), '');
  assert.match(studioTerminalBlocker({ isolated: false, fileCount: 0, desktop: { attached: true } }), /No files/i);
});
