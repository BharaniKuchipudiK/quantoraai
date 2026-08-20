#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const SLA_MS = Number(process.env.QUANTORA_E2E_TURN_SLA_MS || 8000);

await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

let chatTurn = 0;

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
          {
            id: 'openai/gpt-4o-mini',
            name: 'Synthetic Fast Model',
            description: 'Synthetic browser gate model',
            provider: 'Synthetic',
            available: true,
            pricingKind: 'test',
          },
        ],
      }),
    });
  }

  if (path === '/api/chat') {
    chatTurn += 1;
    const firstReply = [
      'Let us start with your departure city.',
      '',
      '<quantora-modal>{"question":"Where are you departing from?","options":[{"id":"sin","title":"Singapore (SIN)","description":"Direct ~2.5 hrs","value":"Singapore (SIN)"},{"id":"kul","title":"Kuala Lumpur (KUL)","description":"Direct ~3 hrs","value":"Kuala Lumpur (KUL)"}]}</quantora-modal>',
    ].join('\n');
    const nextReply = 'Perfect. Singapore is locked in. What dates are you considering?';
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body: sseBody(chatTurn === 1 ? firstReply : nextReply),
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

async function assertVisible(locator, message) {
  await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) {
    throw new Error(message);
  }
}

async function studioDomain() {
  return page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const studioButton = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await assertVisible(studioButton, 'Studio navigation never became visible for the synthetic signed-in user.');
  await studioButton.click();

  await assertVisible(
    page.locator('[data-quantora-sidebar-profile]').first(),
    'Profile control is not anchored in the Studio sidebar above Feedback.',
  );
  await assertVisible(
    page.locator('[data-quantora-sidebar-canvas]').first(),
    'Canvas navigation is missing from the Studio sidebar.',
  );

  const globalHeader = page.locator('.app-header').first();
  if (await globalHeader.isVisible().catch(() => false)) {
    throw new Error('Global Studio/Journey/Quantum header is still consuming Studio vertical space.');
  }
  if (await page.getByRole('button', { name: 'Reset Chat', exact: true }).isVisible().catch(() => false)) {
    throw new Error('Redundant Reset Chat control is still visible.');
  }
  if ((await studioDomain()) !== '') {
    throw new Error('A fresh Studio session is not neutral before an advisor is selected.');
  }

  const travelAdvisor = page.getByText(/^(Travel Guide AI|Travel Advisor)$/i).first();
  await assertVisible(travelAdvisor, 'Travel specialist entry is missing from the Studio sidebar.');
  await travelAdvisor.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'travel');

  const travelHero = page.getByText(/Where should Quantora take you\?/i).first();
  await assertVisible(travelHero, 'Travel opened to a blank canvas instead of a specialist welcome.');

  const duplicateTravelHeading = page.locator('h2').filter({ hasText: /^Travel Advisor$/i }).first();
  if (await duplicateTravelHeading.isVisible().catch(() => false)) {
    throw new Error('Travel Advisor is redundantly repeated in a top banner.');
  }

  // Regression for the screenshot bug: global New Chat must clear the active
  // advisor rather than creating another Travel-scoped conversation.
  const newChat = page.getByRole('button', { name: 'New Chat', exact: true }).first();
  await assertVisible(newChat, 'Global New Chat is missing from Studio.');
  await newChat.click();
  await page.waitForFunction(() => (document.documentElement.dataset.quantoraDomain || '') === '');
  if (await travelHero.isVisible().catch(() => false)) {
    throw new Error('New Chat still renders the Travel specialist welcome instead of neutral Quantora.');
  }

  // Re-enter Travel and prove the normal journey remains intact after the shell
  // cleanup and session-domain reset.
  const travelAdvisorAgain = page.getByText(/^Travel Advisor$/i).first();
  await assertVisible(travelAdvisorAgain, 'Travel advisor disappeared after returning to neutral New Chat.');
  await travelAdvisorAgain.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'travel');
  await assertVisible(page.getByText(/Where should Quantora take you\?/i).first(), 'Travel did not restore its own scoped welcome after re-entry.');

  const textarea = page.locator('textarea').first();
  await assertVisible(textarea, 'Travel input is not visible.');

  await textarea.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], '', { type: 'image/png' }));
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: transfer });
    node.dispatchEvent(paste);
  });
  await assertVisible(
    page.getByText(/clipboard-image-\d+-1\.png/i).first(),
    'Pasting an image into the prompt did not create an image attachment.',
  );

  await textarea.fill('Help me plan a 3-night Bali beach trip');

  const turnStart = Date.now();
  await textarea.press('Enter');
  const question = page.getByText('Where are you departing from?', { exact: true }).first();
  await assertVisible(question, 'Travel turn did not render its next-step decision card.');
  const elapsed = Date.now() - turnStart;
  if (elapsed > SLA_MS) {
    throw new Error(`Travel synthetic turn exceeded SLA: ${elapsed}ms > ${SLA_MS}ms.`);
  }

  await page.getByText('Singapore (SIN)', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await assertVisible(page.getByText('Singapore (SIN)', { exact: true }).first(), 'Submitted Travel choice is not retained in history.');

  const kulOption = page.getByText('Kuala Lumpur (KUL)', { exact: true });
  if (await kulOption.isVisible().catch(() => false)) {
    throw new Error('Decision card stayed expanded after selection instead of collapsing to compact history.');
  }

  await assertVisible(
    page.getByText(/Singapore is locked in\. What dates are you considering\?/i).first(),
    'Travel did not proactively lead to the next material question.',
  );

  await screenshot('travel-release-gate-pass');
  console.log(`Travel browser release gate passed in ${elapsed}ms for first turn.`);
} catch (error) {
  await screenshot('travel-release-gate-failure').catch(() => {});
  console.error('Travel browser release gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
