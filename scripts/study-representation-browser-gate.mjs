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
    `data: ${JSON.stringify({ provider: 'Synthetic Study Representation Gate', latencyMs: 20, modelId: 'synthetic-study', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function enterStudio() {
  try {
    await enterSignedInStudio(page);
  } catch {
    // Landing CTA can miss the first hydration window. /desk is the durable
    // signed-in surface once the session stub is in place.
    await page.goto(new URL('/desk', BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.locator('.app-shell--studio textarea').first().waitFor({ state: 'visible', timeout: 20_000 });
  }
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
          sub: 'synthetic-study-representation-student',
          name: 'Synthetic Study Student',
          email: 'study-student@quantora.test',
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
    const mode = /workspace-isolation-check/.test(message)
      ? 'isolation'
      : /unsupported-concept/.test(message)
        ? 'unsupported'
        : /magnetic|right[- ]hand/.test(message)
          ? 'magnetic'
          : /displacement[- ]time/.test(message)
            ? 'displacement-time'
            : /quadrant/.test(message)
            ? 'quadrant'
            : /vector/.test(message)
              ? 'vector'
              : 'default';

    let reply = '';
    if (mode === 'vector') {
      reply = [
        '<quantora-study-picture caption="Resolve a vector into x and y components on the coordinate axes" />',
        '',
        'Split the resultant into horizontal and vertical components first. Predict which component increases when the angle increases, then answer that one check.',
      ].join('\n');
    } else if (mode === 'magnetic') {
      reply = [
        '<quantora-study-picture caption="Right-hand grip: thumb along current I, fingers curl in the magnetic field B around the wire" />',
        '',
        'Point your thumb along conventional current. Which way do your fingers give the magnetic field around the wire?',
      ].join('\n');
    } else if (mode === 'displacement-time') {
      reply = [
        '<quantora-study-picture caption="Displacement-time graph: the slope at a point is velocity, change in displacement over change in time" />',
        '',
        'On this graph the slope is change in displacement over change in time. What quantity is that?',
      ].join('\n');
    } else if (mode === 'quadrant') {
      reply = [
        '<quantora-study-picture caption="Quadrant II on the coordinate plane: x is negative and y is positive, so cosine is negative and sine is positive" />',
        '',
        'An angle in quadrant II has a negative x-coordinate. Which trig ratio must be negative there?',
      ].join('\n');
    } else if (mode === 'unsupported') {
      reply = [
        'No safe native visual renderer exists for this concept yet, so I will keep this concise and structured rather than pretending a diagram exists.',
        '',
        'State one concrete trade-off from the scenario in one sentence.',
      ].join('\n');
    } else if (mode === 'isolation') {
      reply = [
        'This workspace is Finance, so Study-specific visual policy is not applied.',
      ].join('\n');
    } else {
      reply = [
        '<quantora-study-picture caption="EMF and terminal potential difference: energy per coulomb supplied by the battery splits into useful energy per coulomb in the external circuit and energy per coulomb lost in internal resistance" />',
        '',
        'A real cell has internal resistance, so some supplied energy per coulomb is lost internally. What does the internal drop term Ir represent?',
      ].join('\n');
    }

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
  await enterStudio();

  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');
  const studyLessons = page.locator('[data-quantora-study-lesson="true"]');

  // 1) Supported visual request should render an actual visual.
  const lessonsBeforeVector = await studyLessons.count();
  await textarea.fill('Teach me vector components visually.');
  await textarea.press('Enter');
  const vectorLesson = studyLessons.nth(lessonsBeforeVector);
  await visible(vectorLesson, 'Vector lesson did not render.', 15_000);
  const vectorPicture = vectorLesson.locator('[data-quantora-study-picture="physics-motion"][data-quantora-study-picture-variant="vector-components"]').first();
  await visible(vectorPicture, 'Supported vector request did not render vector-components visual.', 15_000);

  const pictureSvg = vectorPicture.locator('svg[role="img"]').first();
  await visible(pictureSvg, 'Vector visual is missing a screen-reader image role.');
  const pictureLabel = String(await pictureSvg.getAttribute('aria-label') || '');
  if (!/vector|component/i.test(pictureLabel)) {
    throw new Error('Vector visual aria-label does not describe the instructional relationship.');
  }

  const vectorText = (await vectorLesson.textContent()) || '';
  if ((vectorText.match(/\?/g) || []).length > 1) {
    throw new Error('One-action pacing failed: vector lesson asked multiple learner questions.');
  }

  // 1b) A quadrant-sign request must not inherit the generic slope graph.
  const lessonsBeforeQuadrant = await studyLessons.count();
  await textarea.fill('Teach me quadrant II sine signs visually.');
  await textarea.press('Enter');
  const quadrantLesson = studyLessons.nth(lessonsBeforeQuadrant);
  await visible(quadrantLesson, 'Quadrant lesson did not render.', 15_000);
  const quadrantPicture = quadrantLesson.locator('[data-quantora-study-picture="graph"][data-quantora-study-picture-variant="quadrant"]').first();
  await visible(quadrantPicture, 'Quadrant request rendered a slope graph instead of the coordinate-sign visual.', 15_000);
  if (await quadrantLesson.locator('[data-quantora-study-picture-variant="slope"]').count()) {
    throw new Error('Quadrant lesson leaked the generic slope graph.');
  }
  const quadrantSvg = quadrantPicture.locator('svg[role="img"]').first();
  await visible(quadrantSvg, 'Quadrant visual is missing a screen-reader image role.');
  const quadrantLabel = String(await quadrantSvg.getAttribute('aria-label') || '');
  if (!/quadrant|sine|cosine|coordinate/i.test(quadrantLabel)) {
    throw new Error('Quadrant visual aria-label does not describe the sign relationship.');
  }
  const quadrantText = (await quadrantLesson.textContent()) || '';
  if ((quadrantText.match(/\?/g) || []).length > 1) {
    throw new Error('One-action pacing failed: quadrant lesson asked multiple learner questions.');
  }

  // 1c) A displacement-time request must teach velocity-as-slope, not a generic graph.
  const lessonsBeforeMotion = await studyLessons.count();
  await textarea.fill('Teach me a displacement-time graph visually.');
  await textarea.press('Enter');
  const motionLesson = studyLessons.nth(lessonsBeforeMotion);
  await visible(motionLesson, 'Displacement-time lesson did not render.', 15_000);
  const motionPicture = motionLesson.locator('[data-quantora-study-picture="graph"][data-quantora-study-picture-variant="displacement-time"]').first();
  await visible(motionPicture, 'Displacement-time request rendered a generic slope graph instead of the velocity-slope visual.', 15_000);
  if (await motionLesson.locator('[data-quantora-study-picture="physics-motion"], [data-quantora-study-picture-variant="slope"]').count()) {
    throw new Error('Displacement-time lesson leaked a free-body or generic slope picture.');
  }
  const motionSvg = motionPicture.locator('svg[role="img"]').first();
  await visible(motionSvg, 'Displacement-time visual is missing a screen-reader image role.');
  const motionLabel = String(await motionSvg.getAttribute('aria-label') || '');
  if (!/displacement|velocity|slope/i.test(motionLabel)) {
    throw new Error('Displacement-time visual aria-label does not describe the slope relationship.');
  }
  const motionText = (await motionLesson.textContent()) || '';
  if ((motionText.match(/\?/g) || []).length > 1) {
    throw new Error('One-action pacing failed: displacement-time lesson asked multiple learner questions.');
  }

  // 1d) A magnetic-field request must not inherit the electric +/− picture.
  const lessonsBeforeMagnetic = await studyLessons.count();
  await textarea.fill('Teach me magnetic field direction with the right-hand rule visually.');
  await textarea.press('Enter');
  const magneticLesson = studyLessons.nth(lessonsBeforeMagnetic);
  await visible(magneticLesson, 'Magnetic field lesson did not render.', 15_000);
  const magneticPicture = magneticLesson.locator('[data-quantora-study-picture="field-lines"][data-quantora-study-picture-variant="magnetic"]').first();
  await visible(magneticPicture, 'Magnetic-field request rendered the electric +/− picture instead of the right-hand-rule visual.', 15_000);
  if (await magneticLesson.locator('[data-quantora-study-picture-variant="electric"]').count()) {
    throw new Error('Magnetic-field lesson leaked the electric charge-pair picture.');
  }
  const magneticSvg = magneticPicture.locator('svg[role="img"]').first();
  await visible(magneticSvg, 'Magnetic-field visual is missing a screen-reader image role.');
  const magneticLabel = String(await magneticSvg.getAttribute('aria-label') || '');
  if (!/magnetic|right-hand|current|thumb/i.test(magneticLabel)) {
    throw new Error('Magnetic-field visual aria-label does not describe the right-hand relationship.');
  }
  const magneticText = (await magneticLesson.textContent()) || '';
  if ((magneticText.match(/\?/g) || []).length > 1) {
    throw new Error('One-action pacing failed: magnetic-field lesson asked multiple learner questions.');
  }

  // 2) Unsupported concept should fail honestly (no fake picture).
  // Wait for a NEW lesson. `.last()` is already visible from the vector turn,
  // so a negative picture check against it is a false fail on a fast runner.
  const lessonsBeforeUnsupported = await studyLessons.count();
  await textarea.fill('unsupported-concept: Teach opportunity cost visually.');
  await textarea.press('Enter');
  const unsupportedLesson = studyLessons.nth(lessonsBeforeUnsupported);
  await visible(unsupportedLesson, 'Unsupported concept lesson did not render.', 15_000);
  await page.waitForFunction((index) => {
    const lesson = document.querySelectorAll('[data-quantora-study-lesson="true"]')[index];
    return /no safe native visual renderer exists/i.test(lesson?.textContent || '');
  }, lessonsBeforeUnsupported, { timeout: 15_000 }).catch(() => {
    throw new Error('Unsupported concept fallback did not explicitly acknowledge renderer unavailability.');
  });
  if (await unsupportedLesson.locator('[data-quantora-study-picture]').count()) {
    throw new Error('Unsupported concept rendered a fake Study picture instead of failing honestly.');
  }
  const unsupportedText = (await unsupportedLesson.textContent()) || '';
  if (!/no safe native visual renderer exists/i.test(unsupportedText)) {
    throw new Error('Unsupported concept fallback did not explicitly acknowledge renderer unavailability.');
  }
  if ((unsupportedText.match(/\?/g) || []).length > 1) {
    throw new Error('One-action pacing failed: unsupported lesson asked multiple learner questions.');
  }

  // 3) Cross-workspace isolation: the newest Finance reply must not use StudyMarkdown.
  const finance = page.locator('[data-quantora-advisor="finance"]').first();
  await visible(finance, 'Finance workspace is missing.');
  await finance.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'finance');
  await visible(textarea, 'Shared prompt input missing after switching to Finance.');
  const financeReplies = page.locator('[data-quantora-assistant-prose="true"]');
  const repliesBeforeFinance = await financeReplies.count();
  await textarea.fill('workspace-isolation-check');
  await textarea.press('Enter');
  const financeReply = financeReplies.nth(repliesBeforeFinance);
  await visible(financeReply, 'Finance reply did not render.', 15_000);
  if (await financeReply.locator('[data-quantora-study-lesson], [data-quantora-study-picture]').count()) {
    throw new Error('Study representation surface leaked into the newest Finance reply.');
  }
  const financeText = (await financeReply.textContent()) || '';
  if (!/Finance/i.test(financeText)) {
    throw new Error('Finance isolation reply did not confirm the Finance workspace.');
  }

  console.log('Study representation browser gate passed: visual compliance, honest fallback, one-action pacing, accessibility label, and workspace isolation.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/study-representation-browser-gate-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
