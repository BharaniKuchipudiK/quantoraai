import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleStudioPreview } from './studio-preview-helpers.js';
import {
  buildCodingDeskScaffoldHtml,
  buildCodingDeskScaffoldReply,
} from './coding-desk-scaffold.js';

test('coding desk scaffold reply always yields a previewable index.html', () => {
  const reply = buildCodingDeskScaffoldReply('build a Google Drive crawling / organize agent for macOS');
  assert.match(reply, /filepath="index\.html"/);
  assert.match(reply, /Run sample organize pass/);
  const assembled = assembleStudioPreview(reply);
  assert.ok(assembled.code);
  assert.ok(assembled.vfs['index.html']?.content || assembled.code.includes('<!DOCTYPE html>'));
  assert.match(buildCodingDeskScaffoldHtml('Drive agent'), /Drive agent|Workspace agent/);
});
