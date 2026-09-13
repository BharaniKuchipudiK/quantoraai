#!/usr/bin/env node
/**
 * Coding Desk must not jump to Study / Travel / Finance / Research mid-session.
 *
 * Mutation note: if resolveTurnStudioDomain / codingWorkspace sticky lock is
 * removed, the Study follow-up below promotes education and this gate fails.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Sticky Coding', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const calculatorReply = [
  'Done — here is a working calculator.',
  '',
  '```jsx',
  "import React, { useState } from 'react';\nimport { Delete } from 'lucide-react';\nexport default function Calculator(){ const [value,setValue]=useState('0'); return <main style={{padding:24}}><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button><Delete /></main>}",
  '```',
].join('\n');

const advisorishReply = 'Still on the calculator desk — I can tweak the preview without changing workspaces.';

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
  localStorage.removeItem('quantora_active_specialist_domain');
});

/** Every /api/chat body this run sent, so ROUTING can be proven and not assumed. */
const chatRequests = [];
const lastChatRequest = () => chatRequests[chatRequests.length - 1] || {};

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'sticky-coding-user', name: 'Sticky User', email: 'sticky@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/preview-compile') {
    const body = request.postDataJSON?.() || {};
    try {
      const compiled = await compilePreviewVfs(body.vfs || {}, { correlationId: body.correlationId });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(compiled) });
    } catch (error) {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: error?.message || 'Preview compilation failed.' }) });
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    chatRequests.push(body);
    const message = String(body.message || '');
    const reply = /calculator/i.test(message) ? calculatorReply : advisorishReply;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(reply),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 8000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function visibleFrame(selector, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const hit = frame.locator(selector).first();
      if (await hit.isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(200);
  }
  return null;
}

async function assertStaysCoding(label) {
  await page.waitForTimeout(600);
  const domain = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (['finance', 'travel', 'education', 'research'].includes(domain)) {
    throw new Error(`Coding desk jumped to ${domain} after: ${label}`);
  }
  await visible(
    page.locator('[data-quantora-code-workspace="true"]').first(),
    `Coding desk vanished after: ${label}`,
  );
  for (const specialist of ['finance', 'travel', 'education', 'research']) {
    if (await page.locator(`[data-quantora-active-specialist="${specialist}"]`).count()) {
      throw new Error(`${specialist} specialist stole the coding session after: ${label}`);
    }
  }
}

try {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Build me a simple calculator');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();

  const calculatorFrame = await visibleFrame('[data-testid="calculator-display"]', 20_000);
  if (!calculatorFrame) throw new Error('Calculator Preview never rendered for sticky coding gate.');
  await assertStaysCoding('calculator build');

  const hijackFollowUps = [
    'also help me study for the JEE exam and quiz me on homework',
    'also help me plan a trip with hotels and flights',
    'research the literature and investigate market scan evidence',
    'keep this under budget for my investment portfolio and taxes',
  ];

  for (const followUp of hijackFollowUps) {
    await prompt.fill(followUp);
    await prompt.press('Enter');
    await page.getByText(followUp.slice(0, 28), { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
    await assertStaysCoding(followUp);
  }

  // Positive control: empty non-coding chat can still open an advisor via sidebar click.
  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing.');
  await newChat.click();
  await page.waitForTimeout(400);

  const studyCard = page.locator('[data-quantora-advisor="education"]').first();
  await visible(studyCard, 'Study Tutor sidebar entry is missing.');
  await studyCard.click();
  await page.waitForTimeout(500);
  const domainAfterClick = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (domainAfterClick !== 'education') {
    throw new Error(`Explicit Study Tutor click did not open education (saw "${domainAfterClick || '(empty)'}").`);
  }
  if (!(await page.locator('[data-quantora-active-specialist="education"]').count())) {
    throw new Error('Explicit Study Tutor click did not mark the specialist active.');
  }

  /*
   * A COLD CHAT IS ANSWERED BY THE RIGHT DESK AND STILL DOES NOT MOVE
   * (2026-09-07).
   *
   * This step used to assert the opposite of its first half: a cold finance
   * question had to re-skin the studio to Finance Advisor. That is what people
   * reported as "a New chat with no workspace suddenly moves to Finance
   * Advisor" — the chat had not moved, but its chrome had, and from the
   * outside there is no difference.
   *
   * BOTH HALVES ARE ASSERTED, deliberately, because either alone is a check
   * that cannot fail for the reason that matters. Asserting only that the
   * chrome stays put would pass with advisor routing entirely dead — the exact
   * shape of gate this project has thrown away before. So:
   *
   *   1. the studio does NOT re-skin  (the chat stays where it started), and
   *   2. the request still asked for the finance desk  (the tools still answer).
   *
   * Mutation note: restore `studioDomain || inferredDomain` in
   * chromeDomainForSession and half 1 fails; stop sending the inferred desk
   * from useChatStream and half 2 fails.
   */
  await newChat.click();
  await page.waitForTimeout(400);
  await prompt.fill('help me with my taxes and portfolio');
  await prompt.press('Enter');
  await page.getByText(/help me with my taxes and portfolio/i).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(800);

  const domainAfterColdFinance = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (domainAfterColdFinance) {
    throw new Error(`A top-level New Chat re-skinned itself to "${domainAfterColdFinance}". A chat stays where it started; only a person moves it.`);
  }
  for (const specialist of ['finance', 'travel', 'education', 'research']) {
    if (await page.locator(`[data-quantora-active-specialist="${specialist}"]`).count()) {
      throw new Error(`A top-level New Chat marked ${specialist} active. Inference routes the turn; it does not claim the chat.`);
    }
  }
  const coldFinanceRequest = lastChatRequest();
  if (coldFinanceRequest.studioDomain !== 'finance') {
    throw new Error(`The cold finance question was not routed to the finance desk (request asked for "${coldFinanceRequest.studioDomain || '(none)'}"). The chrome staying put must not cost the answer its tools.`);
  }

  /*
   * WORKSPACES PIN EXECUTION; PROJECTS OWN VISIBLE CHAT HISTORY (2026-09-13).
   *
   * A chat opened from the "+" beside a workspace is still pinned there for
   * routing and continuity. The UI no longer duplicates the same chat tree
   * underneath every workspace, however: Projects are the canonical visible
   * history. This gate therefore proves both halves independently — hidden
   * ownership hooks still name the workspace, while visible Project history is
   * where a person reopens the chat.
   */
  const advisorDomains = ['finance', 'travel', 'education', 'research'];
  const workspaceDomain = () => page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  const visibleHistoryRow = (pattern) => page.locator('[data-quantora-sidebar-chat]:visible', { hasText: pattern }).first();
  async function assertNoAdvisor(label) {
    await page.waitForTimeout(600);
    const domain = await workspaceDomain();
    if (advisorDomains.includes(domain)) throw new Error(`Chat opened from the Coding desk jumped to ${domain} after: ${label}`);
    for (const specialist of advisorDomains) {
      if (await page.locator(`[data-quantora-active-specialist="${specialist}"]`).count()) {
        throw new Error(`${specialist} specialist stole a chat opened from the Coding desk after: ${label}`);
      }
    }
  }

  // 1. "+" beside the Coding desk opens a coding chat; a trip question stays in it.
  const codingPlus = page.locator('[data-quantora-workspace-new-chat="coding"]').first();
  await visible(codingPlus, 'The "+" beside the Coding desk is missing.');
  await codingPlus.click();
  await assertNoAdvisor('clicking "+" beside the Coding desk');
  const pinnedTrip = 'help me plan a trip with hotels and flights';
  await prompt.fill(pinnedTrip);
  await prompt.press('Enter');
  await page.getByText(pinnedTrip, { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await assertNoAdvisor(`"${pinnedTrip}" in a chat opened from the Coding desk`);

  // 2. Ownership stays Coding, while the visible row lives in Project history.
  const codingOwnership = page.locator('[data-quantora-workspace-chats="coding"] [data-quantora-sidebar-chat]', { hasText: /help me plan a trip/i });
  if (!(await codingOwnership.count())) throw new Error('The chat opened from the Coding desk lost its Coding workspace ownership.');
  for (const domain of advisorDomains) {
    if (await page.locator(`[data-quantora-workspace-chats="${domain}"] [data-quantora-sidebar-chat]`, { hasText: /help me plan a trip/i }).count()) {
      throw new Error(`The chat opened from the Coding desk was reassigned to ${domain}.`);
    }
  }
  const pinnedTripRow = visibleHistoryRow(/help me plan a trip/i);
  await visible(pinnedTripRow, 'The chat opened from the Coding desk is missing from visible Project history.');

  // 3. Folding workspace chrome does not hide or rewrite canonical Project history.
  const codingFold = page.locator('[data-quantora-workspace-collapse="coding"]').first();
  await visible(codingFold, 'The fold beside the Coding desk is missing.');
  await codingFold.click();
  await page.waitForTimeout(250);
  if ((await codingFold.getAttribute('aria-expanded')) !== 'false') throw new Error('The folded Coding desk still says it is expanded.');
  if (advisorDomains.includes(await workspaceDomain())) throw new Error('Folding the Coding desk changed the open chat.');
  await visible(pinnedTripRow, 'Folding the Coding workspace incorrectly hid Project history.');
  await codingFold.click();
  await page.waitForTimeout(250);
  await visible(pinnedTripRow, 'Unfolding the Coding desk lost its Project history row.');

  // 4. "+" beside the Travel Advisor opens a Travel chat; a money question stays in it.
  const travelPlus = page.locator('[data-quantora-workspace-new-chat="travel"]').first();
  await visible(travelPlus, 'The "+" beside the Travel Advisor is missing.');
  await travelPlus.click();
  await page.waitForTimeout(400);
  const domainAfterTravelPlus = await workspaceDomain();
  if (domainAfterTravelPlus !== 'travel') throw new Error(`"+" beside the Travel Advisor opened "${domainAfterTravelPlus || '(empty)'}" instead of travel.`);
  const pinnedMoney = 'keep this under budget for my investment portfolio and taxes';
  await prompt.fill(pinnedMoney);
  await prompt.press('Enter');
  await page.getByText(pinnedMoney, { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(800);
  const domainAfterPinnedMoney = await workspaceDomain();
  if (domainAfterPinnedMoney !== 'travel') throw new Error(`A chat opened from the Travel Advisor jumped to "${domainAfterPinnedMoney || '(empty)'}" on a money question.`);
  const travelOwnership = page.locator('[data-quantora-workspace-chats="travel"] [data-quantora-sidebar-chat]', { hasText: /under budget/i });
  if (!(await travelOwnership.count())) throw new Error('The chat opened from Travel lost its Travel workspace ownership.');
  const travelRow = visibleHistoryRow(/under budget/i);
  await visible(travelRow, 'The chat opened from Travel is missing from visible Project history.');

  // 5. Leaving the Travel chat for Coding must not rewrite it; reopen via Projects.
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  await assertNoAdvisor('clicking the Coding desk row from a Travel chat');
  await visible(travelRow, 'Leaving the Travel chat removed it from visible Project history.');
  await travelRow.click();
  await page.waitForTimeout(400);
  const domainBackInTravel = await workspaceDomain();
  if (domainBackInTravel !== 'travel') throw new Error(`Leaving the Travel chat for the Coding desk rewrote its desk to "${domainBackInTravel || '(empty)'}".`);

  /*
   * 6. THE TOP-LEVEL NEW CHAT DOES NOT LEAVE (2026-09-06).
   *
   * Reported: "when I click on New chat and start working, suddenly this chat
   * jumps to a different Workspace ... becomes part of Travel Workspace and
   * sometimes goes to Study Tutor." The turn's inferred desk was written to
   * the session as studioDomain — the field the sidebar groups by — so the
   * FIRST message moved the chat out of the list it was started in.
   *
   * Mutation note: restore `studioDomain: turnDomain` at the updateActiveSession
   * call in useChatStream and this step fails as "jumped to travel".
   */
  // Anchored on the durable hook, not the words on the button (CLAUDE.md §6).
  const topLevelNewChat = page.locator('[data-quantora-new-chat="true"]').first();
  await visible(topLevelNewChat, 'The top-level New Chat button is missing.');
  await topLevelNewChat.click();
  await page.waitForTimeout(400);
  const tripInGeneral = 'help me plan a trip to Kyoto with hotels and flights';
  await prompt.fill(tripInGeneral);
  await prompt.press('Enter');
  await page.getByText(tripInGeneral, { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(600);
  /*
   * Membership is where the sidebar FILES the chat, not which advisor chrome
   * the turn opened. The Travel desk answering a trip question is the feature;
   * the chat leaving the list the person started it in is the defect. So this
   * asserts the lists, and deliberately does not assert `data-quantora-domain`
   * — the cold-advisor step above owns that, and the two must not contradict.
   */
  /*
   * THE CODING DESK IS NOT A DEFAULT (2026-09-07). This step first asserted
   * the chat was filed under "coding", which encoded the bug it was meant to
   * catch: the Coding desk is the null domain, so "no workspace" and "coding"
   * were the same value and every plain chat landed on the desk. Reported as
   * "when you click on a New chat, it goes straight to Coding Desk ... it
   * should not associate with a workspace". A top-level New Chat now belongs
   * to NO workspace, the desks included.
   */
  for (const domain of [...advisorDomains, 'coding']) {
    if (await page.locator(`[data-quantora-workspace-chats="${domain}"] [data-quantora-sidebar-chat]`, { hasText: /plan a trip to Kyoto/i }).count()) {
      throw new Error(`A chat started from the top-level New Chat was filed under ${domain}. New Chat belongs to no workspace — only the "+" beside one puts a chat inside it.`);
    }
  }
  // It must still exist somewhere the person can reach it, or this is a delete.
  const generalRow = visibleHistoryRow(/plan a trip to Kyoto/i);
  await visible(generalRow, 'A chat started from the top-level New Chat is not visible in Project history — unfiled must mean "no workspace", never "gone".');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-sticky-pass.png', fullPage: true }).catch(() => {});
  console.log('Coding desk sticky browser gate passed.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/coding-desk-sticky-failure.png', fullPage: true }).catch(() => {});
  console.error('Coding desk sticky browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
