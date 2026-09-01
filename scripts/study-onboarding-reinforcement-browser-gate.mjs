#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
let savedOnboarding = null;

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
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'synthetic-h14-user', name: 'Study Learner', email: 'study@quantora.test', picture: null, isAdmin: false } }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }) });
  }
  if (path === '/api/study-onboarding') {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: null, needsOnboarding: true }) });
    }
    savedOnboarding = request.postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { ...savedOnboarding, studyContext: savedOnboarding.studyContext, updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() } }) });
  }
  if (path === '/api/chat') {
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody('Motion graphs connect displacement and time. The slope of a displacement-time graph represents velocity. Which quantity does the slope represent?') });
  }
  if (path === '/api/study-assessment') {
    const body = request.postDataJSON();
    if (body.action === 'issue') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        attemptId: '11111111-1111-4111-8111-111111111111',
        evidenceKind: 'transfer',
        concept: { key: 'physics.kinematics.motion-in-plane', label: 'Motion in plane' },
        evidenceFor: { key: 'physics.kinematics.motion-graphs', label: 'Motion graphs' },
        item: {
          itemKey: 'synthetic-transfer', itemVersion: '1', conceptKey: 'physics.kinematics.motion-in-plane',
          prompt: 'A new context still uses the slope idea. What does the slope represent?',
          options: [{ id: 'a', text: 'Acceleration' }, { id: 'b', text: 'Velocity' }], responseFormat: 'single_correct',
        },
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      recorded: true, duplicate: false, correct: true, score: 1, misconceptionSignal: false,
      explanation: 'The slope still represents velocity in this changed context.', evidenceKind: 'transfer', delayDays: null,
      transferTarget: 'physics.kinematics.motion-in-plane', masteryUpdated: true,
      mastery: { status: 'established', learningState: 'verified_understanding', evidenceCount: 5 },
      learnerModel: { misconception: { lastResolvedCode: null } },
    }) });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 7000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  const onboarding = page.locator('[data-quantora-study-onboarding="true"]').first();
  await visible(onboarding, 'First-run Study onboarding did not appear before a topic was active.');
  await visible(onboarding.getByText(/planning context—not proof of what you know/i), 'Onboarding lost its self-report truth boundary.');
  await onboarding.getByRole('button', { name: /Continue/i }).click();
  await onboarding.getByRole('button', { name: 'School', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Subjects' }).fill('Physics, Mathematics');
  await onboarding.getByRole('button', { name: /Continue/i }).click();
  await onboarding.getByRole('button', { name: 'Prepare for an exam', exact: true }).click();
  await onboarding.getByRole('button', { name: /Continue/i }).click();
  await onboarding.getByRole('button', { name: 'Step by step', exact: true }).click();
  await onboarding.getByRole('checkbox').check();
  await onboarding.getByRole('button', { name: 'Start studying', exact: true }).click();
  await onboarding.waitFor({ state: 'detached', timeout: 5000 });

  if (!savedOnboarding || savedOnboarding.studyContext !== 'school' || savedOnboarding.goal !== 'exam') throw new Error('Study onboarding did not persist the learner context.');
  if (JSON.stringify(savedOnboarding).match(/mastery|understandingState|correct/i)) throw new Error('Study onboarding attempted to write learner truth fields.');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing after onboarding.');
  await textarea.fill('Teach me motion graphs');
  await textarea.press('Enter');

  const board = page.locator('[data-quantora-study-board="true"]').first();
  await visible(board, 'Study tutor focus did not appear after onboarding.');
  await board.getByRole('button', { name: 'Test me on this', exact: true }).click();
  const check = board.locator('[data-quantora-study-verified-check="true"]').first();
  await visible(check, 'Verified check did not render.');
  await check.getByRole('button', { name: 'Velocity', exact: true }).click();

  const reinforcement = page.locator('[data-quantora-study-reinforcement="transfer"]').first();
  await visible(reinforcement, 'Genuine transfer success did not trigger semantic reinforcement.');
  await visible(reinforcement.getByText('You transferred it.', { exact: true }), 'Transfer reinforcement used the wrong learner-facing recognition.');

  const duration = await reinforcement.evaluate((node) => getComputedStyle(node).animationDuration);
  if (duration !== '0s') throw new Error(`Reduced-motion preference was ignored (${duration}).`);

  console.log('Study H1.4 onboarding + reinforcement browser gate passed.');
} catch (error) {
  console.error('Study H1.4 browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
