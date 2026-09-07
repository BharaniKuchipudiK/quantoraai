#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const VALID_VIDEO_ID = 'studyvalid123';
const DEAD_VIDEO_ID = 'studydead123';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
let assessmentIssueCount = 0;
let compassRequestBody = null;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Study Gate', latencyMs: 20, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

function syntheticAttemptId(index) {
  return `11111111-1111-4111-8111-${String(index).padStart(12, '1')}`;
}

function syntheticAssessmentItem(index) {
  if (index <= 3) {
    return {
      itemKey: 'motion-graphs-velocity-slope',
      itemVersion: '1',
      conceptKey: 'physics.kinematics.motion-graphs',
      prompt: 'On a displacement-time graph, what does the slope at a point represent?',
      options: [
        { id: 'a', text: 'Acceleration' },
        { id: 'b', text: 'Displacement' },
        { id: 'c', text: 'Velocity' },
        { id: 'd', text: 'Distance travelled' },
      ],
      responseFormat: 'single_correct',
    };
  }
  if (index === 4) {
    return {
      itemKey: 'motion-graphs-session-velocity',
      itemVersion: '1',
      conceptKey: 'physics.kinematics.motion-graphs',
      prompt: 'For a displacement-time graph, which quantity does its slope describe?',
      options: [
        { id: 'a', text: 'Acceleration' },
        { id: 'b', text: 'Distance only' },
        { id: 'c', text: 'Velocity' },
        { id: 'd', text: 'Force' },
      ],
      responseFormat: 'single_correct',
    };
  }
  if (index === 5) {
    return {
      itemKey: 'motion-graphs-session-acceleration',
      itemVersion: '1',
      conceptKey: 'physics.kinematics.motion-graphs',
      prompt: 'For a velocity-time graph, which quantity does its slope describe?',
      options: [
        { id: 'a', text: 'Displacement' },
        { id: 'b', text: 'Velocity' },
        { id: 'c', text: 'Acceleration' },
        { id: 'd', text: 'Distance' },
      ],
      responseFormat: 'single_correct',
    };
  }
  return {
    itemKey: `motion-graphs-session-zero-${index}`,
    itemVersion: '1',
    conceptKey: 'physics.kinematics.motion-graphs',
    prompt: 'If a displacement-time graph is horizontal, what is the velocity?',
    options: [
      { id: 'a', text: 'Increasing' },
      { id: 'b', text: 'Negative' },
      { id: 'c', text: 'Zero' },
      { id: 'd', text: 'Undefined' },
    ],
    responseFormat: 'single_correct',
  };
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
          sub: 'synthetic-study-user',
          name: 'Synthetic Student',
          email: 'student@quantora.test',
          picture: null,
          isAdmin: false,
        },
      }),
    });
  }

  if (path === '/api/study-learning-compass') {
    compassRequestBody = request.postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        recommendations: [{
          conceptId: '22222222-2222-4222-8222-222222222222',
          conceptKey: 'physics.forces.newtons-third-law',
          label: "Newton's Third Law",
          rank: 1,
          score: 0.82,
          recommendedActionType: 'guided_repair',
          factors: [
            { key: 'masteryGap', contribution: 0.2 },
            { key: 'prerequisiteLeverage', contribution: 0.18 },
          ],
          reasonCodes: ['next_move:guided_repair'],
          confidence: 0.74,
          confidenceBand: 'high',
          dataSufficiency: 'sufficient',
          missingInputs: ['curriculum_exam_weight'],
          suggestedDurationMinutes: 15,
          baseDurationMinutes: 15,
          fitsAvailableTime: true,
        }],
      }),
    });
  }

  if (path === '/api/models') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
          { id: 'synthetic-b', name: 'Synthetic B', provider: 'Synthetic', available: true },
        ],
      }),
    });
  }

  if (path === '/api/youtube-validate') {
    const id = url.searchParams.get('id');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(id === VALID_VIDEO_ID
        ? { valid: true, id, title: 'Verified Study lesson', authorName: 'Synthetic Teacher' }
        : { valid: false, id: id || '', reason: 'unavailable' }),
    });
  }

  if (path === '/api/chat') {
    const body = request.postDataJSON();
    const reply = /quantora-study-flashcard|Create 3 to 5 genuine recall flashcards/i.test(body?.message || '') ? [
      'Flashcard Set: Inertia',
      '',
      '| Front | Back |',
      '| --- | --- |',
      '| 1. What is inertia? | Resistance to a change in velocity. |',
      '| 2. Is inertia a force? | No. It is a property of mass. |',
      '| 3. With zero net force, what stays constant? | Velocity. |',
    ].join('\n') : [
      "**Why it's relevant:** You feel inertia when a car brakes and your body keeps moving forward until the seatbelt changes your motion.",
      '',
      '<quantora-study-picture caption="Passenger motion when a car brakes and stops" />',
      '',
      `- [Verified Study lesson](https://www.youtube.com/watch?v=${VALID_VIDEO_ID}) — watch this inside Quantora.`,
      `- [Dead Study lesson](https://www.youtube.com/watch?v=${DEAD_VIDEO_ID}) — this must never be offered.`,
      '',
      '**Context-aware question:** Which force changes your forward velocity when the car stops?',
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

  if (path === '/api/study-assessment') {
    const body = request.postDataJSON();
    if (body.action === 'issue') {
      assessmentIssueCount += 1;
      if (assessmentIssueCount === 1) {
        return route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This topic is not mapped to a reviewed assessment yet.',
            code: 'verified_assessment_unavailable',
            fallbackAllowed: true,
          }),
        });
      }
      if (assessmentIssueCount === 5 && !body.excludeItemRefs?.includes('motion-graphs-session-velocity@1')) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'All-at-once session failed to reserve the prior reviewed item.' }),
        });
      }
      const item = syntheticAssessmentItem(assessmentIssueCount);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          attemptId: syntheticAttemptId(assessmentIssueCount),
          expiresAt: '2026-08-26T12:15:00.000Z',
          concept: { key: 'physics.kinematics.motion-graphs', label: 'Motion graphs' },
          evidenceKind: 'assessment_item',
          item,
        }),
      });
    }
    if (body.action === 'grade') {
      const correct = body.optionId === 'c';
      const quickCheckAttempt = String(body.attemptId || '').endsWith('2') || String(body.attemptId || '').endsWith('3');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recorded: true,
          duplicate: false,
          correct,
          score: correct ? 1 : 0,
          misconceptionSignal: !correct,
          explanation: quickCheckAttempt
            ? 'The slope is change in displacement divided by change in time, which is velocity.'
            : 'The graph relationship was graded by the governed assessment path.',
          evidenceKind: 'assessment_item',
          masteryUpdated: true,
          mastery: { status: 'provisional', learningState: 'emerging_understanding', evidenceCount: 1 },
        }),
      });
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected synthetic assessment request.' }),
    });
  }

  if (path === '/api/study-assessment-history') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ windowDays: 30, assessments: [] }),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

async function visible(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function hidden(locator, message, timeout = 5000) {
  await locator.waitFor({ state: 'hidden', timeout }).catch(() => {});
  if (await locator.isVisible().catch(() => false)) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  await hidden(
    page.locator('[data-quantora-sidebar-canvas]').first(),
    'Generic developer Canvas navigation leaked into Study.',
  );
  await visible(page.locator('[data-quantora-workspace-capabilities="education"]').first(), 'Study capability surface is missing.');

  const textarea = page.locator('.app-shell--studio textarea').first();
  await visible(textarea, 'Study prompt input is missing.');
  await textarea.fill("Teach me Newton's laws and give me one useful video lesson");
  await textarea.press('Enter');

  const validLink = page.getByRole('link', { name: 'Verified Study lesson', exact: true }).first();
  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('.markdown-prose a')]
      .find((node) => node.textContent?.trim() === 'Verified Study lesson');
    const play = link?.nextElementSibling;
    return link?.dataset.quantoraYoutubeValidation === 'valid'
      && link.hidden === false
      && play?.dataset.quantoraYoutubePlay === 'true'
      && play.hidden === false
      && play.disabled === false;
  });
  await visible(validLink, 'Study did not render the verified video after validation.');
  if (await page.locator('[data-quantora-study-answer-affordance]').count()) {
    throw new Error('The lesson rendered a second composer; the studio must have exactly one input.');
  }
  await page.waitForFunction(() => {
    const box = document.querySelector('.app-shell--studio textarea');
    return /write your answer to the question above/i.test(box?.getAttribute('placeholder') || '');
  }, undefined, { timeout: 10_000 }).catch(() => {
    throw new Error('A tutor question did not anchor itself in the composer placeholder.');
  });
  await visible(page.locator('[data-quantora-study-picture="physics-motion"]').first(), 'Physics lesson did not render a labeled motion/force diagram.');
  await visible(page.locator('[data-quantora-study-picture-variant="braking-inertia"]').first(), 'Inertia lesson fell back to a mismatched generic force diagram.');
  await hidden(page.locator('[data-quantora-study-your-turn="true"]').first(), 'Legacy Your turn banner is still rendered.');

  const lesson = page.locator('[data-quantora-study-lesson="true"]').last();
  const lessonMetrics = await lesson.evaluate((node) => {
    const styles = getComputedStyle(node);
    return {
      width: node.getBoundingClientRect().width,
      parentWidth: node.parentElement?.getBoundingClientRect().width || 0,
      fontFamily: styles.fontFamily,
    };
  });
  if (lessonMetrics.width < 800) throw new Error(`Study explanation still wastes horizontal space (${Math.round(lessonMetrics.width)}px).`);
  if (lessonMetrics.parentWidth && lessonMetrics.width / lessonMetrics.parentWidth < 0.94) {
    throw new Error(`Study explanation still caps the reading column (${Math.round(lessonMetrics.width)}px of ${Math.round(lessonMetrics.parentWidth)}px).`);
  }
  if (!/Inter/i.test(lessonMetrics.fontFamily) || /Nunito/i.test(lessonMetrics.fontFamily)) {
    throw new Error(`Study explanation uses the wrong font (${lessonMetrics.fontFamily}).`);
  }
  const lessonText = await lesson.innerText();
  if (/Why it's relevant|Context-aware question|Write your attempt|I will wait/i.test(lessonText)) {
    throw new Error('Study rendered robotic response-shaping labels instead of natural tutor prose.');
  }

  const deadLink = page.getByRole('link', { name: 'Dead Study lesson', exact: true }).first();
  await deadLink.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await deadLink.count()) throw new Error('Study kept an unavailable YouTube recommendation in the answer.');

  const play = page.locator('a[data-quantora-youtube-validation="valid"] + button[data-quantora-youtube-play="true"]').first();
  await visible(play, 'Study verified video has no usable Play action.');

  const pagesBeforeTitle = context.pages().length;
  await validLink.click();
  const mediaCanvas = page.locator('[data-quantora-media-canvas="youtube"]').first();
  await visible(mediaCanvas, 'Study video title did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforeTitle) throw new Error('Study video title opened a new browser tab.');
  await visible(mediaCanvas.getByText('Open on YouTube ↗', { exact: true }), 'Study Canvas has no explicit external YouTube action.');

  await page.keyboard.press('Escape');
  await hidden(mediaCanvas, 'Escape did not close the Study media Canvas.');

  const pagesBeforePlay = context.pages().length;
  await play.click();
  await visible(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Study Play action did not open the Quantora media Canvas.');
  if (context.pages().length !== pagesBeforePlay) throw new Error('Study Play action opened a new browser tab.');

  await page.keyboard.press('Escape');
  await hidden(page.locator('[data-quantora-media-canvas="youtube"]').first(), 'Study media Canvas did not close after playback test.');

  await hidden(page.locator('[data-quantora-fork-chat]').first(), 'Top-level Fork Chat leaked into Study.');
  await visible(page.locator('[data-quantora-message-fork="true"]').last(), 'Study response footer is missing Fork Chat.');

  const board = page.locator('[data-quantora-study-board="true"]').first();
  await visible(board, 'Study answered about a concept but showed no tutor focus.');
  await visible(board.getByText("Newton's laws", { exact: false }).first(), 'Tutor focus did not name the concept the student asked about.');
  await visible(board.getByRole('button', { name: 'Explain', exact: true }), 'Compact Study focus has no Explain action.');
  await visible(board.getByRole('button', { name: 'Practice', exact: true }), 'Compact Study focus has no Practice action.');
  await visible(board.locator('[data-quantora-study-next-choices="true"]'), 'Study did not offer learner-directed next paths.');
  await visible(board.getByRole('button', { name: 'Test me on this', exact: true }), 'Compact Study focus has no Check action.');
  await hidden(board.getByRole('button', { name: 'More', exact: true }), 'Legacy Tutor Board More action is still present.');

  for (const oldAlwaysVisibleAction of [/Mini practice/, /Real world/, /Quick sketch/, /Did you know/, /Where next/]) {
    if (await board.getByRole('button', { name: oldAlwaysVisibleAction }).count()) {
      throw new Error(`Study revived a secondary tool as a permanent action (${oldAlwaysVisibleAction}).`);
    }
  }

  const studyHub = page.locator('[data-quantora-study-hub-launcher="true"]').first();
  await visible(studyHub, 'Study progressive-disclosure AI launcher is missing.');
  const openStudyHub = studyHub.getByRole('button', { name: 'Open Study AI', exact: true });
  await visible(openStudyHub, 'Study AI has no accessible open action.');
  await openStudyHub.click();
  const studyHubPanel = page.locator('#quantora-study-hub-panel').first();
  await visible(studyHubPanel, 'Study AI did not open.');
  for (const actionName of ['Explain differently', 'Show visually', 'Real-world example', 'Where next?']) {
    await visible(studyHubPanel.getByRole('button', { name: actionName, exact: true }), `Study AI is missing ${actionName}.`);
  }
  for (const duplicateName of ['Flashcards', 'Notebook', 'Make concise notes', 'Assessment history']) {
    if (await studyHubPanel.getByRole('button', { name: duplicateName, exact: true }).count()) {
      throw new Error(`Study AI still duplicates a durable Study action: ${duplicateName}.`);
    }
  }
  await studyHubPanel.getByRole('button', { name: 'Where next?', exact: true }).click();
  const compass = studyHubPanel.locator('[data-quantora-study-learning-compass="true"]');
  await visible(compass, 'Where next did not open the governed Learning Compass.');
  await visible(compass.getByText('Your highest-value next step', { exact: true }), 'Learning Compass has no clear purpose.');
  await visible(compass.getByText("Newton's Third Law", { exact: true }), 'Learning Compass did not render the ranked recommendation.');
  await visible(compass.getByRole('button', { name: 'Start this step', exact: true }), 'Learning Compass recommendation has no action.');
  if (compassRequestBody?.availableMinutes !== 20 || !compassRequestBody?.conceptLabel) {
    throw new Error('Learning Compass did not send the active Study concept and selected time budget.');
  }
  await page.keyboard.press('Escape');
  await hidden(studyHubPanel, 'Escape did not close the Study AI.');

  const explainRequestPromise = page.waitForRequest((candidate) => {
    if (new URL(candidate.url()).pathname !== '/api/chat') return false;
    try {
      return /Teach ONE idea/i.test(candidate.postDataJSON()?.message || '');
    } catch {
      return false;
    }
  }, { timeout: 10_000 });
  await board.getByRole('button', { name: 'Explain', exact: true }).click();
  const explainRequest = await explainRequestPromise;
  const friendlyExplain = page.getByText(/^Explain .+ like a real tutor\.$/).last();
  await visible(friendlyExplain, 'Study control exposed its internal model prompt instead of a learner-facing request.');
  if (!/Teach ONE idea/i.test(explainRequest.postDataJSON()?.message || '')) {
    throw new Error('Study learner-facing copy replaced the detailed model instruction instead of only hiding it.');
  }
  if (/Do not invent a specific YouTube|context-aware question|wait for the learner/i.test(await friendlyExplain.innerText())) {
    throw new Error('Internal Study prompt instructions leaked into the learner transcript.');
  }

  await page.locator('[data-quantora-plus-trigger="true"]').click();
  const studyPlus = page.locator('[data-quantora-studio-tools-menu="true"][data-quantora-plus-domain="education"]').first();
  await visible(studyPlus, 'Study + menu did not open.');
  for (const actionName of ['New topic', 'Assessment', 'Flashcards', 'Notebook']) {
    await visible(studyPlus.getByRole('button', { name: actionName, exact: true }), `Study + menu is missing ${actionName}.`);
  }
  await studyPlus.getByRole('button', { name: 'Flashcards', exact: true }).click();
  const deck = page.locator('[data-quantora-study-flashcards="true"]').last();
  await visible(deck, 'Study Flashcards rendered as prose or a table instead of an interactive deck.');
  await visible(deck.locator('[data-quantora-study-flashcard="front"]'), 'Flashcard front is not the initial recall state.');
  if (await deck.getByText('Resistance to a change in velocity.', { exact: true }).count()) {
    throw new Error('Flashcard answer leaked before the learner chose Reveal.');
  }
  await deck.locator('[data-quantora-study-flashcard="front"]').click();
  await visible(deck.getByText('Resistance to a change in velocity.', { exact: true }), 'Flashcard did not reveal its answer on demand.');
  await deck.getByRole('button', { name: /Next/i }).click();
  await visible(deck.getByText('Is inertia a force?', { exact: true }), 'Flashcard Next did not advance one card at a time.');
  await visible(deck.getByRole('button', { name: 'Reveal answer', exact: true }), 'Flashcard reveal control did not reset after advancing.');
  mkdirSync('artifacts/e2e', { recursive: true });
  await deck.screenshot({ path: 'artifacts/e2e/study-flashcards-pass.png' });

  const focusHeight = await board.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  if (focusHeight > 180) throw new Error(`Collapsed Study focus is still too tall (${focusHeight}px).`);

  // The first synthetic topic has no reviewed server assessment. The fallback
  // should continue in conversation and must never manufacture local mastery.
  await board.getByRole('button', { name: 'Test me on this', exact: true }).click();
  await page.waitForTimeout(250);
  await hidden(board.locator('[data-quantora-study-verified-check="true"]').first(), 'Unmapped Study topic rendered a fake verified check.');
  await hidden(board.locator('[data-quantora-study-verified-result]').first(), 'Unmapped Study topic rendered a fake verified result.');

  await textarea.fill('Teach me motion graphs');
  await textarea.press('Enter');
  await visible(board.getByText('motion graphs', { exact: false }).first(), 'Tutor focus did not switch to the mapped motion-graphs concept.');

  // Quick Check remains the compact lesson-level governed verification move.
  await board.getByRole('button', { name: 'Test me on this', exact: true }).click();
  const verifiedCheck = board.locator('[data-quantora-study-verified-check="true"]').first();
  await visible(verifiedCheck, 'Mapped Study concept did not receive a server-graded quick check.');
  await visible(verifiedCheck.getByText('On a displacement-time graph, what does the slope at a point represent?', { exact: true }), 'Server-issued Study prompt was not rendered.');
  await verifiedCheck.getByRole('button', { name: 'Acceleration', exact: true }).click();
  await visible(board.locator('[data-quantora-study-verified-result="incorrect"]').first(), 'Incorrect answer did not resolve into remediation.');
  await visible(board.getByText(/key distinction/i).first(), 'Incorrect answer did not receive precise, empathetic feedback.');
  await visible(board.getByRole('button', { name: 'Retry', exact: true }), 'Incorrect answer has no retry action.');
  await visible(board.getByRole('button', { name: 'Another example', exact: true }), 'Incorrect answer has no alternate example action.');
  await visible(board.getByRole('button', { name: 'Useful reference', exact: true }), 'Incorrect answer has no useful reference action.');
  mkdirSync('artifacts/e2e', { recursive: true });
  await board.screenshot({ path: 'artifacts/e2e/study-conversation-loop-remediation.png' });

  await board.getByRole('button', { name: 'Retry', exact: true }).click();
  await visible(verifiedCheck.getByRole('button', { name: 'Velocity', exact: true }), 'Explicit retry did not issue the check again.');
  await verifiedCheck.getByRole('button', { name: 'Velocity', exact: true }).click();
  await visible(board.locator('[data-quantora-study-verified-result="correct"]').first(), 'Correct server-graded Study result was not rendered.');
  await visible(board.getByText(/slope is change in displacement divided by change in time/i).first(), 'Verified Study explanation was not rendered.');
  await visible(board.locator('button', { hasText: 'Completed' }).first(), 'Completed check did not stay resolved.');
  if (assessmentIssueCount !== 3) throw new Error(`Completed quick check repeated without an explicit retry (${assessmentIssueCount} issues).`);

  // Assessment opens a dedicated setup surface; selecting it must not silently
  // reissue the completed quick-check attempt.
  await page.locator('[data-quantora-plus-trigger="true"]').click();
  const mappedStudyPlus = page.locator('[data-quantora-studio-tools-menu="true"][data-quantora-plus-domain="education"]').first();
  await visible(mappedStudyPlus, 'Study + menu did not reopen for Assessment.');
  await mappedStudyPlus.getByRole('button', { name: 'Assessment', exact: true }).click();
  const assessmentWorkspace = page.locator('[data-quantora-study-assessment-workspace="true"]').first();
  await visible(assessmentWorkspace, 'Study + Assessment did not open the dedicated Assessment workspace.');
  const setup = assessmentWorkspace.locator('[data-quantora-study-assessment-setup="true"]');
  await visible(setup, 'Assessment setup cards are missing.');
  if (assessmentIssueCount !== 3) throw new Error('Opening generic Assessment reissued a completed quick check before the learner started a session.');
  for (const setupChoice of [/MCQ/i, /One at a time/i, /All at once/i, /After each question/i, /At the end/i]) {
    await visible(setup.getByRole('button', { name: setupChoice }).first(), `Assessment setup is missing ${setupChoice}.`);
  }

  // Prove all-at-once: reserve two distinct reviewed attempts, answer together,
  // then grade through the server path and show an aggregate summary.
  await setup.getByRole('spinbutton', { name: 'Custom question count', exact: true }).fill('2');
  await setup.getByRole('button', { name: /All at once/i }).click();
  await setup.getByRole('button', { name: 'Start assessment', exact: true }).click();
  const batch = assessmentWorkspace.locator('[data-quantora-study-assessment-running="all_at_once"]');
  await visible(batch, 'All-at-once Assessment did not render the reserved reviewed questions.');
  const batchQuestions = batch.locator('.study-assessment-question');
  if (await batchQuestions.count() !== 2) throw new Error(`All-at-once Assessment reserved ${await batchQuestions.count()} questions instead of 2.`);
  await batchQuestions.nth(0).getByRole('button', { name: /Velocity/i }).click();
  await batchQuestions.nth(1).getByRole('button', { name: /Acceleration/i }).click();
  await batch.getByRole('button', { name: 'Submit all answers', exact: true }).click();
  let summary = assessmentWorkspace.locator('[data-quantora-study-assessment-summary="true"]');
  await visible(summary, 'All-at-once Assessment did not resolve to a session summary.');
  await visible(summary.getByText('2/2', { exact: true }), 'All-at-once Assessment aggregate score is wrong.');
  if (assessmentIssueCount !== 5) throw new Error(`All-at-once Assessment issued an unexpected number of attempts (${assessmentIssueCount}).`);

  // Prove one-at-a-time independently from the compact Quick Check.
  await summary.getByRole('button', { name: 'New assessment', exact: true }).click();
  const setupAgain = assessmentWorkspace.locator('[data-quantora-study-assessment-setup="true"]');
  await visible(setupAgain, 'New Assessment did not return to setup.');
  await setupAgain.getByRole('spinbutton', { name: 'Custom question count', exact: true }).fill('1');
  await setupAgain.getByRole('button', { name: /One at a time/i }).click();
  await setupAgain.getByRole('button', { name: /At the end/i }).click();
  await setupAgain.getByRole('button', { name: 'Start assessment', exact: true }).click();
  const single = assessmentWorkspace.locator('[data-quantora-study-assessment-running="one_at_a_time"]');
  await visible(single, 'One-at-a-time Assessment did not render a governed question.');
  await single.getByRole('button', { name: /Zero/i }).click();
  await visible(single.getByText('Answer recorded', { exact: true }), 'End-of-session feedback mode leaked the verdict or failed to record the answer.');
  await single.getByRole('button', { name: 'View results', exact: true }).click();
  summary = assessmentWorkspace.locator('[data-quantora-study-assessment-summary="true"]');
  await visible(summary, 'One-at-a-time Assessment did not resolve to summary.');
  await visible(summary.getByText('1/1', { exact: true }), 'One-at-a-time Assessment score is wrong.');
  if (assessmentIssueCount !== 6) throw new Error(`One-at-a-time Assessment issued an unexpected number of attempts (${assessmentIssueCount}).`);

  // History now has one coherent home inside Assessment, not Study AI.
  await summary.getByRole('button', { name: 'Assessment history', exact: true }).click();
  const history = assessmentWorkspace.locator('[data-quantora-study-assessment-history="true"]');
  await visible(history, 'Assessment History did not open inside Assessment.');
  await visible(history.getByRole('button', { name: 'Back to Assessment', exact: true }), 'Assessment History has the wrong parent navigation.');
  await history.getByRole('button', { name: 'Back to Assessment', exact: true }).click();
  await visible(summary, 'Assessment History did not return to the Assessment summary.');
  await assessmentWorkspace.getByRole('button', { name: 'Close Assessment', exact: true }).click();
  await hidden(assessmentWorkspace, 'Assessment workspace did not close.');

  await board.getByRole('button', { name: 'Close Study focus', exact: true }).click();
  const reopen = board.getByRole('button', { name: /Reopen Study focus/i }).first();
  await visible(reopen, 'Closing Study focus did not leave a reversible reopen chip.');
  await reopen.click();
  await visible(board.getByRole('button', { name: 'Explain', exact: true }), 'Reopening Study focus did not restore primary actions.');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/study-conversation-loop-pass.png', fullPage: true });
  await board.screenshot({ path: 'artifacts/e2e/study-conversation-loop-board.png' });

  console.log('Study media browser gate passed.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/study-conversation-loop-failure.png', fullPage: true }).catch(() => {});
  console.error('Study media browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
