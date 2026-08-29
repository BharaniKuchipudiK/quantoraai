#!/usr/bin/env node
/**
 * The Finance workspace had no end-to-end proof of any kind.
 *
 * WHY THIS EXISTS
 *
 * Finance shipped a chip launcher, four capability claims and a set of
 * deterministic gateways, and nothing anywhere ran the workspace and looked at
 * it. That is how it came to advertise a "Portfolio" it could not read: no gate
 * opened the door to check what was behind it.
 *
 * It matters more than usual here. A Finance answer is about somebody's money,
 * and the workspace's own words are "every answer is computed and cited, never
 * guessed". An unproven claim like that is worse than no claim.
 *
 * WHAT THIS PROVES
 *
 * The launcher reaches the gateways, a grounded answer keeps its citation, and
 * — the one that matters — a REFUSAL survives to the screen. A desk that
 * quietly replaced "I don't have a recent enough rate" with a plausible number
 * would be the single worst thing this workspace could do, and it is exactly
 * what no unit test can see.
 */
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { FINANCE_ACTIONS } from '../src/lib/finance-board-brief.js';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

const GROUNDED_ANSWER = [
  '**1,000 USD = 1,342.70 SGD**',
  '',
  'Rate 1.3427, ECB reference for 2026-08-28. Source: European Central Bank.',
].join('\n');

const REFUSAL = [
  'I will not convert that.',
  '',
  'The most recent stored rate is from 2026-08-14, which is outside the four-day',
  'freshness window. A number I made up would look exactly like a real one.',
].join('\n');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
let chatTurn = 0;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Finance Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

async function visible(locator, message) {
  try {
    await locator.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    throw new Error(message);
  }
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
          sub: 'synthetic-finance-user',
          name: 'Synthetic Saver',
          email: 'saver@quantora.test',
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
    chatTurn += 1;
    // Turn 1 is a grounded conversion; turn 2 is the gateway refusing stale data.
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(chatTurn === 1 ? GROUNDED_ANSWER : REFUSAL),
    });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const advisor = page.locator('[data-quantora-advisor="finance"]').first();
  await visible(advisor, 'Finance Advisor is missing from the sidebar.');
  await advisor.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'finance');

  const textarea = page.locator('textarea').first();
  await visible(textarea, 'Finance workspace has no composer.');
  await textarea.fill('Convert 1,000 USD to SGD');
  await textarea.press('Enter');

  await visible(
    page.getByText('1,342.70 SGD', { exact: false }).first(),
    'Finance did not render the grounded conversion.',
  );
  /*
   * The citation is the whole product here. A number without its rate, date and
   * source is indistinguishable from a guess, which is the thing this workspace
   * promises it never does.
   */
  await visible(
    page.getByText('European Central Bank', { exact: false }).first(),
    'Finance rendered a converted amount with no source — an uncited number is a guess.',
  );
  await visible(
    page.getByText('2026-08-28', { exact: false }).first(),
    'Finance rendered a rate with no as-of date.',
  );

  const board = page.locator('[data-quantora-finance-board="true"]').first();
  await visible(board, 'Finance answered but showed no desk.');
  for (const action of FINANCE_ACTIONS) {
    await visible(
      board.locator(`[data-quantora-finance-action="${action.id}"]`).first(),
      `Finance desk is missing its ${action.label} action.`,
    );
  }

  // The desk is a launcher: a chip must land an EDITABLE prompt in the composer,
  // not silently send one. The user swaps in their own numbers.
  await board.locator('[data-quantora-finance-action="debt"]').first().click();
  const composed = await textarea.inputValue();
  if (!composed.includes('19.99%')) {
    throw new Error(`Finance chip did not load its editable example into the composer (got: ${composed || 'empty'}).`);
  }

  // The one that matters most: a refusal must reach the screen intact.
  await textarea.fill('Convert 500 EUR to GBP');
  await textarea.press('Enter');
  await visible(
    page.getByText('I will not convert that', { exact: false }).first(),
    'Finance swallowed a gateway refusal — a stale-rate refusal must never be replaced by a plausible number.',
  );
  await visible(
    page.getByText('outside the four-day', { exact: false }).first(),
    'Finance showed a refusal without saying why it refused.',
  );

  console.log('Finance browser gate passed.');
} catch (error) {
  console.error(`Finance browser gate FAILED: ${error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
