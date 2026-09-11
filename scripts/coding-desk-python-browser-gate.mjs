#!/usr/bin/env node
/** Real browser proof: generated Python files execute in the Coding Desk worker. */
import { mkdirSync } from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
mkdirSync('artifacts/e2e', { recursive: true });

const response = [
  'Created the requested Python files.',
  '```python filepath="parser.py"',
  'def total(values):\n    return sum(values)',
  '```',
  '```python filepath="verify.py"',
  "from parser import total\nassert total([2, 3, 5]) == 10\nprint('PYTHON_EXECUTION_OK')",
  '```',
  '```python filepath="test_parser.py"',
  'from parser import total\n\ndef test_total():\n    assert total([4, 6]) == 10',
  '```',
  '```markdown filepath="README.md"',
  '# Python utility\nRun `python3 verify.py`.',
  '```',
].join('\n');
const brokenResponse = [
  'Created the requested files.',
  '```python filepath="broken.py"',
  'def broken(:\n    pass',
  '```',
  '```markdown filepath="README.md"',
  '# Broken fixture',
  '```',
].join('\n');
let chatCalls = 0;
const chatRequests = [];

function sse(text) {
  return [
    `data: ${JSON.stringify({ status: { phase: 'build', state: 'connecting', label: 'Connecting to the selected engine…' } })}`,
    `data: ${JSON.stringify({ status: { phase: 'build', state: 'generating', label: 'Generating requested Python files…', receivedChars: text.length } })}`,
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Python Gate', modelId: 'synthetic-a' })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => localStorage.setItem('quantora_hide_welcome', 'true'));
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/session') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'python-gate', name: 'Python Gate', email: 'python@quantora.test' } }) });
  if (path === '/api/models') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }) });
  if (path === '/api/chat') {
    chatCalls += 1;
    chatRequests.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(chatCalls === 1 ? response : brokenResponse) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  const prompt = page.locator('.app-shell--studio textarea').first();
  await prompt.fill('Create four files: parser.py, verify.py, test_parser.py and README.md. No TODOs.');
  await prompt.press('Enter');
  await page.waitForFunction(() => /verify\.py/.test(document.querySelector('[data-quantora-file-tree="true"]')?.innerText || ''), null, { timeout: 20_000 });
  await page.waitForFunction(() => /Python verification passed: pytest -q/.test(document.body.innerText || ''), null, { timeout: 35_000 });
  const progress = page.locator('[data-quantora-execution-history="true"]');
  await progress.waitFor({ state: 'attached', timeout: 10_000 });
  const progressText = await progress.textContent();
  if (!/Connecting to the selected engine/.test(progressText)
    || !/Generating requested Python files/.test(progressText)
    || !/Model response received/.test(progressText)
    || !/Python tests passed/.test(progressText)) {
    throw new Error(`Execution history omitted observed milestones: ${progressText}`);
  }
  await page.locator('[data-quantora-studio-terminal-nav="true"]').click();
  const terminal = page.locator('[data-quantora-studio-terminal="true"]');
  await terminal.waitFor({ state: 'visible', timeout: 10_000 });
  const input = terminal.locator('[data-quantora-studio-terminal-input="true"]');
  await input.fill('python3 verify.py');
  await input.press('Enter');
  await page.waitForFunction(() => /PYTHON_EXECUTION_OK/.test(document.querySelector('[data-quantora-studio-terminal-log="true"]')?.innerText || ''), null, { timeout: 35_000 });
  await input.fill('pytest -q');
  await input.press('Enter');
  await page.waitForFunction(() => /1 passed/.test(document.querySelector('[data-quantora-studio-terminal-log="true"]')?.innerText || ''), null, { timeout: 35_000 });
  const jobText = await page.locator('body').innerText();
  if (/A to-do list|Items can still be added/.test(jobText)) throw new Error('“No TODOs” still changed the Python utility into a to-do job.');

  await page.getByRole('button', { name: /New Chat/i }).first().click();
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  const secondPrompt = page.locator('.app-shell--studio textarea').first();
  await secondPrompt.fill('Create two files: broken.py and README.md.');
  await secondPrompt.press('Enter');
  await page.waitForFunction(() => /broken\.py/.test(document.querySelector('[data-quantora-file-tree="true"]')?.innerText || ''), null, { timeout: 20_000 });
  await page.waitForFunction(() => /Python execution verification failed/.test(document.body.innerText || ''), null, { timeout: 35_000 });
  const failedBody = await page.locator('body').innerText();
  if (/Python verification passed/.test(failedBody)) throw new Error('A syntax error was presented as passing Python verification.');
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-python.png', fullPage: true });
  console.log('Coding Desk Python browser gate passed: generated files executed with real Python output.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-python-failure.png', fullPage: true }).catch(() => {});
  console.error(JSON.stringify({
    chatRequests,
    fileTree: await page.locator('[data-quantora-file-tree="true"]').textContent().catch(() => ''),
    body: (await page.locator('body').innerText().catch(() => '')).slice(-3000),
  }, null, 2));
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
