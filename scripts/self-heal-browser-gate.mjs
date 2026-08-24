#!/usr/bin/env node
/**
 * A failed turn used to end the conversation and lie about it.
 *
 * The server already labels a failure `retryable`, and a build-contract failure
 * even says "retry and I will rebuild" — but the desk read neither, so it parked
 * a dead message and waited for the person to nurse it. Worse, the mission card
 * kept announcing "Building: <goal>" above the wreck, so the screen showed work
 * in progress and a failure at the same time.
 *
 * This gate makes the first route fail for real and proves the desk rescues the
 * turn by itself, then makes recovery impossible and proves the desk admits it
 * once, without the phantom build card.
 */
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const HEALED_ANSWER = 'Recovered on the second route and finished the answer.';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

let chatCalls = 0;
let recoveryAllowed = true;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Heal Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
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
          sub: 'synthetic-heal-user',
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
    chatCalls += 1;
    if (!recoveryAllowed) {
      // The exact shape of the screenshot: a 500 the server will not call retryable.
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Quantora could not complete this request.' }),
      });
    }
    if (chatCalls === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Quantora could not reach a healthy AI route for this turn.', retryable: true }),
      });
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(HEALED_ANSWER),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

const bodyText = () => page.locator('body').innerText();

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await prompt.waitFor({ state: 'visible', timeout: 10_000 });
  await prompt.fill('Explain two tradeoffs when choosing a database for a small team app');
  await prompt.press('Enter');

  await page.waitForFunction(
    (answer) => [...document.querySelectorAll('.markdown-prose')]
      .some((node) => node.textContent?.includes(answer)),
    HEALED_ANSWER,
    { timeout: 30_000 },
  );

  if (chatCalls < 2) {
    throw new Error('The desk never made a second attempt, so nothing healed itself.');
  }

  const healedText = await bodyText();
  if (/Request failed/i.test(healedText) || /That turn did not finish/i.test(healedText)) {
    throw new Error('A failure the desk recovered from is still being reported to the reader.');
  }

  // The card must be alive here, otherwise its absence later proves nothing.
  if (!(await page.locator('[data-quantora-mission="true"]').count())) {
    throw new Error('No mission card after a healthy turn, so this gate cannot prove it disappears on failure.');
  }

  recoveryAllowed = false;
  await prompt.fill('Now add scheduled cleanup runs');
  await prompt.press('Enter');

  await page.waitForFunction(
    () => /That turn did not finish/i.test(document.body.innerText),
    null,
    { timeout: 30_000 },
  );

  const missionCards = await page.locator('[data-quantora-mission="true"]').count();
  if (missionCards) {
    const card = await page.locator('[data-quantora-mission="true"]').first().innerText();
    throw new Error(`The desk still claims work is under way after a dead turn: ${card.replace(/\s+/g, ' ').trim()}`);
  }

  const failedText = await bodyText();
  const admissions = (failedText.match(/That turn did not finish/gi) || []).length;
  if (admissions !== 1) {
    throw new Error(`A dead turn should be reported exactly once, saw ${admissions} times.`);
  }

  console.log(`Self-heal browser gate passed. Turn healed after ${chatCalls} attempts; no phantom build card on the dead turn.`);
} catch (error) {
  console.error('Self-heal browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
