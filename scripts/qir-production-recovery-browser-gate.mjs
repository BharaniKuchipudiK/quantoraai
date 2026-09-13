#!/usr/bin/env node
/**
 * Was-red production recovery, in the real Studio shell.
 *
 * Two screenshots own this gate:
 * 1) Study Tutor taught a lesson, then route death said "the model died before
 *    Preview was ready" and offered Coding/shop recovery.
 * 2) A Coding turn hit a dead first route and asked the person to tap
 *    "Retry a smaller build" instead of healing itself.
 *
 * The 175s step-deadline decision stays in the unit contract — this harness
 * cannot wait that long without a test backdoor. The browser proves the same
 * ownership seams: Study never speaks Preview recovery, and a Coding first
 * failure journals QIR and heals without a Retry chip.
 * A terminal Coding failure also keeps its explicit manual recovery action:
 * clicking it sends one request on the engine named by the button. All API
 * calls are intercepted; this gate never calls a paid provider.
 */
import { mkdirSync } from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { planDeskCheckpointChain } from '../src/lib/desk-checkpoint-delta.js';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const STUDY_ASK = "Make a few flashcards for Newton's laws";
const CODING_ASK = 'Build a production scheduling board for my factory floor';
const HEALED_PAGE = [
  'The scheduling board is on the desk.',
  '',
  '```html filepath="index.html"',
  '<!doctype html><html><body><main><h1>Factory Schedule</h1><table><thead><tr><th>Line</th><th>Job</th></tr></thead><tbody><tr><td>A</td><td>Cut</td></tr></tbody></table></main></body></html>',
  '```',
].join('\n');
const CODING_LEAK = /before Preview was ready|Retry a smaller build|catalog photos|Add to Cart/i;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Recovery Gate', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

function jsonOk(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function visible(locator, message, timeout = 8000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

/**
 * Wait for something the PAGE causes to happen in THIS process.
 *
 * The QIR journal is fire-and-forget by design: src/lib/qir-turn-journal.js
 * must never block a user's turn on /api/qir-runs, so `beginAttempt` returns
 * before the POST lands. The counters below are incremented when that POST
 * ARRIVES at the intercepted route, which races the rendered page.
 *
 * Asserting such a counter the instant the text appears makes this gate a coin
 * flip under load. Observed on 2026-09-03: red in CI on a markdown-only diff,
 * with the identical code green on the previous commit, on `main`, and six
 * times out of six locally on the failing commit itself.
 *
 * This waits for the write instead of snapshotting it. A journal that never
 * happens still fails, with the same sentence — only the timing assumption
 * changes, never the claim.
 */
async function waitForState(check, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (check()) return;
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
}

const browser = await chromium.launch({ headless: true });

async function runJourney(name, script) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const state = {
    chatCalls: 0,
    qirAttempts: 0,
    qirObserves: 0,
    workflowSubmissions: 0,
    workflowCapabilities: 0,
    browserRunCreates: 0,
    savedSteps: [], savedRevision: 0,
  };

  await page.addInitScript(() => {
    localStorage.setItem('quantora_hide_welcome', 'true');
    localStorage.removeItem('quantora_active_specialist_domain');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/auth/session') {
      return jsonOk(route, {
        user: { sub: `qir-recovery-${name}`, name: 'Recovery Gate', email: 'recovery@quantora.test', picture: null, isAdmin: false },
      });
    }
    if (path === '/api/models') {
      return jsonOk(route, {
        models: [
          { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
          { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
        ],
      });
    }
    if (path === '/api/study-onboarding') {
      return jsonOk(route, {
        needsOnboarding: false,
        profile: { studyContext: 'school', completedAt: '2026-09-01T00:00:00.000Z' },
      });
    }
    if (path === '/api/desk-checkpoints') {
      if (request.method() === 'GET') return jsonOk(route, { steps: state.savedSteps, revision: state.savedRevision });
      const body = request.postDataJSON();
      if (body.expectedRevision !== state.savedRevision) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Newer checkpoint' }) });
      state.savedSteps = planDeskCheckpointChain(body.history).steps;
      state.savedRevision++;
      return jsonOk(route, { saved: state.savedSteps.length, revision: state.savedRevision });
    }
    if (path === '/api/qir-runs') {
      if (script.workerPilot || state.workerPilot) {
        const query = new URL(request.url()).searchParams;
        if (query.get('workerPilot') === '1') {
          state.workflowCapabilities++;
          return jsonOk(route, { enabled: true, runId: 'browser-pilot-run' });
        }
        if (request.method() === 'GET') return state.completedRun ? jsonOk(route, { run: state.completedRun }) : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Scheduled, awaiting initialization' }) });
        const submitted = request.postDataJSON() || {};
        if (submitted.action === 'coding.workflow_submit') {
          state.workflowSubmissions++;
          state.submitted = submitted;
          return route.fulfill({ status: script.rejectScheduling ? 503 : 202, contentType: 'application/json', body: JSON.stringify(script.rejectScheduling
            ? { error: 'Scheduling was not confirmed', reason: 'scheduling-unconfirmed' }
            : { runId: 'browser-pilot-run', workflowRunId: 'wrun_fixture', durability: 'scheduled' }) });
        }
        if (submitted.run) state.browserRunCreates++;
      }
      const body = request.postDataJSON?.() || {};
      if (body.action === 'coding.attempt') state.qirAttempts += 1;
      if (body.action === 'coding.observe') state.qirObserves += 1;
      return jsonOk(route, { run: { runId: 'recovery-run', status: body.action === 'coding.attempt' ? 'EXECUTING' : 'QUEUED', cursor: { actionId: 'recovery-action' } } });
    }
    if (path === '/api/chat') {
      return script.onChat(route, state);
    }
    return jsonOk(route, { projects: [], sessions: [], ok: true });
  });

  try {
    await page.goto(script.workerPilot ? `${BASE_URL}/desk?workerPilot=1` : BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await script.drive(page, state);
  } catch (error) {
    mkdirSync('artifacts/e2e', { recursive: true });
    await page.screenshot({ path: `artifacts/e2e/qir-production-recovery-${name}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await runJourney('study', {
    onChat(route, state) {
      state.chatCalls += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'no healthy AI route', retryable: false }),
      });
    },
    async drive(page, state) {
      await enterSignedInStudio(page);
      const study = page.locator('[data-quantora-advisor="education"]').first();
      await visible(study, 'Study Tutor is missing from the workspace sidebar.');
      await study.click();
      await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

      const prompt = page.locator('.app-shell--studio textarea').first();
      await visible(prompt, 'Study composer is missing.');
      await prompt.fill(STUDY_ASK);
      await prompt.press('Enter');

      await page.waitForFunction(
        () => [...document.querySelectorAll('.markdown-prose')]
          .some((node) => /Request failed|Temporarily unavailable|connection dropped|could not reach/i.test(node.textContent || '')),
        null,
        { timeout: 20_000 },
      );

      const reply = await page.locator('.markdown-prose').last().innerText();
      if (CODING_LEAK.test(reply)) {
        throw new Error(`Study route death leaked Coding Preview recovery: ${reply.replace(/\s+/g, ' ').slice(0, 400)}`);
      }
      if (state.qirAttempts > 0) {
        throw new Error(`Study journaled ${state.qirAttempts} Coding QIR attempt(s).`);
      }
      if (state.chatCalls < 1) throw new Error('Study never reached /api/chat.');
    },
  });

  await runJourney('coding', {
    onChat(route, state) {
      state.chatCalls += 1;
      if (state.chatCalls === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Quantora could not reach a healthy AI route for this turn.',
            retryable: true,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
        body: sseBody(HEALED_PAGE),
      });
    },
    async drive(page, state) {
      await enterSignedInStudio(page);
      const prompt = page.locator('.app-shell--studio textarea').first();
      await visible(prompt, 'Coding composer is missing.');
      await prompt.fill(CODING_ASK);
      await prompt.press('Enter');

      await page.waitForFunction(
        () => /Factory Schedule/.test(document.body.innerText),
        null,
        { timeout: 30_000 },
      );

      if (state.chatCalls < 2) {
        throw new Error('Coding first-route death did not auto-recover onto a second attempt.');
      }
      await waitForState(
        () => state.qirAttempts >= 1,
        'Coding recovery never journaled a QIR model attempt.',
      );
      const text = await page.locator('body').innerText();
      if (/Retry a smaller build/i.test(text)) {
        throw new Error('Coding auto-recovery still asked the person to tap Retry a smaller build.');
      }
    },
  });

  await runJourney('coding-manual-recovery', {
    onChat(route, state) {
      state.chatCalls += 1;
      const body = route.request().postDataJSON();
      if (state.chatCalls === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify({ error: { message: 'Synthetic terminal failure', retryable: false } })}\n\ndata: [DONE]\n\n`,
        });
      }
      state.retryModelId = body.modelId;
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody(HEALED_PAGE),
      });
    },
    async drive(page, state) {
      await enterSignedInStudio(page);
      const prompt = page.locator('.app-shell--studio textarea').first();
      await visible(prompt, 'Coding composer is missing.');
      await prompt.fill(CODING_ASK);
      await prompt.press('Enter');
      const retry = page.getByRole('button', { name: /^Retry on DeepSeek V4 Flash$/ });
      await visible(retry, 'The failed turn promises recovery but hides its retry button.');
      if (state.chatCalls !== 1) throw new Error('Displaying recovery must not start another request.');
      // The shell retains its built-in available models alongside the fixture.
      const expectedModel = 'deepseek/deepseek-v4-flash-0731';
      if (await page.getByRole('button', { name: /Add real product photos|Add a payment gateway|Domestic or international/ }).count()) {
        throw new Error('A failed turn offered feature suggestions instead of only recovery.');
      }
      await retry.click();
      await page.waitForFunction(() => /Factory Schedule/.test(document.body.innerText), null, { timeout: 30_000 });
      if (state.chatCalls !== 2 || state.retryModelId !== expectedModel) {
        throw new Error(`Manual recovery did not use the displayed engine: ${JSON.stringify(state)}`);
      }
      if (await page.getByRole('button', { name: /^Retry on DeepSeek V4 Flash$/ }).count()) {
        throw new Error('The previous failed turn still offers recovery after a new answer.');
      }
    },
  });

  for (const rejectScheduling of [false, true]) {
    await runJourney(`worker-pilot-${rejectScheduling ? 'unconfirmed' : 'accepted'}`, {
      workerPilot: true, rejectScheduling,
      onChat(route, state) {
        state.chatCalls++;
        return route.fulfill({ status: 500, body: 'A worker-owned turn must not call chat.' });
      },
      async drive(page, state) {
        await enterSignedInStudio(page);
        // Bind a real desk through the UI before capability resolution.
        const prompt = page.locator('.app-shell--studio textarea').first();
        await prompt.fill(CODING_ASK);
        await waitForState(() => state.workflowCapabilities > 0, 'Pilot capability was never checked for the signed-in desk.');
        await prompt.press('Enter');
        await waitForState(() => state.workflowSubmissions === 1, 'The real chat send path did not submit to the worker.');
        const expected = rejectScheduling ? 'Background scheduling was not confirmed' : 'Your background submission was accepted';
        await page.getByText(expected, { exact: false }).last().waitFor({ state: 'visible', timeout: 10_000 });
        if (state.chatCalls || state.qirAttempts || state.browserRunCreates) throw new Error(`Worker ownership leaked: ${JSON.stringify(state)}`);
        // A fresh page load must not invent a replacement run while initialization is pending.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await enterSignedInStudio(page);
        if (state.browserRunCreates || state.chatCalls) throw new Error(`Reopen started another owner: ${JSON.stringify(state)}`);
      },
    });
  }

  await runJourney('worker-checkpoint-restoration', {
    onChat(route, state) {
      state.chatCalls++;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(HEALED_PAGE) });
    },
    async drive(page, state) {
      await enterSignedInStudio(page);
      const prompt = page.locator('.app-shell--studio textarea').first();
      await prompt.fill(CODING_ASK); await prompt.press('Enter');
      await waitForState(() => state.savedSteps.length > 0, 'Baseline was not durably saved.');
      await page.waitForTimeout(600);
      state.workerPilot = true;
      await page.goto(`${BASE_URL}/desk?workerPilot=1`);
      await enterSignedInStudio(page);
      await waitForState(() => state.workflowCapabilities > 0, 'Worker capability missing.');
      await prompt.fill('Add the independent worker result file.'); await prompt.press('Enter');
      await waitForState(() => state.workflowSubmissions === 1, 'Worker submission missing.');
      await page.getByText('Your background submission was accepted', { exact: false }).last().waitFor({ state: 'visible' });
      const earlierCalls = state.chatCalls;
      // Simulate a server publication while the observer is absent, including
      // the raw text storage format used by the real checkpoint endpoint.
      await page.goto('about:blank');
      state.savedSteps = planDeskCheckpointChain([{ id: 'worker-published', vfs: {
        'index.html': '<!doctype html><html><body><h1>Worker saved result</h1></body></html>',
        'worker-result.mjs': 'export const verifiedResult = 99;\n',
      } }]).steps;
      state.savedRevision++;
      state.completedRun = { runId: 'browser-pilot-run', status: 'COMPLETE', updatedAt: new Date().toISOString(),
        goal: { statement: 'Add the independent worker result file.', status: 'achieved' },
        steps: [], observations: [], verifications: [], checkpoints: [],
        artifacts: [{ artifactId: 'coding-desk-vfs', state: 'verified', generation: 1 }],
        workingContext: { projectState: { sessionId: state.submitted.sessionId, executionOwner: 'server', submissionHash: state.submitted.workspaceHash } },
      };
      await page.goto(`${BASE_URL}/desk?workerPilot=1`);
      await enterSignedInStudio(page);
      await visible(page.getByRole('button', { name: 'worker-result.mjs', exact: true }), 'Published server files cannot be opened in the file tree.', 15_000);
      await page.waitForTimeout(600);
      await page.reload();
      await enterSignedInStudio(page);
      await visible(page.getByRole('button', { name: 'worker-result.mjs', exact: true }), 'Published files disappeared after saving and reopening the desk.', 15_000);
      if (state.chatCalls !== earlierCalls || state.browserRunCreates) throw new Error('Restoration executed a new browser turn.');
    },
  });

  mkdirSync('artifacts/e2e', { recursive: true });
  console.log('QIR production recovery browser gate passed: Study isolation, Coding auto-recovery, explicit retry on the displayed engine, and exclusive worker handoff on acceptance and scheduling failure.');
} catch (error) {
  console.error('QIR production recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
