#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const VALID_VIDEO_ID = 'valid12345';
const DEAD_VIDEO_ID = 'dead12345';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Media Gate', latencyMs: 20, modelId: 'synthetic', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
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
          sub: 'synthetic-media-user',
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
        models: [{
          id: 'openai/gpt-4o-mini',
          name: 'Synthetic Fast Model',
          description: 'Synthetic browser gate model',
          provider: 'Synthetic',
          available: true,
          pricingKind: 'test',
        }],
      }),
    });
  }

  if (path === '/api/youtube-validate') {
    const id = url.searchParams.get('id');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(id === VALID_VIDEO_ID
        ? { valid: true, id, title: 'Verified learning video', authorName: 'Synthetic Teacher' }
        : { valid: false, id: id || '', reason: 'unavailable' }),
    });
  }

  if (path === '/api/chat') {
    const reply = [
      'Two possible learning resources:',
      '',
      `- [Verified learning video](https://www.youtube.com/watch?v=${VALID_VIDEO_ID}) — use this one.`,
      `- [Unavailable learning video](https://www.youtube.com/watch?v=${DEAD_VIDEO_ID}) — this must disappear.`,
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

async function visible(locator, message) {
  await locator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message) {
  await locator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  /*
   * THE ACCOUNT ENTRY FOLLOWS THE SHELL (2026-09-07). This asserted the
   * sidebar had no account control, which was right when only the header
   * had one and a second could only be a duplicate. The Studio now owns the
   * entry and the header stands down there, so the control below is found
   * on whichever surface this shell puts it — and studio-regression is the
   * gate that counts them and requires exactly one.
   */
  await hidden(page.locator('[data-quantora-sidebar-canvas]').first(), 'Duplicate Canvas leaked into the Studio sidebar.');
  const profile = page.locator('[data-quantora-sidebar-profile], button[aria-controls="quantora-profile-menu"]').first();
  await visible(profile, 'No account control anywhere: neither the sidebar entry nor the header one.');
  await page.mouse.move(1400, 12);
  await page.waitForTimeout(250);
  await profile.click({ timeout: 15_000, force: true });

  const accountMenu = page.locator('#quantora-profile-menu').first();
  await visible(accountMenu, 'Profile click did not open the account menu.');
  const changePicture = accountMenu.locator('[data-quantora-profile-picture-entry]').first();
  await visible(changePicture, 'Account menu is missing Change profile picture.');
  await changePicture.click();

  const personalizer = page.locator('[data-quantora-profile-personalizer]').first();
  await visible(personalizer, 'Change profile picture did not open the photo/avatar chooser.');
  await visible(personalizer.locator('[data-quantora-profile-upload]').first(), 'Profile photo upload control is missing.');
  const thinker = personalizer.locator('[data-quantora-profile-avatar-choice="thinker"]').first();
  await visible(thinker, 'Preset profile avatars are missing.');
  await thinker.click();

  const storedAvatar = await page.evaluate(() => localStorage.getItem('quantora_profile_avatar_v1') || '');
  if (!storedAvatar.includes('data:image/')) throw new Error('Choosing a preset avatar was not persisted.');

  await page.getByRole('button', { name: 'Close profile picture chooser' }).click();
  await hidden(personalizer, 'Profile chooser did not close.');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Studio prompt input is missing.');
  await textarea.fill('Show me useful videos');
  await textarea.press('Enter');

  const validLink = page.getByRole('link', { name: 'Verified learning video', exact: true }).first();
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('.markdown-prose a')]
      .find((node) => node.textContent?.trim() === 'Verified learning video');
    const play = link?.nextElementSibling;
    return link?.dataset.quantoraYoutubeValidation === 'valid'
      && link.hidden === false
      && play?.dataset.quantoraYoutubePlay === 'true'
      && play.hidden === false
      && play.disabled === false;
  });
  await visible(validLink, 'Verified YouTube recommendation did not render after validation.');

  const deadLink = page.getByRole('link', { name: 'Unavailable learning video', exact: true }).first();
  await deadLink.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await deadLink.count()) throw new Error('Unavailable YouTube recommendation was not removed from the answer.');

  const play = page.locator('a[data-quantora-youtube-validation="valid"] + button[data-quantora-youtube-play="true"]').first();
  await visible(play, 'Verified YouTube recommendation has no usable Play control.');
  if (await page.locator('[data-quantora-youtube-watch]').isVisible().catch(() => false)) {
    throw new Error('Legacy Watch control is still visible beside the new Play control.');
  }

  const pagesBeforeTitleClick = context.pages().length;
  await validLink.click();
  const mediaCanvas = page.locator('[data-quantora-media-canvas="youtube"]').first();
  await visible(mediaCanvas, 'Clicking the video title did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforeTitleClick) {
    throw new Error('Clicking the video title opened a new browser tab.');
  }
  await visible(mediaCanvas.getByText('Open on YouTube ↗', { exact: true }), 'Canvas does not retain an explicit external YouTube escape hatch.');

  await page.keyboard.press('Escape');
  await hidden(mediaCanvas, 'Escape did not close the media Canvas.');

  const pagesBeforePlayClick = context.pages().length;
  await play.click();
  await visible(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Play did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforePlayClick) {
    throw new Error('Play opened a new browser tab.');
  }

  console.log('Media/profile native browser gate passed.');
} catch (error) {
  console.error('Media/profile/workspace-card browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
