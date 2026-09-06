#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { assertJourneyEntry } from './lib/parked-surfaces.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const SLA_MS = Number(process.env.QUANTORA_E2E_TURN_SLA_MS || 8000);

await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
let chatTurn = 0;
let flightHealCalls = 0;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Travel Gate', latencyMs: 25, modelId: 'synthetic', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          sub: 'synthetic-travel-user',
          name: 'Synthetic User',
          email: 'synthetic@quantora.test',
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
        models: [
          { id: 'synthetic-a', name: 'Synthetic A', description: 'Synthetic A', provider: 'Synthetic', available: true },
          { id: 'synthetic-b', name: 'Synthetic B', description: 'Synthetic B', provider: 'Synthetic', available: true },
        ],
      }),
    });
  }

  if (path === '/api/chat') {
    chatTurn += 1;
    let post = {};
    try {
      post = request.postDataJSON() || {};
    } catch {
      post = {};
    }
    const message = String(post.message || '');
    const turnAttempt = Number(post.turnAttempt) || 1;
    const firstReply = [
      'Let us start with your departure city.',
      '',
      '<quantora-modal>{"question":"Where are you departing from?","options":[{"id":"sin","title":"Singapore (SIN)","description":"Direct ~2.5 hrs","value":"Singapore (SIN)"},{"id":"kul","title":"Kuala Lumpur (KUL)","description":"Direct ~3 hrs","value":"Kuala Lumpur (KUL)"}]}</quantora-modal>',
    ].join('\n');
    const secondReply = 'Perfect. Singapore is locked in. What dates are you considering?';
    // Deliberately hostile regression fixture: even if a Travel response contains
    // runnable HTML, Travel must remain a chat-first workspace and must NOT open
    // the generic Code/Preview Canvas automatically.
    const codeAttemptReply = [
      'Here is the trip summary. The Travel workspace must stay in chat.',
      '',
      '```html',
      '<html><body><h1>This must never auto-open in Travel</h1></body></html>',
      '```',
    ].join('\n');
    const flightHealReply = 'Fallback path recovered. SIN to DPS on 2026-09-12: sample fare $210 on Fallback Air. I will not invent extra options.';

    // After the first three Travel fixtures, the next chat turn is the mocked
    // flight provider failure. A retryable tool error must self-heal once.
    if (chatTurn >= 4 || /SIN to DPS on 2026-09-12/i.test(message)) {
      flightHealCalls += 1;
      if (flightHealCalls < 2) {
        return route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
          },
          body: [
            `data: ${JSON.stringify({ status: { phase: 'tool', state: 'cleared', tool: 'search_flights' } })}`,
            `data: ${JSON.stringify({
              error: {
                message: 'Live flight lookup failed. Trying once more…',
                code: 'TRAVEL_FLIGHT_PROVIDER',
                retryable: true,
              },
            })}`,
            'data: [DONE]',
            '',
          ].join('\n\n'),
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
        body: sseBody(flightHealReply),
      });
    }

    const reply = chatTurn === 1 ? firstReply : chatTurn === 2 ? secondReply : codeAttemptReply;
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body: sseBody(reply),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

async function screenshot(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

async function visible(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

async function anyVisible(locator, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await page.waitForTimeout(50);
  } while (Date.now() < deadline);
  return null;
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  await hidden(page.locator('[data-quantora-sidebar-canvas]').first(), 'Duplicate Canvas leaked into neutral Studio.');
  await hidden(page.locator('[data-quantora-sidebar-profile]').first(), 'Duplicate Profile leaked into neutral Studio.');
  await assertJourneyEntry(page, visible, 'neutral Studio');
  await visible(page.locator('button[aria-controls="quantora-profile-menu"]').first(), 'Global Profile control is missing from neutral Studio.');

  const travelAdvisor = page.locator('[data-quantora-advisor="travel"]').first();
  await visible(travelAdvisor, 'Travel specialist entry is missing.');
  await travelAdvisor.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'travel');

  const travelHero = await anyVisible(page.getByText(/Where should Quantora take you\?/i));
  if (!travelHero) throw new Error('Travel did not open its specialist welcome.');

  await hidden(
    page.locator('[data-quantora-sidebar-canvas]').first(),
    'Duplicate Canvas navigation is visible inside Travel.',
  );
  await hidden(
    page.locator('[data-quantora-sidebar-profile]').first(),
    'Duplicate Profile navigation is visible inside Travel.',
  );
  await hidden(
    page.locator('[data-quantora-fork-chat]').first(),
    'Fork Chat is still incorrectly pinned to the top of Travel.',
  );

  // Dual Arena is intentionally hidden across all workspaces now — assert its absence.
  await hidden(page.locator('[data-quantora-dual-arena]').first(), 'Dual Arena should be hidden in Travel.');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Travel prompt input is missing.');

  await textarea.fill('One line');
  await page.waitForTimeout(120); // let the auto-resize effect settle before measuring
  const oneLineHeight = await textarea.evaluate((node) => node.getBoundingClientRect().height);
  await textarea.fill(Array.from({ length: 14 }, (_, index) => `Line ${index + 1} of a deliberately longer travel prompt`).join('\n'));
  await page.waitForTimeout(200); // the max-height clamp applies on the next frames, not synchronously with fill()
  const multiLineHeight = await textarea.evaluate((node) => node.getBoundingClientRect().height);
  if (!(multiLineHeight > oneLineHeight) || multiLineHeight > 176) {
    throw new Error(`Travel composer sizing regressed (${oneLineHeight}px → ${multiLineHeight}px).`);
  }

  await textarea.fill('Help me plan a 3-night Bali beach trip');
  const turnStart = Date.now();
  await textarea.press('Enter');
  await visible(page.getByText('Where are you departing from?', { exact: true }).first(), 'Travel did not render its next-step decision card.');
  const elapsed = Date.now() - turnStart;
  if (elapsed > SLA_MS) throw new Error(`Travel synthetic turn exceeded SLA: ${elapsed}ms > ${SLA_MS}ms.`);

  const firstFork = page.locator('[data-quantora-message-fork="true"]').last();
  await visible(firstFork, 'Fork Chat is not present below the Travel assistant response.');
  await hidden(page.locator('button[title="More"]').first(), 'Legacy three-dot response overflow is still visible in Travel.');

  await page.getByText('Singapore (SIN)', { exact: true }).first().click();
  await hidden(
    page.getByRole('button', { name: 'Submit', exact: true }).first(),
    'The trip decision card stayed on screen after an answer.',
  );
  await visible(page.getByText(/Singapore is locked in\. What dates are you considering\?/i).first(), 'Travel did not continue after the decision selection.');

  // The critical regression fixture: runnable code arrives while Travel is active.
  await textarea.fill('Show me a simple visual for this trip');
  await textarea.press('Enter');
  await visible(page.getByText(/Travel workspace must stay in chat/i).first(), 'Synthetic Travel code-attempt response did not complete.');
  await page.waitForTimeout(350);

  await hidden(
    page.locator('[data-quantora-code-workspace="true"]').first(),
    'Travel auto-opened the generic Code/Preview workspace.',
  );
  await hidden(
    page.getByText('Live Preview', { exact: true }).first(),
    'Travel exposed a Live Preview Canvas after a normal travel response.',
  );
  await hidden(
    page.locator('[data-quantora-sidebar-canvas]').first(),
    'Duplicate Canvas navigation reappeared during the Travel conversation.',
  );

  const visiblePreviewTabs = await page.locator('[data-quantora-code-workspace="true"] button').filter({ hasText: /^Preview$/ }).count();
  if (visiblePreviewTabs > 0 && await page.locator('[data-quantora-code-workspace="true"]').first().isVisible().catch(() => false)) {
    throw new Error('A Preview/code panel remained visible in Travel.');
  }

  // Mocked provider failure must self-heal once on Travel, then land a real answer.
  await textarea.fill('Flights SIN to DPS on 2026-09-12');
  await textarea.press('Enter');
  await page.waitForFunction(
    () => /Fallback path recovered\. SIN to DPS on 2026-09-12/i.test(document.body?.innerText || ''),
    null,
    { timeout: 20_000 },
  );
  if (flightHealCalls < 2) {
    throw new Error(`Travel flight self-heal never retried the tool turn (calls=${flightHealCalls}).`);
  }

  await screenshot('travel-release-gate-pass');
  console.log(`Travel browser release gate passed in ${elapsed}ms for first turn; generic code Canvas remained closed; flight provider self-heal recovered.`);
} catch (error) {
  await screenshot('travel-release-gate-failure').catch(() => {});
  console.error('Travel browser release gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
