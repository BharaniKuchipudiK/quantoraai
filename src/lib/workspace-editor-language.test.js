import assert from 'node:assert/strict';
import test from 'node:test';
import { languageFromPath } from './workspace-editor-language.js';

test('workspace editor language follows the file tab, not a generic textarea', () => {
  assert.equal(languageFromPath('src/App.jsx'), 'javascript');
  assert.equal(languageFromPath('styles.css'), 'css');
  assert.equal(languageFromPath('index.html'), 'html');
  assert.equal(languageFromPath('code'), 'javascript');
});
