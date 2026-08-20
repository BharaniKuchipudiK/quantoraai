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

  if (path === '/api/youtube-validate') {
    const id = url.searchParams.get('id');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(id === 'synthetic123'
        ? { valid: true, id, title: 'Synthetic learning video', authorName: 'Synthetic Teacher' }
        : { valid: false, id: id || '', reason: 'unavailable' }),
    });
  }

  if (path === '/api/chat') {
    chatTurn += 1;
    const firstReply = [
      'Let us start with your departure city.',
      '',
      '<quantora-modal>{"question":"Where are you departing from?","options":[{"id":"sin","title":"Singapore (SIN)","description":"Direct ~2.5 hrs","value":"Singapore (SIN)"},{"id":"kul","title":"Kuala Lumpur (KUL)","description":"Direct ~3 hrs","value":"Kuala Lumpur (KUL)"}]}</quantora-modal>',
    ].join('\n');
    const secondReply = 'Perfect. Singapore is locked in. What dates are you considering?';
    const canvasReply = [
      'Here is a simple visual workspace for the trip.',
      '',
      '[Synthetic learning video](https://www.youtube.com/watch?v=synthetic123)',
      '',
      '```html',
      '<html><body style="font-family:sans-serif;padding:32px"><h1>Bali trip visual</h1><p>Singapore → Bali</p></body></html>',
      '```',
    ].join('\n');
    const reply = chatTurn === 1 ? firstReply : chatTurn === 2 ? secondReply : canvasReply;
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

async function assertVisible(locator, message) {
  await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) {
    throw new Error(message);
  }
}

async function firstVisible(locator, timeout = 5000) {
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

async function assertAnyVisible(locator, message) {
  const visible = await firstVisible(locator);
  if (!visible) throw new Error(message);
  return visible;
}

async function assertHidden(locator, message) {
  if (await locator.isVisible().catch(() => false)) {
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

  const collapseSidebar = page.locator('button[title="Collapse sidebar"]').first();
  await assertVisible(collapseSidebar, 'Sidebar collapse control is missing.');
  await collapseSidebar.click();
  const restoreSidebar = page.locator('[data-quantora-sidebar-restore]').first();
  await assertVisible(restoreSidebar, 'Collapsed sidebar has no persistent restore/navigation control.');
  await restoreSidebar.click();
  await assertVisible(page.locator('[data-quantora-sidebar-profile]').first(), 'Sidebar did not restore after using the persistent navigation handle.');

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

  // React/session transitions can briefly leave a hidden stale specialist hero in
  // the DOM while the visible landing is mounted. Assert against the visible
  // match instead of assuming the first text match is the active surface.
  const travelHeroMatches = page.getByText(/Where should Quantora take you\?/i);
  const travelHero = await assertAnyVisible(travelHeroMatches, 'Travel opened to a blank canvas instead of a specialist welcome.');

  const duplicateTravelHeading = page.locator('h2').filter({ hasText: /^Travel Advisor$/i }).first();
  if (await duplicateTravelHeading.isVisible().catch(() => false)) {
    throw new Error('Travel Advisor is redundantly repeated in a top banner.');
  }

  await assertHidden(
    page.locator('button[title="Select AI Engine"]').first(),
    'Model/engine selector is visible inside an Agentic Workspace.',
  );
  await assertHidden(
    page.locator('button[title="Compare two AI models side-by-side in real time"]').first(),
    'Dual-model Arena is visible inside an Agentic Workspace.',
  );
  await assertHidden(
    page.locator('button[title="Tools Menu"]').first(),
    'Generic Studio tools picker is visible inside an Agentic Workspace.',
  );

  // Regression for the screenshot bug: global New Chat must clear the active
  // advisor rather than creating another Travel-scoped conversation.
  const newChat = page.getByRole('button', { name: 'New Chat', exact: true }).first();
  await assertVisible(newChat, 'Global New Chat is missing from Studio.');
  await newChat.click();
  await page.waitForFunction(() => (document.documentElement.dataset.quantoraDomain || '') === '');
  // Domain state is authoritative and flips synchronously; the specialist hero
  // presentation is removed on the next animation frame. Wait for that visual
  // transition rather than treating a single-frame stale hero as sticky state.
  await travelHero.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  if (await travelHero.isVisible().catch(() => false)) {
    throw new Error('New Chat still renders the Travel specialist welcome instead of neutral Quantora.');
  }

  // Re-enter Travel and prove the normal journey remains intact after the shell
  // cleanup and session-domain reset.
  const travelAdvisorAgain = page.getByText(/^Travel Advisor$/i).first();
  await assertVisible(travelAdvisorAgain, 'Travel advisor disappeared after returning to neutral New Chat.');
  await travelAdvisorAgain.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'travel');
  await assertAnyVisible(page.getByText(/Where should Quantora take you\?/i), 'Travel did not restore its own scoped welcome after re-entry.');

  const textarea = page.locator('textarea').first();
  await assertVisible(textarea, 'Travel input is not visible.');

  // Composer should grow with text but stay bounded in a narrow Agentic Workspace.
  await textarea.fill('One line');
  const oneLineHeight = await textarea.evaluate((node) => node.getBoundingClientRect().height);
  await textarea.fill(Array.from({ length: 14 }, (_, index) => `Line ${index + 1} of a deliberately longer travel prompt`).join('\n'));
  const multiLineHeight = await textarea.evaluate((node) => node.getBoundingClientRect().height);
  if (!(multiLineHeight > oneLineHeight)) {
    throw new Error(`Prompt composer did not grow with content (${oneLineHeight}px → ${multiLineHeight}px).`);
  }
  if (multiLineHeight > 176) {
    throw new Error(`Prompt composer exceeded Agentic Workspace height cap: ${multiLineHeight}px.`);
  }
  await textarea.fill('');

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

  // A generated visual may open the right-side Canvas, but Agentic Workspaces
  // must not turn into developer deployment consoles.
  await textarea.fill('Show me a simple visual for this trip');
  await textarea.press('Enter');
  await assertVisible(page.getByText('Live Preview', { exact: true }).first(), 'Generated visual did not open the split Canvas.');
  await assertHidden(page.locator('button[title="Publish to Vercel"]').first(), 'Publish is visible by default in an Agentic Workspace Canvas.');
  await assertHidden(page.locator('button[title^="Copy a shareable preview link"]').first(), 'Share link is visible by default in an Agentic Workspace Canvas.');
  await assertHidden(page.locator('[data-quantora-canvas-device-switcher="true"]').first(), 'Device-emulation controls are visible in an Agentic Workspace Canvas.');

  const expandCanvas = page.locator('[data-quantora-canvas-fullscreen-button="true"]').first();
  await assertVisible(expandCanvas, 'Canvas expand/full-screen control is missing.');
  await expandCanvas.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraCanvasFullscreen === 'true');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.dataset.quantoraCanvasFullscreen !== 'true');

  const youtubeLink = page.getByRole('link', { name: 'Synthetic learning video', exact: true }).first();
  await assertVisible(youtubeLink, 'Verified YouTube recommendation is not rendered as a clickable source link.');
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('.markdown-prose a')]
      .find((node) => node.textContent?.trim() === 'Synthetic learning video');
    return link?.dataset.quantoraYoutubeValidation === 'valid';
  });
  const playVideo = page.locator('[data-quantora-youtube-play]').first();
  await assertVisible(playVideo, 'YouTube recommendation does not expose an in-Quantora Play action.');
  await assertHidden(page.locator('[data-quantora-youtube-watch]').first(), 'Legacy Watch action is still visible beside the verified Play control.');
  await playVideo.click();
  await assertVisible(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Play action did not open the video inside the current Quantora session.');
  await page.keyboard.press('Escape');
  await assertHidden(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Esc did not close the in-workspace media player.');

  await screenshot('travel-release-gate-pass');
  console.log(`Travel browser release gate passed in ${elapsed}ms for first turn.`);
} catch (error) {
  await screenshot('travel-release-gate-failure').catch(() => {});
  console.error('Travel browser release gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}