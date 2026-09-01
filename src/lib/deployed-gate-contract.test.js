import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/*
 * The deployed golden gate drives the real deployment through the landing page.
 * It used to find that page by the CTA's words; the copy changed to "Try
 * Quantora" and the gate went permanently red, was labelled flaky, and was
 * muted — which is how a production ESM outage stayed invisible.
 *
 * These tests keep the two ends of that contract tied together, so the failure
 * mode cannot recur silently: the landing page must keep publishing the hook,
 * and the gate must keep anchoring on it rather than on prose.
 */
test('the landing page publishes the durable Studio entry hook', () => {
  const landing = read('src/components/LandingPage.jsx');
  assert.match(landing, /data-quantora-enter-studio="true"/);
});

test('the deployed golden gate anchors on that hook, never on button copy', () => {
  const gate = read('scripts/deployed-golden-transactions.mjs');
  assert.match(gate, /\[data-quantora-enter-studio="true"\]/);
  // Strip comments first: the fix documents the old locator in prose, and the
  // ban is on executing it, not on explaining why it was wrong.
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /getByRole\([^)]*Studio\$/);
});

test('the deterministic readiness gate stays free of browser and model calls', () => {
  const gate = read('scripts/deployed-readiness-gate.mjs');
  // Its whole value is being unambiguous: no browser, no provider spend, so a
  // failure always means the deployment is broken and is never worth muting.
  assert.doesNotMatch(gate, /playwright|chromium/i);
  assert.match(gate, /\/api\/inference-health/);
  assert.match(gate, /FUNCTION_INVOCATION_FAILED/);
});
