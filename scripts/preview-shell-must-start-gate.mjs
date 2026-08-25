#!/usr/bin/env node
/**
 * Prove Preview shell reaches embed-ready via path `/preview/embed.html` under a
 * parent with COEP require-corp (Coding Desk reality) — not srcdoc theater.
 * Also keep fail-clock policy unit assertions.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';
import {
  PREVIEW_EMBED_PATH,
  PREVIEW_EMBED_SHELL_HTML,
  buildPreviewSandbox,
  injectPreviewHarness,
} from '../src/lib/preview-utils.js';
import {
  shouldFailPreviewShell,
  shouldHoldPreviewShellFailClock,
  shouldAutoRemountFailedPreviewShell,
} from '../src/lib/preview-shell-warming.js';

assert.equal(shouldHoldPreviewShellFailClock({ turnBusy: true }), true);
assert.equal(shouldFailPreviewShell({ turnBusy: true, idleElapsedMs: 60_000 }), false);
assert.equal(shouldFailPreviewShell({ turnBusy: false, idleElapsedMs: 12_000 }), true);
assert.equal(shouldAutoRemountFailedPreviewShell({
  warmingFailed: true,
  hasRunnablePreview: true,
  autoRemountAttempts: 0,
}), true);

const canvas = fs.readFileSync(new URL('../src/components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
assert.match(canvas, /turnBusy/);
assert.match(canvas, /Hold the fail clock until the turn is idle/);
assert.match(canvas, /shouldAutoRemountFailedPreviewShell/);
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

const hostHtml = `<!DOCTYPE html><html><body style="margin:0">
<iframe id="f" title="preview" sandbox="${sandbox}" src="${PREVIEW_EMBED_PATH}"></iframe>
</body></html>`;

function startCoepPreviewServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const path = String(req.url || '/').split('?')[0];
      // Match Vite preview: COEP on the whole origin + CORP on /preview/*
      // (sandboxed iframes are opaque-origin; CORP alone is not enough).
      const baseHeaders = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      };
      if (path === PREVIEW_EMBED_PATH) {
        res.writeHead(200, {
          ...baseHeaders,
          'Cross-Origin-Resource-Policy': 'cross-origin',
        });
        res.end(PATH_EMBED_HTML);
        return;
      }
      if (path === '/' || path === '/desk') {
        res.writeHead(200, baseHeaders);
        res.end(hostHtml);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        embedUrl: `http://127.0.0.1:${port}${PREVIEW_EMBED_PATH}`,
      });
    });
  });
}

const { server, baseUrl, embedUrl } = await startCoepPreviewServer();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();

  // Prove headers: parent COEP + embed CORP+COEP (Vite/Coding Desk path embed).
  const parentRes = await page.request.get(`${baseUrl}/`);
  assert.equal(parentRes.headers()['cross-origin-embedder-policy'], 'require-corp');
  const embedRes = await page.request.get(embedUrl);
  assert.equal(embedRes.headers()['cross-origin-resource-policy'], 'cross-origin');
  assert.equal(embedRes.headers()['cross-origin-embedder-policy'], 'require-corp');
  assert.match(await embedRes.text(), /signalReady/);

  // Install before navigation so we cannot miss the shell's first signalReady.
  await page.addInitScript(() => {
    window.__embedReady = false;
    window.addEventListener('message', (event) => {
      if (event.data && event.data.__quantora === true && event.data.kind === 'embed-ready') {
        window.__embedReady = true;
      }
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15_000 });

  // Path iframe must already be pointed at /preview/embed.html (not srcdoc).
  const iframeSrc = await page.locator('#f').getAttribute('src');
  assert.equal(iframeSrc, PREVIEW_EMBED_PATH);

  const started = Date.now();
  await page.waitForFunction(() => window.__embedReady === true, null, { timeout: READY_MS });
  const embedMs = Date.now() - started;

  await page.evaluate((harnessed) => {
    document.getElementById('f').contentWindow.postMessage({ __quantoraPreviewHtml: harnessed }, '*');
  }, injectPreviewHarness(html));

  const preview = page.frameLocator('#f');
  await preview.locator('h1').waitFor({ state: 'attached', timeout: READY_MS });
  assert.match(await preview.locator('h1').innerText(), /Saree Boutique/);
  assert.ok(PREVIEW_EMBED_SHELL_HTML.includes('signalReady'));

  console.log(
    `Preview shell must-start gate passed in ${Date.now() - started}ms `
    + `(path+COEP embed-ready ${embedMs}ms via ${embedUrl}).`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
