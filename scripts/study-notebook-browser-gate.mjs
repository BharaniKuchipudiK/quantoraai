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
let scheduleBlocks = [];
let scheduleWriteCount = 0;
let masteryOrAssessmentWrites = 0;

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

  if (path.includes('study-assessment') || path.includes('study-mastery') || path.includes('study-evidence')) {
    if (request.method() !== 'GET') masteryOrAssessmentWrites += 1;
  }

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

  if (path === '/api/study-schedule') {
    const method = request.method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blocks: scheduleBlocks }) });
    }
    const body = request.postDataJSON();
    if (method === 'POST') {
      scheduleWriteCount += 1;
      const now = new Date().toISOString();
      const block = {
        id: '22222222-2222-4222-8222-222222222222',
        subject: body.subject,
        topic: body.topic || null,
        title: body.title,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        kind: body.kind || 'study',
        status: body.status || 'planned',
        notes: body.notes || '',
        createdAt: now,
        updatedAt: now,
      };
      scheduleBlocks = [block];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ block }) });
    }
    if (method === 'PATCH') {
      scheduleWriteCount += 1;
      const current = scheduleBlocks.find((block) => block.id === body.id);
      if (!current) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Study block not found.' }) });
      const block = {
        ...current,
        subject: body.subject,
        topic: body.topic || null,
        title: body.title,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        kind: body.kind || 'study',
        status: body.status || 'planned',
        notes: body.notes || '',
        updatedAt: new Date().toISOString(),
      };
      scheduleBlocks = [block];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ block }) });
    }
    if (method === 'DELETE') {
      scheduleWriteCount += 1;
      scheduleBlocks = scheduleBlocks.filter((block) => block.id !== body.id);
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

  // Establish a real learner topic before asserting the contextual Notebook path.
  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');
  await textarea.fill('Teach me motion graphs');
  await textarea.press('Enter');

  const hub = page.locator('[data-quantora-study-hub-launcher="true"]').first();
  await visible(hub, 'Study AI launcher is missing after a Study topic is active.', 10_000);
  const panel = page.locator('#quantora-study-hub-panel').first();
  const plusTrigger = page.locator('[data-quantora-plus-trigger="true"]').first();
  await visible(plusTrigger, 'Study composer has no + action menu.');

  const openPlusMenu = async () => {
    if (await panel.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden', timeout: 5000 });
    }
    await plusTrigger.click();
    const plusMenu = page.locator('[data-quantora-studio-tools-menu="true"][data-quantora-plus-domain="education"]').first();
    await visible(plusMenu, 'Study + menu did not open.');
    return plusMenu;
  };

  const openNotebook = async () => {
    const plusMenu = await openPlusMenu();
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

  // Schedule is a learner workspace, not an AI intervention. It opens only
  // from + and persists planning state without touching verified learning truth.
  const scheduleMenu = await openPlusMenu();
  const scheduleAction = scheduleMenu.getByRole('button', { name: 'Study Schedule', exact: true });
  await visible(scheduleAction, 'Study + menu has no Study Schedule destination.');
  await scheduleAction.click();
  const schedule = page.locator('[data-quantora-study-schedule="true"]').first();
  await visible(schedule, 'Study Schedule did not open from the + menu.');
  await visible(schedule.getByText('Plan the work. Completing a schedule block does not change mastery.', { exact: true }), 'Schedule lost its mastery truth boundary.');

  await schedule.getByRole('button', { name: 'Add study block', exact: true }).click();
  const newEditor = schedule.getByRole('complementary', { name: 'New study block' });
  await visible(newEditor, 'Schedule editor did not open.');
  await newEditor.getByLabel('Title').fill('Motion graphs review');
  await newEditor.getByLabel('Subject').fill('Physics');
  await newEditor.getByLabel('Topic').fill('Motion graphs');
  await newEditor.getByLabel('Notes').fill('Review slope and velocity before practice.');
  await newEditor.getByRole('button', { name: 'Add to schedule', exact: true }).click();
  await visible(schedule.getByText('Motion graphs review', { exact: true }), 'New Schedule block did not render after save.');
  if (scheduleWriteCount !== 1 || scheduleBlocks.length !== 1) throw new Error('Schedule create did not persist exactly once.');

  await schedule.getByRole('button', { name: 'Mark complete', exact: true }).click();
  await page.waitForTimeout(100);
  if (scheduleWriteCount !== 2 || scheduleBlocks[0]?.status !== 'completed') throw new Error('Schedule completion did not persist planning status.');
  if (masteryOrAssessmentWrites !== 0) throw new Error('Completing a Schedule block wrote to mastery or assessment state.');

  await schedule.getByRole('button', { name: 'Edit Motion graphs review', exact: true }).click();
  const editEditor = schedule.getByRole('complementary', { name: 'Edit study block' });
  await visible(editEditor, 'Schedule edit surface did not open.');
  await editEditor.getByLabel('Title').fill('Motion graphs + velocity review');
  await editEditor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await visible(schedule.getByText('Motion graphs + velocity review', { exact: true }), 'Schedule edit did not render after save.');
  if (scheduleWriteCount !== 3 || scheduleBlocks[0]?.title !== 'Motion graphs + velocity review') throw new Error('Schedule edit did not persist exactly once.');

  await schedule.getByRole('button', { name: 'Edit Motion graphs + velocity review', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await schedule.getByRole('complementary', { name: 'Edit study block' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(100);
  if (scheduleWriteCount !== 4 || scheduleBlocks.length !== 0) throw new Error('Schedule delete did not remove the block exactly once.');
  if (masteryOrAssessmentWrites !== 0) throw new Error('Schedule lifecycle leaked into verified learning truth.');

  await schedule.getByRole('button', { name: 'Close Study Schedule', exact: true }).click();
  await schedule.waitFor({ state: 'hidden', timeout: 5000 });

  console.log('Study Notebook and Schedule browser gate passed.');
} catch (error) {
  console.error('Study Notebook/Schedule browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
