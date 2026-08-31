#!/usr/bin/env node
/**
 * Desk rail smoke: the desk mounts clean, and every rail button stays pressed.
 *
 * WHY THIS EXISTS
 *
 * Six runtime defects reached main in one session and every one of them passed
 * the unit suite, tsc and eslint. Four were a ReferenceError or a hook-order
 * violation that killed the desk on mount; one made the Terminal and Git
 * buttons open their pane and then bounce straight back to Preview.
 *
 * Nothing here was covered directly. The bounce was caught only because
 * desk-diff-review happens to click Git as step one of a much longer journey,
 * and it reported "Git pane did not open" — true, but three steps from the
 * cause. The mount crashes were caught by a human loading the page.
 *
 * So this gate does two things nothing else does, and nothing else:
 *
 *   1. Watches for pageerror and console errors across the whole desk mount.
 *      A component that throws while rendering takes the workspace with it,
 *      and that is invisible to every test that runs in Node.
 *
 *   2. Clicks each rail control and asserts it is pressed — then waits and
 *      asserts it is STILL pressed. The dead-button bug set the active pane
 *      correctly and had it reverted by an effect on the next tick, so a
 *      single check immediately after the click would have passed. The second
 *      look is the whole point.
 *
 * Deliberately narrow. It does not build anything, run a model turn, or assert
 * pane contents — the existing gates cover those, and this one is meant to be
 * a few seconds that say whether the desk is alive at all.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
mkdirSync('artifacts/e2e', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  // Third-party asset failures are not this gate's business: it is asking
  // whether our own code ran, not whether someone else's CDN answered.
  if (/favicon|fonts\.googleapis|ui-avatars|youtube|Failed to load resource/i.test(message.text())) return;
  runtimeErrors.push(`console: ${message.text()}`);
});

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { sub: 'rail-smoke-user', name: 'Rail User', email: 'rail@quantora.test', picture: null, isAdmin: false },
      }),
    });
  }
  if (path === '/api/models') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

/*
 * Every failure carries what the page threw, because the symptom is rarely the
 * cause. A component that throws while rendering leaves its container missing,
 * and "the rail is missing" sends the reader looking at the rail instead of at
 * the stack that explains it.
 */
function fail(message) {
  const detail = runtimeErrors.length ? `\n\nRuntime errors on the page:\n${runtimeErrors.join('\n')}` : '';
  throw new Error(`${message}${detail}`);
}

const railButton = (id) => page.locator(`[data-quantora-desk-rail="${id}"]`).first();
const isPressed = async (id) => (await railButton(id).getAttribute('data-quantora-desk-rail-active')) === 'true';

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  const workspace = page.locator('[data-quantora-code-workspace="true"]').first();
  await workspace.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (!(await workspace.isVisible().catch(() => false))) {
    fail('Coding desk did not mount.');
  }

  const rail = page.locator('[data-quantora-desk-activity-rail="true"]').first();
  await rail.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (!(await rail.isVisible().catch(() => false))) fail('Desk activity rail is missing.');

  for (const id of ['terminal', 'git', 'preview']) {
    const button = railButton(id);
    if (!(await button.isVisible().catch(() => false))) fail(`Rail control "${id}" is missing.`);

    await button.click();
    if (!(await isPressed(id))) {
      fail(`Rail control "${id}" did not become active when clicked.`);
    }

    // The second look. A click that lands and is then reverted by an effect on
    // the next tick reads as success to anything that only checks once.
    await page.waitForTimeout(600);
    if (!(await isPressed(id))) {
      fail(`Rail control "${id}" opened and then reverted — the desk changed the active pane back on its own.`);
    }
  }

  if (runtimeErrors.length) {
    fail('Desk reached the end of the smoke run, but the page reported errors.');
  }

  await page.screenshot({ path: 'artifacts/e2e/desk-rail-smoke.png', fullPage: true });
  console.log('Desk rail smoke gate passed. Desk mounted with no runtime errors; terminal, git and preview each stayed active.');
} catch (error) {
  console.error(`Desk rail smoke gate FAILED: ${error?.stack || error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
