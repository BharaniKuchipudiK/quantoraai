import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/ux-composer-navigation.css', import.meta.url), 'utf8');
const preview = fs.readFileSync(new URL('../components/StudioPreviewControls.jsx', import.meta.url), 'utf8');

test('phase 2 UX layer loads after the shared workspace chrome layer', () => {
  const base = main.indexOf("./styles/workspace-chrome-consistency.css");
  const phase2 = main.indexOf("./styles/ux-composer-navigation.css");
  assert.ok(base >= 0);
  assert.ok(phase2 > base);
});

test('GitHub destination is promoted to composer context with a safety disclaimer', () => {
  assert.match(css, /floating-input-pill:has\(\[data-quantora-github-destination\]\)/);
  assert.match(css, /\[data-quantora-github-destination\][\s\S]*position:\s*absolute/i);
  assert.match(css, /AI can make mistakes\. Verify important information and review generated changes before publishing\./);
});

test('Projects are the visible chat hierarchy while workspace ownership hooks remain off-canvas', () => {
  assert.match(css, /\[data-quantora-workspace-chats\][\s\S]*left:\s*-10000px\s*!important/i);
  assert.match(css, /\[data-quantora-workspace-chats\][\s\S]*pointer-events:\s*none\s*!important/i);
  assert.match(css, /Default project/);
});

test('sidebar gets a wider bounded resize range and separated profile feedback anchors', () => {
  assert.match(css, /--quantora-sidebar-width:\s*300px/);
  assert.match(css, /--quantora-sidebar-min:\s*240px/);
  assert.match(css, /--quantora-sidebar-max:\s*420px/);
  assert.match(css, /resize:\s*horizontal/);
  assert.match(css, /data-quantora-sidebar-profile/);
  assert.match(css, /justify-content:\s*space-between\s*!important/);
});

test('primary Preview chrome no longer renders permanent phone/tablet viewport buttons', () => {
  assert.doesNotMatch(preview, /Smartphone|Tablet|data-quantora-canvas-device-switcher/);
  assert.match(preview, /data-quantora-primary-device-switcher="hidden"/);
});

test('landing page remains constrained and responsive on wide and narrow screens', () => {
  assert.match(css, /--quantora-content-max:\s*1180px/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(css, /@media \(max-width:\s*767px\)/);
});
