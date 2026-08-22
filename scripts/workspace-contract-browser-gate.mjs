#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const runtimeErrors = [];

page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|Failed to load resource.*youtube/i.test(message.text())) {
    runtimeErrors.push(`console: ${message.text()}`);
  }
});

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'false');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'workspace-contract-user', name: 'Synthetic User', email: 'synthetic@quantora.test', picture: null, isAdmin: false } }) });
  }
  if (url.pathname === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
      { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
    ] }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 6000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 3000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

async function assertNoBrokenVisibleImages(label) {
  const broken = await page.locator('img:visible').evaluateAll((nodes) => nodes
    .filter((img) => img.complete && img.naturalWidth === 0)
    .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || '' })));
  if (broken.length) throw new Error(`${label} contains broken visible images: ${JSON.stringify(broken)}`);
}

async function screenshot(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

const workspaces = [
  { label: 'Travel Advisor', domain: 'travel', capabilities: ['Flights', 'Hotels', 'Attractions', 'Itineraries'] },
  { label: 'Finance Advisor', domain: 'finance', capabilities: ['Portfolio', 'Cash flow', 'Debt', 'Decisions'] },
  { label: 'Study Tutor', domain: 'education', capabilities: ['Explain', 'Practise', 'Plan', 'Review'] },
  { label: 'Research Analyst', domain: 'research', capabilities: ['Research', 'Compare', 'Evidence', 'Decide'] },
];

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  await hidden(page.locator('[data-quantora-sidebar-canvas]').first(), 'Duplicate Canvas leaked into the Studio sidebar.');
  await hidden(page.locator('[data-quantora-sidebar-profile]').first(), 'Duplicate Profile leaked into the Studio sidebar.');
  await visible(page.getByRole('button', { name: /^Journey$/i }).first(), 'Global Journey/Canvas navigation is missing from Studio.');
  const headerProfile = page.locator('button[aria-controls="quantora-profile-menu"]').first();
  await visible(headerProfile, 'Global Profile control is missing from Studio.');

  for (const workspace of workspaces) {
    const advisor = page.locator(`[data-quantora-advisor="${workspace.domain}"]`).first();
    await visible(advisor, `${workspace.label} is missing from the sidebar.`);
    await advisor.click();
    await page.waitForFunction((domain) => document.documentElement.dataset.quantoraDomain === domain, workspace.domain);

    const capabilitySurface = page.locator(`[data-quantora-workspace-capabilities="${workspace.domain}"]`).first();
    await visible(capabilitySurface, `${workspace.label} capability surface is missing.`);
    for (const capability of workspace.capabilities) {
      await visible(capabilitySurface.getByText(capability, { exact: true }), `${workspace.label} is missing ${capability}.`);
    }

    await hidden(page.locator('[data-quantora-sidebar-canvas]').first(), `${workspace.label} leaked duplicate Canvas navigation.`);
    await hidden(page.locator('[data-quantora-sidebar-profile]').first(), `${workspace.label} leaked duplicate Profile navigation.`);
    await hidden(page.locator('[data-quantora-code-workspace="true"]').first(), `${workspace.label} opened generic Code Preview without an explicit artifact.`);
    await hidden(page.getByText('Live Preview', { exact: true }).first(), `${workspace.label} exposed an empty Live Preview.`);

    for (const modelLabel of ['Gemini Flash', 'Gemini 2.5 Flash', 'DeepSeek V3']) {
      const leaked = page.getByText(modelLabel, { exact: true });
      if (await leaked.count()) {
        const anyVisible = await leaked.evaluateAll((nodes) => nodes.some((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }));
        if (anyVisible) throw new Error(`${workspace.label} leaked model card/plumbing: ${modelLabel}`);
      }
    }

    const arena = page.locator('[data-quantora-dual-arena="true"]').first();
    await visible(arena, `${workspace.label} is missing Dual Arena.`);
    await arena.click();
    await page.waitForTimeout(80);
    if (await arena.getAttribute('aria-pressed') !== 'true') throw new Error(`${workspace.label} Dual Arena did not activate.`);
    await visible(page.getByRole('button', { name: /VS:/ }).first(), `${workspace.label} Arena did not expose Model B selection.`);
    await arena.click();
    await page.waitForTimeout(80);
    if (await arena.getAttribute('aria-pressed') !== 'false') throw new Error(`${workspace.label} Dual Arena did not deactivate.`);

    await hidden(page.locator('[data-quantora-fork-chat]').first(), `${workspace.label} still has top-level Fork Chat.`);
    await assertNoBrokenVisibleImages(workspace.label);
    await screenshot(`workspace-${workspace.domain}-contract`);
  }

  const profileRect = await headerProfile.boundingBox();
  await headerProfile.click();
  const menu = page.locator('#quantora-profile-menu').first();
  await visible(menu, 'Header Profile did not open the account menu.');
  const menuRect = await menu.boundingBox();
  if (!profileRect || !menuRect) throw new Error('Could not measure Profile/menu geometry.');
  if (menuRect.top < profileRect.bottom - 2 || Math.abs((menuRect.x + menuRect.width) - (profileRect.x + profileRect.width)) > 24) {
    throw new Error(`Profile menu is not anchored below the header control: profile=${JSON.stringify(profileRect)} menu=${JSON.stringify(menuRect)}`);
  }

  const changePicture = menu.locator('[data-quantora-profile-picture-entry="true"]').first();
  await visible(changePicture, 'Account menu is missing Change profile picture.');
  await changePicture.click();
  const editor = page.locator('[data-quantora-profile-personalizer="true"]').first();
  await visible(editor, 'Profile picture editor did not open.');
  if (await editor.locator('[data-quantora-profile-avatar-choice]').count() < 6) throw new Error('Profile avatar choices are incomplete.');
  await assertNoBrokenVisibleImages('Profile editor');
  await screenshot('workspace-profile-native-contract');

  if (runtimeErrors.length) throw new Error(`Browser runtime errors detected:\n${runtimeErrors.join('\n')}`);
  console.log('Cross-workspace visual contract gate passed.');
} catch (error) {
  await screenshot('workspace-contract-failure').catch(() => {});
  console.error('Cross-workspace visual contract gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}