import assert from 'node:assert/strict';
import test from 'node:test';
import { studySourceContextText } from './study-source-client.js';

test('projects PDF pages into page-grounded Study context', () => {
  const text = studySourceContextText({
    kind: 'pdf',
    filename: 'physics.pdf',
    pages: [
      { page: 1, text: 'Voltage is energy transferred per coulomb.' },
      { page: 2, text: 'Terminal potential difference can be lower than EMF.' },
    ],
  });
  assert.match(text, /\[Source: physics\.pdf, page 1\]/);
  assert.match(text, /Voltage is energy transferred per coulomb/);
  assert.match(text, /\[Source: physics\.pdf, page 2\]/);
});

test('does not pretend a visual-only image contains extracted text', () => {
  assert.equal(studySourceContextText({ kind: 'image', filename: 'diagram.png', pages: [] }), '');
});

test('context projection stays bounded', () => {
  const text = studySourceContextText({ kind: 'pdf', filename: 'large.pdf', pages: [{ page: 1, text: 'x'.repeat(200) }] }, 80);
  assert.equal(text.length, 80);
});
