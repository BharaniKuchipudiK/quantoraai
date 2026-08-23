#!/usr/bin/env node
/**
 * Two things that used to fight each other, held together here.
 *
 * Chat strips every fenced block so code lands in Preview instead — that is the
 * product rule. Because of it, a syntax highlighter could never render, yet the
 * desk downloaded a full Prism (214 KB gzipped, about half its payload) anyway.
 *
 * This gate watches a fenced answer arrive, proves the code stays out of chat,
 * and proves the desk is not quietly paying for a highlighter again.
 */
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
// Compressed transfer size. The desk sat at ~457 KB with Prism inlined and
// ~237 KB without it, so this trips well before that weight can return.
const DESK_ENTRY_BUDGET_BYTES = 300_000;
const SNIPPET = 'const total = items.reduce((sum, item) => sum + item.price, 0);';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Highlight Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          sub: 'synthetic-highlight-user',
          name: 'Synthetic Reader',
          email: 'reader@quantora.test',
          picture: null,
          isAdmin: false,
        },
      }),
    });
  }

  if (path === '/api/models') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }],
      }),
    });
  }

  if (path === '/api/chat') {
    const reply = ['Reading a short snippet:', '', '```javascript', SNIPPET, '```'].join('\n');
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await prompt.fill('Explain what this reduce snippet does');
  await prompt.press('Enter');

  await page.waitForFunction(
    () => [...document.querySelectorAll('.markdown-prose')]
      .some((node) => node.textContent?.includes('Reading a short snippet')),
    null,
    { timeout: 20_000 },
  );

  if (await page.getByText(SNIPPET, { exact: false }).count()) {
    throw new Error('Fenced code reached the chat feed; it belongs in Preview.');
  }

  const highlighted = await page.locator('span.token').count();
  if (highlighted) {
    throw new Error(`Chat rendered ${highlighted} highlighted code tokens, so a highlighter is shipping again.`);
  }

  const deskEntry = await page.evaluate(() => performance
    .getEntriesByType('resource')
    .filter((entry) => /\/assets\/AiStudio-[^/]*\.js$/.test(entry.name))
    .map((entry) => ({ name: entry.name.split('/').pop(), bytes: entry.encodedBodySize })));

  if (!deskEntry.length) throw new Error('Desk entry chunk never loaded, so its weight could not be checked.');
  const heaviest = deskEntry.sort((a, b) => b.bytes - a.bytes)[0];
  if (heaviest.bytes > DESK_ENTRY_BUDGET_BYTES) {
    throw new Error(`Desk entry chunk ${heaviest.name} is ${heaviest.bytes} bytes, over the ${DESK_ENTRY_BUDGET_BYTES} budget.`);
  }

  console.log(`Code payload browser gate passed. Desk entry ${heaviest.name} = ${heaviest.bytes} bytes.`);
} catch (error) {
  console.error('Code payload browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
