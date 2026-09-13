import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const main = fs.readFileSync(new URL('../main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/fluid-study-responsiveness.css', import.meta.url), 'utf8');
const partner = fs.readFileSync(new URL('./studio-partner-status.js', import.meta.url), 'utf8');

test('fluid responsiveness layer loads after composer/navigation UX', () => {
  const base = main.indexOf("./styles/ux-composer-navigation.css");
  const fluid = main.indexOf("./styles/fluid-study-responsiveness.css");
  assert.ok(base >= 0);
  assert.ok(fluid > base);
});

test('Studio reclaims browser width while retaining deliberate ultrawide limits', () => {
  assert.match(css, /--quantora-fluid-chat-max:\s*1440px/);
  assert.match(css, /--quantora-fluid-composer-max:\s*1320px/);
  assert.match(css, /\[style\*="max-width: 1000px"\][\s\S]*max-width:\s*var\(--quantora-fluid-chat-max\)\s*!important/i);
  assert.match(css, /\[data-quantora-studio-sidebar="true"\]\[style\*="width: 0px"\][\s\S]*flex:\s*1 1 100%/i);
});

test('Study progress visually distinguishes waiting from streaming without changing routing', () => {
  assert.match(partner, /Tutor request sent/);
  assert.match(partner, /Waiting for the tutor to start responding/);
  assert.match(partner, /Your tutor answer is arriving/);
  assert.match(partner, /Number\(streamedBytes\) > 0/);
  assert.match(css, /data-quantora-domain="education"[\s\S]*animate-slide-up:has\(\.animate-spin\)/i);
});
