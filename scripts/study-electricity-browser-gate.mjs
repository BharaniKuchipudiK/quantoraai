#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Study Electricity Gate', latencyMs: 20, modelId: 'synthetic-study', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
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
          sub: 'synthetic-electricity-student',
          name: 'Synthetic Electricity Student',
          email: 'electricity-student@quantora.test',
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
        models: [{ id: 'synthetic-study', name: 'Synthetic Study', provider: 'Synthetic', available: true }],
      }),
    });
  }

  if (path === '/api/chat') {
    const body = request.postDataJSON();
    const message = String(body?.message || '');
    const electricity = /emf|terminal potential difference|battery circuit/i.test(message);
    const reply = electricity
      ? [
          '<quantora-study-picture caption="EMF and terminal potential difference: energy per coulomb supplied by the battery splits into useful energy per coulomb in the external circuit and energy per coulomb lost in internal resistance" />',
          '',
          'A real cell has internal resistance. Its EMF is the energy supplied per coulomb by the source; the terminal potential difference is the useful energy transferred per coulomb to the external circuit. When current flows, the internal drop is Ir, so ε = V + Ir.',
        ].join('\n')
      : [
          '<quantora-study-picture caption="Passenger motion when a vehicle brakes: velocity continues forward while the braking force acts backward" />',
          '',
          'When a vehicle brakes, the passenger initially keeps the same forward velocity until a backward force changes that velocity.',
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

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');

  await textarea.fill('Explain Newtonian inertia visually.');
  await textarea.press('Enter');
  await visible(
    page.locator('[data-quantora-study-picture="physics-motion"][data-quantora-study-picture-variant="braking-inertia"]').first(),
    'Baseline mechanics lesson did not render its expected physics visual.',
  );

  await textarea.fill('Now switch topics. Explain EMF and terminal potential difference in a battery circuit. Show me visually.');
  await textarea.press('Enter');

  const latestLesson = page.locator('[data-quantora-study-lesson="true"]').last();
  await visible(latestLesson, 'The Electricity lesson did not render.');
  await visible(
    latestLesson.locator('[data-quantora-study-picture="electricity-circuit"]').first(),
    'The current Electricity lesson did not render the native circuit family.',
  );
  await visible(
    latestLesson.locator('[data-quantora-study-picture-variant="emf-terminal-voltage"]').first(),
    'The EMF lesson did not select the terminal-voltage energy-flow variant.',
  );

  if (await latestLesson.locator('[data-quantora-study-picture="physics-motion"]').count()) {
    throw new Error('Old mechanics context leaked a physics renderer into the current Electricity lesson.');
  }

  const lessonText = await latestLesson.textContent();
  for (const truth of ['EMF ε', 'lost volts = Ir', 'terminal p.d. V', 'ε = V + Ir']) {
    if (!lessonText?.includes(truth)) throw new Error(`Electricity teaching visual is missing: ${truth}`);
  }

  console.log('Study Electricity browser gate passed: topic switch -> native EMF/terminal-voltage visual, no mechanics leakage.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/study-electricity-browser-gate-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
