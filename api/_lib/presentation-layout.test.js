import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESENTATION_CANVAS } from './presentation-layout.js';
import { PRESENTATION_THEME } from './presentation-v2.js';

test('canonical PowerPoint layout matches Presentation V2 geometry', () => {
  assert.equal(PRESENTATION_CANVAS.pptxLayout, 'LAYOUT_WIDE');
  assert.equal(PRESENTATION_CANVAS.w, 13.333);
  assert.equal(PRESENTATION_CANVAS.h, 7.5);
  assert.equal(PRESENTATION_THEME.layout.w, PRESENTATION_CANVAS.w);
  assert.equal(PRESENTATION_THEME.layout.h, PRESENTATION_CANVAS.h);
});
