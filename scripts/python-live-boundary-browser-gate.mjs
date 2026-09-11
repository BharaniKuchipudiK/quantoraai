import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { invokePythonChatHandler } from './fixtures/python-chat-handler.mjs';
import { prompt, response } from './fixtures/python-csv-contract.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
const executionEvents = [];
page.on('pageerror', (error) => errors.push(error.message));
let mode = 'valid';
let calls = 0;
await page.addInitScript(() => localStorage.setItem('quantora_hide_welcome', 'true'));
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/session') return route.fulfill({ json: { user: { sub: 'python-boundary', name: 'Boundary Test', email: 'boundary@quantora.test' } } });
  if (path === '/api/models') return route.fulfill({ json: { models: [{ id: 'openai/gpt-4o-mini', name: 'Boundary Fixture', provider: 'OpenRouter', available: true }] } });
  if (path === '/api/trace' && route.request().method() === 'POST') {
    const event = route.request().postDataJSON();
    if (event.boundary === 'browser.python-verification') executionEvents.push(event);
    return route.fulfill({ json: { recorded: true } });
  }
  if (path === '/api/chat') {
    calls++;
    const invalid = mode === 'invalid' || mode === 'repair' && calls === 1;
    const body = route.request().postDataJSON();
    assert.equal(body.studioMode, 'build', `Python must stay on the Build path and not trigger web work (task=${body.task || 'chat'})`);
    const result = await invokePythonChatHandler(body, invalid ? response.replace('filepath="README.md"', 'filepath="wrong.md"') : response);
    assert.equal(result.providerCalls, 1, 'The real server must run exactly one provider attempt for each response');
    return route.fulfill({ status: result.status, contentType: result.stream ? 'text/event-stream' : 'application/json', body: result.stream || JSON.stringify(result.body) });
  }
  return route.fulfill({ json: { projects: [], sessions: [], ok: true } });
});

async function submit() {
  await page.locator('[data-quantora-workspace-new-chat="coding"]').click();
  const buildMode = page.locator('[data-quantora-studio-mode="build"]');
  if (await buildMode.getAttribute('data-quantora-studio-mode-active') !== 'true') await buildMode.click();
  const input = page.locator('.app-shell--studio textarea').first();
  await input.fill(prompt);
  await input.press('Enter');
}
async function savedOutput() {
  // Inspect only this isolated test account's persisted chat data.
  return page.evaluate(() => {
    const find = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 15) return null;
      if (value['clean.csv']?.content) return value['clean.csv'].content;
      for (const entry of Object.values(value)) { const found = find(entry, depth + 1); if (found) return found; }
      return null;
    };
    return find(JSON.parse(localStorage.getItem('quantora_chat_sessions:account:boundary%40quantora.test') || '[]'));
  });
}
try {
  await page.goto(process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173');
  await enterSignedInStudio(page);
  await submit();
  await page.getByText('Python verification passed: pytest -q.', { exact: false }).first().waitFor({ timeout: 75000 });
  await page.waitForFunction(() => document.querySelector('[data-quantora-file-tree]')?.textContent.includes('clean.csv'));
  assert.equal(calls, 1);
  const expected = 'name,email\nAlice,alice@example.com\nBob,bob@example.com\nCarol,carol@example.com\n';
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('quantora_chat_sessions:account:boundary%40quantora.test') || '[]').some((session) => session.desk?.vfs?.['clean.csv']?.content), null, { timeout: 10000 });
  const output = await savedOutput();
  assert.equal(output?.replace(/\r\n/g, '\n'), expected, 'Actual generated CSV must be saved, not fabricated in chat');
  await page.reload();
  await enterSignedInStudio(page);
  assert.equal((await savedOutput())?.replace(/\r\n/g, '\n'), expected, 'Generated output must survive refresh');

  mode = 'repair'; calls = 0;
  await submit();
  await page.getByText('Python verification passed: pytest -q.', { exact: false }).first().waitFor({ timeout: 75000 });
  assert.equal(calls, 2, 'Missing source is repaired once through the real handler');

  mode = 'invalid'; calls = 0;
  await submit();
  await page.getByText(/(?:Generated files failed validation\.|requested Python files failed source validation)/).first().waitFor({ timeout: 30000 });
  assert.equal(calls, 2, 'Repeated invalid source must stop after one repair');
  assert.deepEqual(executionEvents.map((event) => event.state), ['started', 'succeeded', 'started', 'succeeded']);
  for (let index = 0; index < executionEvents.length; index += 2) {
    assert.equal(executionEvents[index].correlationId, executionEvents[index + 1].correlationId);
  }
  assert.equal(await page.getByText('The connection to the model died before Preview was ready.', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/python-real-handler-boundary.png', fullPage: true });
  console.log('Python boundary gate passed: real handler, actual pytest and script execution, saved CSV, refresh persistence, one successful repair and bounded failure. No live provider calls.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/python-real-handler-failure.png', fullPage: true });
  console.error((await page.locator('.app-shell--studio').innerText()).slice(-10000));
  console.error(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('quantora_chat_sessions')).map((key) => ({ key, sessions: JSON.parse(localStorage.getItem(key) || '[]').map((session) => ({ keys: Object.keys(session), desk: session.desk ? { keys: Object.keys(session.desk), files: Object.keys(session.desk.vfs || {}) } : null })) }))));
  throw error;
} finally {
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
