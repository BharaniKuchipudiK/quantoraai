import assert from 'node:assert/strict';
import test from 'node:test';
import { turnBelongsToBuild } from './build-session.js';

const ACKNOWLEDGEMENTS = [
  'Excellent work', 'Excellent work!', 'EXCELLENT WORK', 'Great job',
  'Nice work', 'Well done', 'Amazing work', 'Brilliant', 'Awesome', 'Perfect',
  'Thanks', 'Thank you', 'Thank you so much', 'Thanks a lot',
  'Thank you for your help', 'I appreciate it', 'Really appreciate your work',
  'Looks good', 'Excellent work, thanks!', 'Great job. Thank you!',
  '  Excellent   work  ', 'Excellent work 👍', 'Thanks 🙏',
];

for (const text of ACKNOWLEDGEMENTS) {
  test(`gratitude is not permission to build: ${JSON.stringify(text)}`, () => {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), false);
  });
}

for (const text of [
  'Excellent work — now add an engineer filter',
  'Thanks, please fix the CSV export',
  'Great job!\nAdd a dark mode',
  'Thanks but the button is still broken',
  'Not excellent work',
  'Thanks.js is missing',
  'Make the title "Excellent work"',
  'Excellent work <script>change()</script>',
  'Thanks. Do not lose the existing filters; add a new one.',
  'it is still broken', 'the buttons do not work',
  'Boutique showcase + service booking',
]) {
  test(`the whole message still reaches the build: ${JSON.stringify(text)}`, () => {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), true);
  });
}

// These are not treated as gratitude. Pending-action authorization is separate.
for (const text of ['Yes', 'Okay', 'Sure', 'Proceed', 'Continue', "Let's go"]) {
  test(`existing confirmation routing is preserved: ${text}`, () => {
    assert.equal(turnBelongsToBuild({ text, buildSessionActive: true }), true);
  });
}

test('ordinary questions, empty turns and unrelated sessions keep their paths', () => {
  assert.equal(turnBelongsToBuild({ text: 'Explain how the filter works', buildSessionActive: true }), false);
  assert.equal(turnBelongsToBuild({ text: 'What is wrong with the economy?', buildSessionActive: true }), false);
  assert.equal(turnBelongsToBuild({ text: '', buildSessionActive: true }), false);
  assert.equal(turnBelongsToBuild({ text: 'Thanks', buildSessionActive: false }), false);
  assert.equal(turnBelongsToBuild({ text: 'Add a filter', buildSessionActive: false }), false);
});
