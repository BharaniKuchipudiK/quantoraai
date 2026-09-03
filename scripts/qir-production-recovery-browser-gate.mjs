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
 */
import { mkdirSync } from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

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
const CODING_LEAK = /Preview was ready|Retry a smaller build|catalog photos|Coding desk|Add to Cart/i;
const STUDY_ADMISSION = /Temporarily unavailable|connection dropped|could not reach|Request failed|ran out of time|Stopped/i;

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

const browser = await chromium.launch({ headless: true });

async function runJourney(name, script) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const state = {
    chatCalls: 0,
    qirAttempts: 0,
    qirObserves: 0,
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
    if (path === '/api/qir-runs') {
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
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
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
        (pattern) => new RegExp(pattern, 'i').test(document.body.innerText),
        STUDY_ADMISSION.source,
        { timeout: 20_000 },
      );

      const text = await page.locator('body').innerText();
      if (CODING_LEAK.test(text)) {
        throw new Error(`Study route death leaked Coding Preview recovery: ${text.replace(/\s+/g, ' ').slice(0, 400)}`);
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
      if (state.qirAttempts < 1) {
        throw new Error('Coding recovery never journaled a QIR model attempt.');
      }
      const text = await page.locator('body').innerText();
      if (/Retry a smaller build/i.test(text)) {
        throw new Error('Coding auto-recovery still asked the person to tap Retry a smaller build.');
      }
    },
  });

  mkdirSync('artifacts/e2e', { recursive: true });
  console.log('QIR production recovery browser gate passed: Study kept its own failure; Coding healed and journaled.');
} catch (error) {
  console.error('QIR production recovery browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
