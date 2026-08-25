#!/usr/bin/env node
/**
 * Scorecard shop act (Start-with-10 / Fox & Wolf):
 * path-first Preview embed paints ≥1 real photo (naturalWidth) and Add to Cart
 * increments the bag — under the same sandbox as production Coding Desk.
 *
 * Modes:
 * - Local / CI (default): Vite preview or inline path-embed HTML.
 * - Deployed: QUANTORA_E2E_BASE_URL=https://… + Vercel bypass (+ optional canary)
 *   hits `${BASE}/preview/embed.html` on the deployment. Full /desk stays SSO-
 *   protected (403 without bypass); this proves the prod shell + shop act.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildStudioJobCard } from '../src/lib/studio-job-card.js';
import { ensureShopDeskInVfs } from '../src/lib/studio-preview-helpers.js';
import {
  PREVIEW_EMBED_PATH,
  PREVIEW_EMBED_SHELL_HTML,
  buildPreviewSandbox,
  prepareCodeForPreview,
  injectPreviewHarness,
} from '../src/lib/preview-utils.js';
import { countRealPreviewPhotos } from '../src/lib/preview-images.js';
import { expandShopIntakeAccept } from '../src/lib/shop-catalog-scale.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATH_EMBED_HTML = readFileSync(join(HERE, '../public/preview/embed.html'), 'utf8');
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const READY_MS = Number(process.env.QUANTORA_SHOP_ACT_READY_MS || 12_000);

const FOX_BRIEF = 'Build Fox & Wolf kids merchandise shop with 100 unique design images and a full website.';
const SAMPLE_SVG = (n) => (
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">`
  + `<rect width="120" height="80" fill="#${(n * 37).toString(16).padStart(6, '0').slice(0, 6)}"/>`
  + `<text x="60" y="44" text-anchor="middle" fill="#fff" font-size="14">foxwolf_${n}</text>`
  + `</svg>`
);

const SHELL = `<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head>
<body>
<header><nav>Home · Shop · About</nav><h1>Fox & Wolf Kids Collection</h1></header>
<main style="background:#fff;min-height:40vh">
  <div class="product-card"><img src="foxwolf_1.svg" alt="Design 1"><button type="button">Add to Cart</button></div>
  <div class="product-card"><img src="foxwolf_2.svg" alt="Design 2"><button type="button">Add to Cart</button></div>
  <div class="product-card"><img src="foxwolf_3.svg" alt="Design 3"><button type="button">Add to Cart</button></div>
</main>
<footer>© Fox & Wolf</footer>
</body></html>`;

export function buildStartWith10Vfs() {
  const vfs = {
    'index.html': { content: SHELL, language: 'html' },
  };
  for (let i = 1; i <= 10; i += 1) {
    vfs[`foxwolf_${i}.svg`] = { content: SAMPLE_SVG(i), language: 'svg' };
  }
  return vfs;
}

export function buildHarnessedStartWith10Shop() {
  const intake = expandShopIntakeAccept('Start with 10', [FOX_BRIEF]);
  assert.equal(intake.expanded, true, 'Start with 10 must expand against the oversize brief');

  const job = buildStudioJobCard({
    brief: 'Start with 10',
    existing: buildStudioJobCard({ brief: FOX_BRIEF }),
    vfs: buildStartWith10Vfs(),
  });
  assert.equal(job.purpose, 'A shop website');
  assert.equal(job.mustWork.includes('The page still runs'), false);

  const ensured = ensureShopDeskInVfs(buildStartWith10Vfs(), job, { brief: intake.text });
  assert.equal(ensured.changed || Boolean(ensured.vfs['index.html']), true);
  const html = ensured.vfs['index.html'].content;
  const prepared = prepareCodeForPreview(html, ensured.vfs);
  assert.ok(countRealPreviewPhotos(prepared) >= 1, 'prepared Preview needs ≥1 reliable photo');
  assert.match(prepared, /data:image\/svg\+xml/, 'VFS SVGs must be wired as data-URIs');
  assert.doesNotMatch(prepared, /src="foxwolf_\d+\.svg"/, 'relative SVG srcs must not survive prepare');
  assert.match(prepared, /data-quantora-bag|Bag\s*0/i, 'shop desk must expose a bag control');
  assert.match(PREVIEW_EMBED_SHELL_HTML, /setTimeout\(signalReady/, 'shell must re-post embed-ready');
  assert.match(PATH_EMBED_HTML, /setTimeout\(signalReady/, 'path embed shell must re-post embed-ready');

  return {
    job,
    prepared,
    harnessed: injectPreviewHarness(prepared),
    reliablePhotos: countRealPreviewPhotos(prepared),
  };
}

function resolveTarget() {
  const baseUrl = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
  const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
  const canary = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
  const requireDeployed = process.env.QUANTORA_SHOP_ACT_REQUIRE_DEPLOYED === '1'
    || process.argv.includes('--deployed');

  if (requireDeployed) {
    if (!/^https:\/\//.test(baseUrl)) {
      throw new Error('Deployed shop act requires QUANTORA_E2E_BASE_URL as an HTTPS deployment URL.');
    }
    if (bypass.length < 24) {
      throw new Error(
        'Deployed shop act requires VERCEL_AUTOMATION_BYPASS_SECRET. '
        + 'Without it, production https://quantoraai.app returns 403 (Vercel SSO / protection).',
      );
    }
  }

  const isHttps = /^https:\/\//.test(baseUrl);
  const canHitDeployed = isHttps && bypass.length >= 24;
  if (isHttps && !canHitDeployed && requireDeployed === false) {
    return {
      mode: 'local-inline',
      baseUrl: null,
      embedUrl: null,
      note: 'HTTPS base set but bypass missing — falling back to inline path-embed HTML (prod /desk is 403 without bypass).',
      bypass,
      canary,
    };
  }
  if (canHitDeployed) {
    return {
      mode: 'deployed-embed',
      baseUrl,
      embedUrl: `${baseUrl}${PREVIEW_EMBED_PATH}`,
      note: `Hitting deployed path-first embed ${baseUrl}${PREVIEW_EMBED_PATH}`,
      bypass,
      canary,
    };
  }
  if (/^https?:\/\//.test(baseUrl)) {
    return {
      mode: 'local-preview',
      baseUrl,
      embedUrl: `${baseUrl}${PREVIEW_EMBED_PATH}`,
      note: `Hitting local preview embed ${baseUrl}${PREVIEW_EMBED_PATH}`,
      bypass: '',
      canary: '',
    };
  }
  return {
    mode: 'local-inline',
    baseUrl: null,
    embedUrl: null,
    note: 'No QUANTORA_E2E_BASE_URL — using inline public/preview/embed.html (same shell source as prod).',
    bypass: '',
    canary: '',
  };
}

async function openHostPage(browser, target) {
  const sandbox = buildPreviewSandbox();
  assert.doesNotMatch(sandbox, /allow-same-origin/, 'prod Coding Desk sandbox must not grant same-origin');

  const contextOptions = { viewport: { width: 1280, height: 900 } };
  const context = await browser.newContext(contextOptions);

  if (target.mode === 'deployed-embed') {
    const origin = new URL(target.baseUrl).origin;
    const browserBypassHeaders = {
      'x-vercel-protection-bypass': target.bypass,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    };
    if (target.canary.length >= 24) {
      browserBypassHeaders['X-Quantora-Golden-Canary'] = target.canary;
    }
    await context.route('**/*', (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin) return route.continue();
      return route.continue({
        headers: {
          ...request.headers(),
          ...browserBypassHeaders,
        },
      });
    });
  }

  const page = await context.newPage();
  const hostHtml = `<!DOCTYPE html><html><body style="margin:0">
<iframe id="f" title="shop-preview" sandbox="${sandbox}" ${
    target.embedUrl
      ? `src="${target.embedUrl}"`
      : ''
  }></iframe>
<script>
  window.__embedReady = false;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__quantora === true && e.data.kind === 'embed-ready') {
      window.__embedReady = true;
    }
  });
</script>
</body></html>`;

  if (target.mode === 'deployed-embed') {
    // Parent must share the deployment origin so the path-first iframe is same-site
    // for postMessage delivery (matches Coding Desk hosting /preview/embed.html).
    await page.goto(target.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.setContent(hostHtml, { waitUntil: 'domcontentloaded' });
  } else if (target.mode === 'local-preview') {
    await page.goto(target.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.setContent(hostHtml, { waitUntil: 'domcontentloaded' });
  } else {
    await page.setContent(hostHtml, { waitUntil: 'domcontentloaded' });
    await page.locator('#f').evaluate((iframe, shell) => {
      iframe.srcdoc = shell;
    }, PATH_EMBED_HTML);
  }

  return { context, page };
}

export async function runShopPreviewActGate({ requireDeployed = false } = {}) {
  if (requireDeployed) process.env.QUANTORA_SHOP_ACT_REQUIRE_DEPLOYED = '1';

  const shop = buildHarnessedStartWith10Shop();
  const target = resolveTarget();
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const evidence = {
    startedAt: new Date().toISOString(),
    mode: target.mode,
    note: target.note,
    baseUrl: target.baseUrl,
    embedUrl: target.embedUrl,
    deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA || null,
    jobPurpose: shop.job.purpose,
    reliablePhotos: shop.reliablePhotos,
    prodDeskBlocker:
      'https://quantoraai.app/desk returns 403 without VERCEL_AUTOMATION_BYPASS_SECRET '
      + '(Vercel deployment protection / SSO). Deployed goldens already pattern the bypass; '
      + 'this gate hits /preview/embed.html with the same headers when secrets are present.',
  };

  const browser = await chromium.launch({ headless: true });
  const started = Date.now();
  try {
    const { context, page } = await openHostPage(browser, target);

    await page.waitForFunction(() => window.__embedReady === true, null, { timeout: READY_MS });
    const embedMs = Date.now() - started;

    await page.evaluate((harnessed) => {
      const iframe = document.getElementById('f');
      iframe.contentWindow.postMessage({ __quantoraPreviewHtml: harnessed }, '*');
    }, shop.harnessed);

    const preview = page.frameLocator('#f');
    await preview.locator('img').first().waitFor({ state: 'attached', timeout: READY_MS });

    // Playwright CDP can read naturalWidth even when sandbox omits allow-same-origin.
    await page.waitForTimeout(50);
    const imgStats = await preview.locator('img').evaluateAll((imgs) => imgs.map((img) => ({
      src: (img.getAttribute('src') || '').slice(0, 48),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    })));
    const painted = imgStats.filter((row) => row.naturalWidth > 0);
    assert.ok(
      painted.length >= 1,
      `need ≥1 painted img (naturalWidth>0); got ${JSON.stringify(imgStats.slice(0, 5))}`,
    );

    const bagBefore = await preview.locator('[data-quantora-bag="true"]').first()
      .innerText()
      .catch(() => 'Bag 0');
    const beforeCount = Number(String(bagBefore).replace(/[^0-9]/g, '')) || 0;

    await preview.locator('button, a').filter({ hasText: /add to (bag|cart)/i }).first().click();
    await preview.locator('[data-quantora-bag="true"]').first().waitFor({ state: 'visible', timeout: READY_MS });

    const bagDeadline = Date.now() + READY_MS;
    let afterCount = beforeCount;
    let bagAfter = bagBefore;
    while (Date.now() < bagDeadline) {
      bagAfter = await preview.locator('[data-quantora-bag="true"]').first().innerText();
      afterCount = Number(String(bagAfter).replace(/[^0-9]/g, '')) || 0;
      if (afterCount > beforeCount) break;
      // Also accept __quantoraBagCount when the label update races.
      const bagVar = await preview.locator('body').evaluate(() => (
        typeof window.__quantoraBagCount === 'number' ? window.__quantoraBagCount : null
      )).catch(() => null);
      if (typeof bagVar === 'number' && bagVar > beforeCount) {
        afterCount = bagVar;
        break;
      }
      await page.waitForTimeout(100);
    }
    assert.ok(
      afterCount > beforeCount,
      `Add to Cart must increment the bag (before=${beforeCount} after label="${bagAfter}")`,
    );

    const durationMs = Date.now() - started;
    assert.ok(durationMs < READY_MS, 'whole Start-with-10 Preview path must finish inside the ready bound');

    evidence.ok = true;
    evidence.completedAt = new Date().toISOString();
    evidence.embedReadyMs = embedMs;
    evidence.durationMs = durationMs;
    evidence.paintedPhotos = painted.length;
    evidence.bagBefore = beforeCount;
    evidence.bagAfter = afterCount;
    evidence.sandbox = buildPreviewSandbox();
    writeFileSync(`${ARTIFACT_DIR}/shop-preview-act-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    await page.screenshot({ path: `${ARTIFACT_DIR}/shop-preview-act.png`, fullPage: true }).catch(() => {});

    console.log(
      `Shop preview act passed in ${durationMs}ms (embed-ready ${embedMs}ms, mode=${target.mode}) — `
      + `${painted.length} painted img(s), bag ${beforeCount}→${afterCount}, `
      + `${shop.reliablePhotos} reliable src(s), job=${shop.job.purpose}.`,
    );
    console.log(target.note);
    await context.close();
    return evidence;
  } catch (error) {
    evidence.ok = false;
    evidence.failedAt = new Date().toISOString();
    evidence.error = error?.message || String(error);
    writeFileSync(`${ARTIFACT_DIR}/shop-preview-act-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runShopPreviewActGate({
    requireDeployed: process.argv.includes('--deployed'),
  }).catch((error) => {
    console.error('Shop preview act FAILED:', error?.stack || error);
    process.exitCode = 1;
  });
}
