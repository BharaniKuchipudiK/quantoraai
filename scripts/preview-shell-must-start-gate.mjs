#!/usr/bin/env node
/**
 * Prove Preview shell reaches embed-ready, and fail-clock policy never kills
 * the shell while the coding turn is still busy (boutique "Building…" case).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import {
  PREVIEW_EMBED_SHELL_HTML,
  buildPreviewSandbox,
  injectPreviewHarness,
} from '../src/lib/preview-utils.js';
import {
  shouldFailPreviewShell,
  shouldHoldPreviewShellFailClock,
} from '../src/lib/preview-shell-warming.js';

assert.equal(shouldHoldPreviewShellFailClock({ turnBusy: true }), true);
assert.equal(shouldFailPreviewShell({ turnBusy: true, idleElapsedMs: 60_000 }), false);
assert.equal(shouldFailPreviewShell({ turnBusy: false, idleElapsedMs: 12_000 }), true);

const canvas = fs.readFileSync(new URL('../src/components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
assert.match(canvas, /turnBusy/);
assert.match(canvas, /Hold the fail clock until the turn is idle/);
assert.match(
  fs.readFileSync(new URL('../src/components/AiStudio.jsx', import.meta.url), 'utf8'),
  /turnBusy=\{isGenerating\}/,
);
assert.match(
  fs.readFileSync(new URL('../public/preview/embed.html', import.meta.url), 'utf8'),
  /setTimeout\(signalReady/,
);

const READY_MS = 12_000;
const PATH_EMBED_HTML = fs.readFileSync(new URL('../public/preview/embed.html', import.meta.url), 'utf8');
const html = `<!DOCTYPE html><html><head><title>Boutique</title></head>
<body style="background:#fff"><h1>Saree Boutique</h1>
<button type="button">Add to Cart</button>
</body></html>`;

const sandbox = buildPreviewSandbox();
assert.doesNotMatch(sandbox, /allow-same-origin/);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0">
<iframe id="f" title="preview" sandbox="${sandbox}"></iframe>
</body></html>`);
  await page.evaluate(() => {
    window.__embedReady = false;
    window.addEventListener('message', (event) => {
      if (event.data && event.data.__quantora === true && event.data.kind === 'embed-ready') {
        window.__embedReady = true;
      }
    });
  });

  const started = Date.now();
  await page.locator('#f').evaluate((iframe, shell) => {
    iframe.srcdoc = shell;
  }, PATH_EMBED_HTML);

  await page.waitForFunction(() => window.__embedReady === true, null, { timeout: READY_MS });
  const embedMs = Date.now() - started;

  await page.evaluate((harnessed) => {
    document.getElementById('f').contentWindow.postMessage({ __quantoraPreviewHtml: harnessed }, '*');
  }, injectPreviewHarness(html));

  const preview = page.frameLocator('#f');
  await preview.locator('h1').waitFor({ state: 'attached', timeout: READY_MS });
  assert.match(await preview.locator('h1').innerText(), /Saree Boutique/);
  assert.ok(PREVIEW_EMBED_SHELL_HTML.includes('signalReady'));

  console.log(`Preview shell must-start gate passed in ${Date.now() - started}ms (embed-ready ${embedMs}ms).`);
} finally {
  await browser.close();
}
