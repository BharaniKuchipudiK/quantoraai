import assert from 'node:assert/strict';
import test from 'node:test';
import { appendExecutionProgress } from './execution-progress.js';

test('progress keeps observed milestones and collapses duplicate heartbeats', () => {
  let history = appendExecutionProgress([], { phase: 'build', state: 'connecting', label: 'Connecting…' }, { at: 1 });
  history = appendExecutionProgress(history, { phase: 'build', state: 'connecting', label: 'Connecting…' }, { at: 2 });
  history = appendExecutionProgress(history, { phase: 'build', state: 'generating', label: 'parser.py received' }, { at: 3 });
  assert.deepEqual(history.map(({ label, at }) => ({ label, at })), [
    { label: 'Connecting…', at: 1 },
    { label: 'parser.py received', at: 3 },
  ]);
});

test('progress is bounded and ignores empty or malformed events', () => {
  let history = appendExecutionProgress(null, null);
  for (let index = 0; index < 20; index += 1) history = appendExecutionProgress(history, { label: `Step ${index}` }, { at: index + 1 });
  assert.equal(history.length, 16);
  assert.equal(history[0].label, 'Step 4');
  assert.equal(history.at(-1).label, 'Step 19');
});

