#!/usr/bin/env node
/**
 * "Review this" must patch the running desk, not write an essay.
 *
 * A boutique can ship a dead Add to Cart next to a working photo. Review
 * applies the deterministic shop inject first (one HTML file), then the
 * bag must increment. A passing photos probe must stay passing.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

const boutiqueReply = [
  'Here is the boutique.',
  '',
  '```json filepath="products.json"',
  '[{"id":"silk","name":"Kanjeevaram Silk","priceCents":1800000,"currency":"inr"}]',
  '```',
  '',
  '```html filepath="index.html"',
  '<!DOCTYPE html><html><body><header>Aaranya</header><main><label>Currency <select id="quantora-currency"><option>INR</option><option>USD</option></select></label><div class="product-card"><img src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80" alt="Silk"><p>Kanjeevaram</p><span class="price">INR 18000</span><button type="button">Add to Cart</button></div></main></body></html>',
  '```',
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Desk Review', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'desk-review-patch-user', name: 'Review Patcher', email: 'review-patch@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/chat') {
    const message = String(request.postDataJSON?.()?.message || '');
    const reply = /review/i.test(message)
      ? 'Reviewed the running Preview. Failed checks are on the Review rail.'
      : boutiqueReply;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 12_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function visibleFrame(selector, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const node = frame.locator(selector).first();
      if (await node.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Build a Kanjeevaram saree boutique');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  const boutiqueFrame = await visibleFrame('.product-card', 20_000);
  if (!boutiqueFrame) throw new Error('Boutique Preview never rendered.');
  await visible(boutiqueFrame.locator('button').filter({ hasText: /add to cart/i }).first(), 'Boutique is missing Add to Cart.', 12_000);
  await visible(
    page.locator('[data-quantora-desk-probe="photos"][data-quantora-desk-probe-ok="true"]').first(),
    'Photos must already be a passing probe before Review this.',
    15_000,
  );

  await prompt.fill('Review this');
  await prompt.press('Enter');
  await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).first().click().catch(() => {});

  await visible(page.locator('[data-quantora-desk-probes="true"]').first(), 'Review this did not keep Preview checks.', 12_000);
  await visible(page.locator('[data-quantora-desk-next="true"], [data-quantora-desk-probes="true"]').first(), 'Review this did not show the next beat or probe rail.', 8_000);

  await visible(
    page.locator('[data-quantora-desk-probe="cart-click"][data-quantora-desk-probe-ok="true"]').first(),
    'Review this did not turn a dead Add to Cart into a working click.',
    15_000,
  );
  await visible(
    page.locator('[data-quantora-desk-probe="photos"][data-quantora-desk-probe-ok="true"]').first(),
    'Review this regressed a passing photos probe.',
    // After "Review this" the desk re-applies the patch and re-decodes the proxied
    // photo, so the probe briefly flips not-ok before settling back. Give it the
    // same window as the cart-click assertion above (15s) so a slow CI re-decode
    // is not mistaken for a real regression — the 8s window flaked under load.
    15_000,
  );

  const reviewed = await visibleFrame('.product-card', 12_000);
  if (!reviewed) throw new Error('Preview stopped running after Review this.');
  await reviewed.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find((node) => /add to (bag|cart)/i.test(node.textContent || ''));
    btn?.click();
  });
  await visible(
    reviewed.locator('[data-quantora-bag="true"], button').filter({ hasText: /^Bag\s+[1-9]/ }).first(),
    'Add to Cart is on Preview but the bag did not increment after Review this.',
    12_000,
  );

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-review-patch.png', fullPage: true });
  console.log('Desk review patch browser gate passed. Dead Add to Cart became a working click; photos stayed passing.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/desk-review-patch-failure.png', fullPage: true }).catch(() => {});
  console.error('Desk review patch browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
