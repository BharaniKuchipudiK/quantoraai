#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const VALID_VIDEO_ID = 'studyvalid123';
const DEAD_VIDEO_ID = 'studydead123';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Study Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  // Regression contract: a user's neutral-Studio welcome preference must never
  // suppress a specialist workspace's own welcome/capability surface.
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
          sub: 'synthetic-study-user',
          name: 'Synthetic Student',
          email: 'student@quantora.test',
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
          { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
          { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
        ],
      }),
    });
  }

  if (path === '/api/youtube-validate') {
    const id = url.searchParams.get('id');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(id === VALID_VIDEO_ID
        ? { valid: true, id, title: 'Verified Study lesson', authorName: 'Synthetic Teacher' }
        : { valid: false, id: id || '', reason: 'unavailable' }),
    });
  }

  if (path === '/api/chat') {
    const reply = [
      'Here is one verified lesson and one intentionally unavailable fixture:',
      '',
      `- [Verified Study lesson](https://www.youtube.com/watch?v=${VALID_VIDEO_ID}) — watch this inside Quantora.`,
      `- [Dead Study lesson](https://www.youtube.com/watch?v=${DEAD_VIDEO_ID}) — this must never be offered.`,
    ].join('\n');
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

async function visible(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  await hidden(
    page.locator('[data-quantora-sidebar-canvas]').first(),
    'Generic developer Canvas navigation leaked into Study.',
  );
  await visible(page.locator('[data-quantora-workspace-capabilities="education"]').first(), 'Study capability surface is missing.');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');
  await textarea.fill("Teach me Newton's laws and give me one useful video lesson");
  await textarea.press('Enter');

  const validLink = page.getByRole('link', { name: 'Verified Study lesson', exact: true }).first();
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('.markdown-prose a')]
      .find((node) => node.textContent?.trim() === 'Verified Study lesson');
    const play = link?.nextElementSibling;
    return link?.dataset.quantoraYoutubeValidation === 'valid'
      && link.hidden === false
      && play?.dataset.quantoraYoutubePlay === 'true'
      && play.hidden === false
      && play.disabled === false;
  });
  await visible(validLink, 'Study did not render the verified video after validation.');

  const deadLink = page.getByRole('link', { name: 'Dead Study lesson', exact: true }).first();
  await deadLink.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await deadLink.count()) throw new Error('Study kept an unavailable YouTube recommendation in the answer.');

  const play = page.locator('a[data-quantora-youtube-validation="valid"] + button[data-quantora-youtube-play="true"]').first();
  await visible(play, 'Study verified video has no usable Play action.');

  const pagesBeforeTitle = context.pages().length;
  await validLink.click();
  const mediaCanvas = page.locator('[data-quantora-media-canvas="youtube"]').first();
  await visible(mediaCanvas, 'Study video title did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforeTitle) throw new Error('Study video title opened a new browser tab.');
  await visible(mediaCanvas.getByText('Open on YouTube ↗', { exact: true }), 'Study Canvas has no explicit external YouTube action.');

  await page.keyboard.press('Escape');
  await hidden(mediaCanvas, 'Escape did not close the Study media Canvas.');

  const pagesBeforePlay = context.pages().length;
  await play.click();
  await visible(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Study Play action did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforePlay) throw new Error('Study Play action opened a new browser tab.');

  await page.keyboard.press('Escape');
  await hidden(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Study media Canvas did not close after playback test.');

  await hidden(page.locator('[data-quantora-fork-chat]').first(), 'Top-level Fork Chat leaked into Study.');
  await visible(page.locator('[data-quantora-message-fork="true"]').last(), 'Study response footer is missing Fork Chat.');

  const board = page.locator('[data-quantora-study-board="true"]').first();
  await visible(board, 'Study answered about a concept but showed no tutor board.');
  await visible(
    board.getByText("Newton's laws", { exact: false }).first(),
    'Tutor board did not name the concept the student asked about.',
  );
  await visible(
    board.locator('[data-quantora-study-encouragement="true"]').first(),
    'Tutor board has no encouragement chrome from session signals.',
  );
  await visible(
    board.locator('[data-quantora-study-gaps="true"]').first(),
    'Tutor board has no gap list chrome.',
  );
  await visible(
    board.locator('[data-quantora-study-competencies="true"]').first(),
    'Tutor board has no exam-competency vocabulary chrome.',
  );
  await visible(
    board.getByText('No fake score. A filled bar only after a real check.', { exact: true }),
    'Tutor board implied progress before the student passed any check.',
  );
  await visible(
    board.locator('[data-quantora-study-competency-active="false"]').first(),
    'Tutor board claimed exam competencies before this session tagged any.',
  );
  if (await board.getByRole('button', { name: 'The wall pushes back on you with an equal force', exact: true }).count()) {
    throw new Error('Tutor board still ships a hardcoded lesson check.');
  }
  await board.getByRole('button', { name: 'Test me on this', exact: true }).click();
  const honesty = board.getByRole('button', { name: /I can explain Newton's laws without looking/i }).first();
  await visible(honesty, 'Tutor board offered no session honesty check after Test me on this.');
  await honesty.click();
  await visible(
    board.getByText(/Marked checked for this session/i).first(),
    'Tutor board did not grade the session honesty check.',
  );

  console.log('Study media browser gate passed.');
} catch (error) {
  console.error('Study media browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
