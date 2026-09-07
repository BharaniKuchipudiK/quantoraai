#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
let notes = [];
let writeCount = 0;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Study Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
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
          sub: 'synthetic-notebook-user',
          name: 'Notebook Student',
          email: 'notebook@quantora.test',
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
      body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }),
    });
  }

  if (path === '/api/chat') {
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body: sseBody('Motion graphs show how position and velocity change over time. On a displacement-time graph, the slope represents velocity.'),
    });
  }

  if (path === '/api/study-notebook') {
    const method = request.method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes }) });
    }
    const body = request.postDataJSON();
    if (method === 'POST') {
      writeCount += 1;
      const now = new Date().toISOString();
      const note = {
        id: '11111111-1111-4111-8111-111111111111',
        subject: body.subject,
        topic: body.topic || null,
        title: body.title,
        body: body.body || '',
        createdAt: now,
        updatedAt: now,
      };
      notes = [note];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ note }) });
    }
    if (method === 'PATCH') {
      writeCount += 1;
      const current = notes.find((note) => note.id === body.id);
      if (!current) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Note not found.' }) });
      const note = {
        ...current,
        subject: body.subject,
        topic: body.topic || null,
        title: body.title,
        body: body.body || '',
        updatedAt: new Date().toISOString(),
      };
      notes = [note];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ note }) });
    }
    if (method === 'DELETE') {
      writeCount += 1;
      notes = notes.filter((note) => note.id !== body.id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    }
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  // Study surfaces are deliberately contextual: establish a real learner topic
  // before asserting the + menu / Notebook handoff.
  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');
  await textarea.fill('Teach me motion graphs');
  await textarea.press('Enter');

  const hub = page.locator('[data-quantora-study-hub-launcher="true"]').first();
  await visible(hub, 'Study AI launcher is missing after a Study topic is active.', 10_000);
  const panel = page.locator('#quantora-study-hub-panel').first();
  const plusTrigger = page.locator('[data-quantora-plus-trigger="true"]').first();
  await visible(plusTrigger, 'Study composer has no + action menu.');

  const openNotebook = async () => {
    if (await panel.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden', timeout: 5000 });
    }
    await plusTrigger.click();
    const plusMenu = page.locator('[data-quantora-studio-tools-menu="true"][data-quantora-plus-domain="education"]').first();
    await visible(plusMenu, 'Study + menu did not open.');
    const notebookAction = plusMenu.getByRole('button', { name: 'Notebook', exact: true });
    await visible(notebookAction, 'Study + menu has no Notebook destination.');
    await notebookAction.click();
    const notebook = page.locator('[data-quantora-study-notebook="true"]').first();
    await visible(notebook, 'Study Notebook did not open from the + menu.');
    return notebook;
  };

  let notebook = await openNotebook();
  await visible(notebook.getByText('Personal notes do not change mastery.', { exact: true }), 'Notebook lost its mastery truth boundary.');

  await notebook.getByRole('button', { name: 'New note', exact: true }).click();
  await notebook.getByRole('textbox', { name: 'Note title' }).fill('Velocity reminders');
  await notebook.getByRole('textbox', { name: 'Note subject' }).fill('Physics');
  await notebook.getByRole('textbox', { name: 'Note topic' }).fill('Motion graphs');
  await notebook.getByRole('textbox', { name: 'Note body' }).fill('Velocity is the slope of a displacement-time graph.');
  await notebook.getByRole('button', { name: 'Create note', exact: true }).click();
  await visible(notebook.getByText('Saved', { exact: true }), 'Creating a Notebook note did not resolve to Saved.');
  if (writeCount !== 1) throw new Error(`Notebook create produced ${writeCount} writes instead of exactly one.`);

  // P1 regression: leaving the Notebook before the 700 ms debounce expires must
  // flush the edit rather than silently cancelling the only PATCH.
  const body = notebook.getByRole('textbox', { name: 'Note body' });
  await body.fill('Velocity is the slope of a displacement-time graph. Positive slope means positive velocity.');
  await notebook.getByRole('button', { name: 'Back to Study tools', exact: true }).click();
  await visible(panel.getByRole('button', { name: 'Explain differently', exact: true }), 'Notebook did not return to Study AI after flushing the edit.');
  if (writeCount !== 2 || !notes[0]?.body.includes('positive velocity')) {
    throw new Error('Notebook navigation discarded an edit inside the autosave debounce window.');
  }

  notebook = await openNotebook();
  await notebook.getByRole('textbox', { name: 'Search notes' }).fill('positive velocity');
  await visible(notebook.getByRole('button', { name: /Velocity reminders/ }).first(), 'Notebook search did not find the flushed note body text.');

  // The Hub-level Escape path must honor the same close guard.
  await notebook.getByRole('textbox', { name: 'Search notes' }).fill('');
  await notebook.getByRole('textbox', { name: 'Note body' }).fill('Velocity is slope. Negative slope means negative velocity.');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden', timeout: 5000 });
  if (writeCount !== 3 || !notes[0]?.body.includes('negative velocity')) {
    throw new Error('Closing Study AI with Escape discarded a pending Notebook edit.');
  }

  notebook = await openNotebook();
  await notebook.getByRole('textbox', { name: 'Search notes' }).fill('negative velocity');
  await visible(notebook.getByRole('button', { name: /Velocity reminders/ }).first(), 'Notebook did not reload the edit flushed by Escape.');

  page.once('dialog', (dialog) => dialog.accept());
  await notebook.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.waitForTimeout(150);
  if (writeCount !== 4 || notes.length !== 0) throw new Error('Notebook delete did not remove the learner note exactly once.');

  await notebook.getByRole('button', { name: 'Back to Study tools', exact: true }).click();
  await visible(panel.getByRole('button', { name: 'Explain differently', exact: true }), 'Notebook did not return to Study AI.');

  console.log('Study Notebook browser gate passed.');
} catch (error) {
  console.error('Study Notebook browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
