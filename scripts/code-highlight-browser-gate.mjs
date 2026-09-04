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

/*
 * THE BYTE BUDGET IS THE BACKSTOP. THE PRECISE CHECK IS ABOVE IT.
 *
 * A highlighter shipping again is caught exactly, by counting span.token in the
 * chat feed — that check names the thing and cannot be satisfied by accident.
 * This budget is the second line: weight arriving that the token count would
 * not see.
 *
 * RE-BASELINED 2026-09-04, and here is the measurement that forced it. The
 * budget was 300_000 and the desk had reached:
 *
 *   298_156 bytes gzip  before that day's changes
 *   299_117 bytes gzip  after them
 *
 * 1_844 bytes of headroom out of 300_000 — 0.6%. A budget with that margin
 * does not measure "a library came back"; it measures "somebody edited a
 * component". It had silently become a no-growth rule that nobody chose, and
 * §5 is explicit that a blocking gate firing on ambiguous evidence is one the
 * next person mutes under pressure.
 *
 * The headroom is now stated rather than incidental. Prism cost 214 KB gzipped
 * — the incident this whole file exists for — so 40 KB catches it five times
 * over while ignoring the ~1 KB that an ordinary feature adds.
 */
const DESK_ENTRY_BUDGET_BYTES = 340_000;
/*
 * And the drift itself is now a failure.
 *
 * The budget above was fine when it was written and became meaningless without
 * anyone deciding that. So when the desk creeps back inside this margin the
 * gate says SO, by name, instead of quietly turning into a no-growth rule
 * again. Re-baselining is then a deliberate act with a number attached, which
 * is the only kind worth trusting.
 */
const DESK_ENTRY_MIN_HEADROOM_BYTES = 20_000;
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

  const headroom = DESK_ENTRY_BUDGET_BYTES - heaviest.bytes;
  if (headroom < DESK_ENTRY_MIN_HEADROOM_BYTES) {
    throw new Error(
      `Desk entry chunk ${heaviest.name} is ${heaviest.bytes} bytes, leaving only ${headroom} bytes under the ${DESK_ENTRY_BUDGET_BYTES} budget `
      + `(minimum ${DESK_ENTRY_MIN_HEADROOM_BYTES}). The budget still PASSES, but it no longer tells a returning library from an ordinary feature — `
      + 'which is how it last became a no-growth rule nobody chose. Either give the desk weight back, or re-baseline both numbers deliberately '
      + 'and say in the commit what the new headroom is for.',
    );
  }

  console.log(
    `Code payload browser gate passed. Desk entry ${heaviest.name} = ${heaviest.bytes} bytes, `
    + `${headroom} under the ${DESK_ENTRY_BUDGET_BYTES} budget.`,
  );
} catch (error) {
  console.error('Code payload browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
