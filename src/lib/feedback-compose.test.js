import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FEEDBACK_MESSAGE_LIMIT,
  composeFeedbackMessage,
  deriveFeedbackType,
} from './feedback-compose.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * The chip-based feedback modal still speaks the server's existing contract:
 * api/pipeline.ts validates a non-empty message of at most 500 characters and
 * a feedbackType of 'feedback' | 'suggestion'. These tests pin the composer to
 * that contract, so a chip redesign can never silently produce a payload the
 * server rejects — the failure the old always-required textarea never had.
 */

test('chips alone compose a sendable message — no typed detail required', () => {
  assert.equal(composeFeedbackMessage(['Solved my task'], ''), 'Solved my task');
  assert.equal(
    composeFeedbackMessage(['Solved my task', 'Fast and efficient'], ''),
    'Solved my task · Fast and efficient',
  );
});

test('detail joins chips after an em dash, and stands alone without chips', () => {
  assert.equal(
    composeFeedbackMessage(['Something broke'], '  the preview went blank  '),
    'Something broke — the preview went blank',
  );
  assert.equal(composeFeedbackMessage([], 'just a note'), 'just a note');
});

test('the composed message never exceeds the server limit', () => {
  const message = composeFeedbackMessage(['Other'], 'x'.repeat(FEEDBACK_MESSAGE_LIMIT * 2));
  assert.ok(message.length <= FEEDBACK_MESSAGE_LIMIT);
  // And the limit itself matches what feedback-store enforces.
  assert.match(read('api/_lib/feedback-store.ts'), /message\.length > 500/);
  assert.equal(FEEDBACK_MESSAGE_LIMIT, 500);
});

test('capability and idea chips file as suggestions; everything else as feedback', () => {
  assert.equal(deriveFeedbackType(['Feature idea']), 'suggestion');
  assert.equal(deriveFeedbackType(['Missing a capability', 'Easy to use']), 'suggestion');
  assert.equal(deriveFeedbackType(['Solved my task']), 'feedback');
  assert.equal(deriveFeedbackType([]), 'feedback');
});

test('the widget submits through the composer, and Submit no longer demands typing', () => {
  const widget = read('src/components/FeedbackWidget.jsx');
  assert.match(widget, /composeFeedbackMessage\(selectedChips, detail\)/);
  assert.match(widget, /deriveFeedbackType\(selectedChips\)/);
  assert.match(widget, /selectedChips\.length > 0 \|\| detail\.trim\(\)\.length > 0/);
  // The server contract fields all still travel.
  for (const field of ["targetStage: 'feedback'", 'pagePath', 'surface']) {
    assert.ok(widget.includes(field), `widget must still send ${field}`);
  }
});
