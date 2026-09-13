import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/workspace-chrome-consistency.css', import.meta.url), 'utf8');

test('workspace chrome consistency layer is loaded after existing Studio styles', () => {
  const cleanup = main.indexOf("./styles/studio-toolbar-cleanup.css");
  const consistency = main.indexOf("./styles/workspace-chrome-consistency.css");
  assert.ok(cleanup >= 0, 'existing Studio cleanup layer should stay loaded');
  assert.ok(consistency > cleanup, 'consistency layer should load after existing Studio chrome rules');
});

test('workspace chrome rules stay scoped to Studio and preserve content surfaces', () => {
  assert.match(css, /\.app-shell--studio\s*\{/);
  assert.match(css, /\.app-shell--studio \.floating-input-pill/);
  assert.match(css, /\[data-quantora-studio-sidebar="true"\]/);
  assert.match(css, /\[data-quantora-canvas-root="true"\]/);
  assert.doesNotMatch(css, /(^|\n)\s*(body|html|\*)\s*\{/m, 'phase 1 must not globally restyle the product');
  assert.doesNotMatch(css, /display\s*:\s*none/i, 'consistency pass must not remove existing controls');
});
