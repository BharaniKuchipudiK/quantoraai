#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';

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

  const studioButton = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await visible(studioButton, 'Studio navigation did not become visible.');
  await studioButton.click();

  // Regression fixture for the exact Agentic Workspace card failure reported in
  // production: model plumbing must disappear and descriptions must never be
  // line-clamped/cropped. The runtime policy should repair this even when cards
  // are inserted dynamically after initial render.
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.dataset.quantoraWorkspaceCardFixture = 'true';
    fixture.innerHTML = `
      <h2>Agentic Workspaces</h2>
      <button type="button" style="height:120px;overflow:hidden">
        <h3>Travel Planner</h3>
        <div>Kimi K2.5</div>
        <p style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:30px">
          Destination, timing, itinerary, flights, hotels, transport and curated places without cutting off the final words.
        </p>
      </button>`;
    document.body.append(fixture);
  });

  const polishedCard = page.locator('[data-quantora-agentic-workspace-card="true"]').first();
  await visible(polishedCard, 'Agentic Workspace cards were not picked up by the readability policy.');
  await hidden(page.locator('[data-quantora-workspace-model-label="true"]').first(), 'Model name is still visible on an Agentic Workspace card.');
  const descriptionState = await page.locator('[data-quantora-workspace-description="true"]').first().evaluate((node) => ({
    display: node.style.display,
    overflow: node.style.overflow,
    maxHeight: node.style.maxHeight,
    clamp: node.style.webkitLineClamp,
    cardHeight: node.closest('[data-quantora-agentic-workspace-card]')?.style.height || '',
  }));
  if (descriptionState.display === '-webkit-box' || descriptionState.overflow === 'hidden' || descriptionState.maxHeight !== 'none' || descriptionState.clamp) {
    throw new Error(`Workspace description is still clamped: ${JSON.stringify(descriptionState)}`);
  }
  if (descriptionState.cardHeight !== 'auto') {
    throw new Error(`Workspace card still has a fixed height: ${JSON.stringify(descriptionState)}`);
  }
  await page.locator('[data-quantora-workspace-card-fixture="true"]').evaluate((node) => node.remove());

  const profile = page.locator('[data-quantora-sidebar-profile]').first();
  await visible(profile, 'Studio Profile entry is missing.');
  await profile.click();

  const personalizer = page.locator('[data-quantora-profile-personalizer]').first();
  await visible(personalizer, 'Profile click did not open the photo/avatar chooser.');
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

  console.log('Media/profile/workspace-card browser gate passed.');
} catch (error) {
  console.error('Media/profile/workspace-card browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
