import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const base = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const theme = process.env.QUANTORA_TEST_THEME || 'dark';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let releaseReply;
const replyReady = new Promise((resolve) => { releaseReply = resolve; });
await page.addInitScript((theme) => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.setItem('quantora_theme_mode', theme);
}, theme);
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/session') return route.fulfill({ json: { user: { sub: 'navigation-proof', name: 'Navigation Test', email: 'navigation@quantora.test' } } });
  if (path === '/api/models') return route.fulfill({ json: { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] } });
  if (path === '/api/chat') {
    await replyReady;
    return route.fulfill({ contentType: 'text/event-stream', body: [
      `data: ${JSON.stringify({ status: { phase: 'response', state: 'generating', label: 'Preparing the explanation…' } })}`,
      `data: ${JSON.stringify({ text: 'A Python dictionary stores key-value pairs. Example: {"name": "Alice"}.' })}`,
      'data: [DONE]', '',
    ].join('\n\n') });
  }
  return route.fulfill({ json: { projects: [], sessions: [], ok: true } });
});
const selector = page.locator('[data-quantora-project-selector]');
const rows = page.locator('[data-quantora-sidebar-chat]');
async function createProject(name) {
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.waitForFunction((expected) => document.querySelector('[data-quantora-project-selector]')?.selectedOptions[0]?.textContent === expected, name);
  return selector.inputValue();
}
async function uniqueRows() {
  const ids = await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.quantoraSidebarChat));
  assert.equal(new Set(ids).size, ids.length, 'Each chat must appear exactly once');
}
try {
  await page.goto(base);
  await enterSignedInStudio(page);
  const firstProject = await createProject('Exam preparation');
  await page.locator('[data-quantora-workspace-new-chat="coding"]').click();
  const prompt = page.locator('.app-shell--studio textarea').first();
  await prompt.fill('Explain Python dictionaries for my revision.');
  await prompt.press('Enter');
  const live = page.locator('[data-quantora-live-progress]');
  await live.waitFor({ state: 'visible' });
  await live.locator('li').first().waitFor({ state: 'visible' });
  assert.match(await live.innerText(), /Activity/i);
  assert.match(await live.innerText(), /Elapsed/);
  assert.ok(await live.locator('li').count() > 0, 'Recorded progress must be visible before the response');
  assert.equal(await page.getByText('A Python dictionary stores key-value pairs.', { exact: false }).count(), 0);
  await uniqueRows();
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: `artifacts/e2e/studio-navigation-progress-${theme}-active.png`, fullPage: true, animations: 'disabled' });
  releaseReply();
  await live.waitFor({ state: 'hidden', timeout: 15000 });
  const history = page.locator('[data-quantora-execution-history]').last();
  await history.locator('summary').click();
  assert.match(await history.innerText(), /Preparing the explanation/);
  const chat = page.locator('[data-quantora-workspace-chats="coding"] [data-quantora-sidebar-chat]').first();
  const chatId = await chat.getAttribute('data-quantora-sidebar-chat');
  const secondProject = await createProject('Product launch');
  assert.notEqual(secondProject, firstProject);
  assert.equal(await page.locator(`[data-quantora-sidebar-chat="${chatId}"]`).count(), 0, 'Project switch must scope workspace chats');
  await page.locator('[data-quantora-sidebar-search-toggle]').click();
  await page.locator('[data-quantora-sidebar-chat-search]').fill('dictionaries');
  const result = page.locator(`[data-quantora-sidebar-chat="${chatId}"]`);
  await result.waitFor({ state: 'visible' });
  assert.equal(await result.locator('[data-quantora-search-project]').innerText(), 'Exam preparation');
  await uniqueRows();
  await result.click();
  assert.equal(await selector.inputValue(), firstProject, 'Search must reopen the owning project');
  await page.locator('[data-quantora-sidebar-chat-search]').press('Escape');
  await uniqueRows();
  await selector.selectOption('project-personal');
  assert.equal(await page.locator(`[data-quantora-sidebar-chat="${chatId}"]`).count(), 0);
  await selector.selectOption(firstProject);
  await page.locator(`[data-quantora-sidebar-chat="${chatId}"]`).waitFor({ state: 'visible' });
  await page.locator(`[data-quantora-chat-menu="${chatId}"]`).click();
  await page.locator(`[data-quantora-chat-menu-item="move-${secondProject}"]`).click();
  assert.equal(await page.locator(`[data-quantora-sidebar-chat="${chatId}"]`).count(), 0);
  await selector.selectOption(secondProject);
  await page.locator(`[data-quantora-workspace-chats="coding"] [data-quantora-sidebar-chat="${chatId}"]`).waitFor({ state: 'visible' });
  await page.locator(`[data-quantora-chat-menu="${chatId}"]`).click();
  await page.locator('[data-quantora-chat-menu-item="archive"]').click();
  assert.equal(await page.locator(`[data-quantora-workspace-chats="coding"] [data-quantora-sidebar-chat="${chatId}"]`).count(), 0);
  await selector.selectOption(firstProject);
  assert.equal(await page.locator('[data-quantora-sidebar-archived-toggle]').count(), 0, 'Archives must respect the selected project');
  await selector.selectOption(secondProject);
  await page.locator('[data-quantora-sidebar-archived-toggle]').click();
  await page.locator(`[data-quantora-chat-menu="${chatId}"]`).click();
  await page.locator('[data-quantora-chat-menu-item="archive"]').click();
  await page.locator(`[data-quantora-workspace-chats="coding"] [data-quantora-sidebar-chat="${chatId}"]`).waitFor({ state: 'visible' });
  await uniqueRows();
  await page.screenshot({ path: `artifacts/e2e/studio-navigation-progress-${theme}-desktop.png`, fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await enterSignedInStudio(page);
  const sidebar = page.locator('[data-quantora-studio-sidebar]');
  assert.equal(await sidebar.evaluate((element) => getComputedStyle(element).position), 'absolute', 'Mobile navigation must overlay rather than squeeze the chat');
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 380, y: 200 } });
  await page.getByTitle('Open Chat History Sidebar').click();
  await page.screenshot({ path: `artifacts/e2e/studio-navigation-progress-${theme}-mobile.png`, fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('Navigation/progress gate passed: pre-response activity, retained history, unique chats, project isolation, global search, move/archive/restore, and mobile rendering.');
} finally {
  releaseReply();
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
