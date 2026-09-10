#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
let savedOnboarding = null;
let checkNumber = 0;
let evidenceKind = 'transfer';
let duplicateGrade = false;
const conceptKey = 'physics.kinematics.motion-graphs';

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
      checkNumber += 1;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        attemptId: `11111111-1111-4111-8111-${String(checkNumber).padStart(12, '0')}`,
        evidenceKind,
        concept: { key: 'physics.kinematics.motion-in-plane', label: 'Motion in plane' },
        evidenceFor: { key: conceptKey, label: 'Motion graphs' },
        item: {
          itemKey: `synthetic-feedback-${checkNumber}`, itemVersion: '1', conceptKey: 'physics.kinematics.motion-in-plane',
          prompt: `Reviewed check ${checkNumber}: What does the slope represent?`,
          options: [{ id: 'a', text: 'Acceleration' }, { id: 'b', text: 'Velocity' }], responseFormat: 'single_correct',
        },
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      recorded: true, duplicate: duplicateGrade, correct: true, score: 1, misconceptionSignal: false,
      explanation: 'The slope still represents velocity in this changed context.', evidenceKind,
      delayDays: evidenceKind === 'retention_probe' ? 7 : null,
      evidenceConcept: { key: conceptKey, label: 'Motion graphs' },
      transferTarget: evidenceKind === 'transfer' ? 'physics.kinematics.motion-in-plane' : null,
      masteryUpdated: true,
      mastery: { status: 'provisional', learningState: 'emerging_understanding', evidenceCount: checkNumber },
      learnerModel: {
        concept: { key: conceptKey },
        understanding: { state: 'emerging', evidenceCount: checkNumber, observedThrough: `2026-09-10T00:00:${String(checkNumber).padStart(2, '0')}.000Z` },
        misconception: { state: 'none_observed', code: null, signalCount: 0, lastResolvedCode: null },
      },
    }) });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 7000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function noFeedback(message) {
  // Allow the grade's render/effects to settle before asserting absence.
  await page.waitForTimeout(250);
  if (await page.locator('[data-quantora-study-reinforcement]').count()) throw new Error(message);
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

  const still = await reinforcement.evaluate((node) => [node, ...node.querySelectorAll('*')]
    .every((element) => getComputedStyle(element).animationName === 'none' && getComputedStyle(element).transitionDuration === '0s'));
  if (!still) throw new Error('Reduced motion must disable card and child animations.');
  const live = await reinforcement.evaluate((node) => node.parentElement.getAttribute('role') === 'status'
    && node.parentElement.getAttribute('aria-atomic') === 'true');
  if (!live) throw new Error('Feedback lost its persistent, polite live region.');
  const dismiss = reinforcement.getByRole('button', { name: 'Dismiss learning feedback' });
  await dismiss.focus();
  await dismiss.press('Enter');
  await noFeedback('Keyboard dismissal failed.');
  await textarea.fill('Draft text, not a new learning event');
  await noFeedback('Editing a prompt replayed dismissed feedback.');

  async function nextGrade(kind, duplicate = false) {
    evidenceKind = kind;
    duplicateGrade = duplicate;
    const nextNumber = checkNumber + 1;
    await check.getByRole('button', { name: 'Retry this one', exact: true }).click();
    await visible(check.getByText(`Reviewed check ${nextNumber}: What does the slope represent?`, { exact: true }), 'Fresh reviewed item did not render.');
    await check.getByRole('button', { name: 'Velocity', exact: true }).click();
    await visible(check.locator('[data-quantora-study-verified-result="correct"]'), 'Fresh grade did not settle.');
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await nextGrade('retrieval');
  const recalled = page.locator('[data-quantora-study-reinforcement="retrieval"]');
  await visible(recalled, 'Independent retrieval recognition is missing.');
  const motion = await recalled.evaluate((node) => {
    const mark = getComputedStyle(node.querySelector('.study-h1-reinforcement__mark'));
    return { name: mark.animationName, count: mark.animationIterationCount, duration: mark.animationDuration };
  });
  if (motion.name !== 'study-h1-feedback-mark' || motion.count !== '1' || motion.duration !== '0.36s') throw new Error(`Feedback motion must be one restrained pulse: ${JSON.stringify(motion)}`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (await recalled.locator('.study-h1-reinforcement__mark').evaluate((node) => getComputedStyle(node).animationName !== 'none')) throw new Error('Changing reduced-motion preference did not stop motion.');

  await nextGrade('retrieval', true);
  await noFeedback('A duplicate grade replayed retrieval feedback.');
  await nextGrade('retention_probe');
  const retained = page.locator('[data-quantora-study-reinforcement="return"]');
  await visible(retained, 'Verified delayed-retention recognition is missing.');
  await visible(retained.getByText(/7 delayed days/), 'Retention feedback lost the server delay.');

  // Exercise the existing surface-request contract and actual assessment UI.
  evidenceKind = 'retrieval';
  const handled = await page.evaluate(() => {
    const detail = { surface: 'assessment', handled: false };
    window.dispatchEvent(new CustomEvent('quantora:study-surface-request', { detail }));
    return detail.handled;
  });
  if (!handled) throw new Error('Assessment surface request was not handled.');
  const assessment = page.locator('[data-quantora-study-assessment-workspace="true"]');
  await visible(assessment, 'Assessment workspace did not open.');
  await assessment.getByRole('spinbutton', { name: 'Custom question count' }).fill('1');
  await assessment.getByRole('button', { name: /At the end/ }).click();
  await assessment.getByRole('button', { name: 'Start assessment', exact: true }).click();
  const running = assessment.locator('[data-quantora-study-assessment-running="one_at_a_time"]');
  await visible(running, 'At-end assessment did not start.');
  await running.getByRole('button', { name: /Velocity/ }).click();
  await visible(running.getByText('Answer recorded', { exact: true }), 'At-end grade was not recorded.');
  await noFeedback('At-end assessment leaked the answer through positive feedback.');
  await running.getByRole('button', { name: 'View results', exact: true }).click();
  await visible(assessment.locator('[data-quantora-study-assessment-summary="true"]'), 'Assessment summary did not render.');
  await noFeedback('Revealing the summary replayed a consumed grade.');
  await assessment.getByRole('button', { name: 'Close Assessment', exact: true }).click();
  await noFeedback('Closing Assessment replayed a consumed grade.');

  console.log('Study H1.4 onboarding + PR11 evidence-aware feedback browser gate passed.');
} catch (error) {
  console.error('Study H1.4 browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
