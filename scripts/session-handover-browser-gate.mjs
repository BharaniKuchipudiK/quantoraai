#!/usr/bin/env node
/**
 * A long session continues in a new chat that carries its context and desk.
 *
 * 2026-09-06: a build session hit the history budget, the feed said "I left
 * out the earliest 5 messages", and the chip that offered a new chat did not
 * work — it opened a preview panel nobody noticed, and the callback behind it
 * looked the source chat up in a session list frozen at first render, so a
 * chat started later handed over no desk. This gate starts a NEW chat first
 * (so the frozen list would not contain it), builds until the chip appears,
 * clicks it once, and demands the new chat name what it carries and run the
 * same build in Preview.
 *
 * Mutation notes: with the chip restored to a preview toggle, the click opens
 * no chat and the "Continued from" note never appears; with the stale session
 * list restored, the note says no files were on the desk and the calculator
 * never renders again.
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
    `data: ${JSON.stringify({ provider: 'Synthetic Handover', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const calculatorReply = [
  'Done — here is a working calculator.',
  '',
  '```jsx',
  "import React, { useState } from 'react';\nexport default function Calculator(){ const [value,setValue]=useState('0'); return <main style={{padding:24}}><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button></main>}",
  '```',
].join('\n');

/*
 * Bulk the way real sessions get bulky: every build reply carries its whole
 * file, and the transcript keeps a copy. A prose reply with no files in a build
 * session is replaced by the desk's own note, so it would never add a byte.
 * Three of these in the verbatim tail sit above the handover ratio of the
 * 1.2MB budget.
 */
const bulkBuildReply = (part) => [
  `Done — the calculator now carries its notes, part ${part}.`,
  '',
  '```jsx',
  `import React, { useState } from 'react';\nconst NOTES_${part} = "${'n'.repeat(350_000)}";\nexport default function Calculator(){ const [value,setValue]=useState('0'); return <main style={{padding:24}} data-notes={NOTES_${part}.length}><output data-testid='calculator-display'>{value}</output><button data-testid='calculator-one' onClick={()=>setValue('1')}>1</button></main>}`,
  '```',
].join('\n');

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'handover-user', name: 'Handover User', email: 'handover@quantora.test', picture: null, isAdmin: false },
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
    const message = String(request.postDataJSON?.()?.message || '');
    const part = message.match(/part (\d+)/i);
    const reply = part ? bulkBuildReply(Number(part[1])) : calculatorReply;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(reply) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function visibleFrame(selector, timeout = 20_000) {
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

const sidebarChatCount = () => page.locator('[data-quantora-sidebar-navigation="true"] [data-quantora-sidebar-chat]').count();

try {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await enterSignedInStudio(page);

  // A chat started AFTER first render — the one a frozen session list cannot see.
  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing.');
  await newChat.click();
  await page.waitForTimeout(400);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Build me a simple calculator');
  await prompt.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  if (!(await visibleFrame('[data-testid="calculator-display"]', 20_000))) {
    throw new Error('Calculator Preview never rendered, so there is no desk to hand over.');
  }
  const chatsBefore = await sidebarChatCount();

  // Bulk turns until the platform offers to continue in a new chat.
  const chip = page.locator('[data-quantora-session-handover-start="true"]').first();
  let offered = false;
  for (let turn = 1; turn <= 8 && !offered; turn += 1) {
    const ask = `tell me more about the calculator, part ${turn}`;
    await prompt.fill(ask);
    await prompt.press('Enter');
    await page.getByText(ask, { exact: false }).first().waitFor({ state: 'visible', timeout: 8_000 });
    await page.locator('[data-quantora-assistant-prose]').nth(turn + 1).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
    offered = await chip.isVisible().catch(() => false);
  }
  if (!offered) throw new Error('Eight bulk turns never produced the handover chip.');

  // The notice about folded or shortened history says so; it never says "left out".
  const feedText = await page.locator('.app-shell--studio').innerText().catch(() => '');
  if (/left out the earliest/i.test(feedText)) throw new Error('The feed still says earlier messages were "left out".');

  // One click, no preview panel, and the new chat says what it carries.
  await chip.click();
  await page.waitForTimeout(600);
  const note = page.getByText(/Continued from ".*", which stays exactly as it was\./).first();
  await visible(note, 'The chip did not open a new chat that names where it came from.', 8_000);
  const noteText = await page.locator('[data-quantora-assistant-prose]').first().innerText().catch(() => '');
  /*
   * The COUNT, from a durable hook — not the sentence.
   *
   * This asserted the exact prose "The desk, with N files — Preview runs the
   * same build." On 2026-09-08 that note was shortened, in the same change, and
   * this gate went red over wording while the desk it guards carried perfectly.
   * That is the prose-anchoring this repository has already paid for once.
   */
  const carriedFiles = Number(await page.locator('[data-quantora-handover-note="true"]').first()
    .getAttribute('data-quantora-handover-desk-files').catch(() => '0'));
  if (!Number.isFinite(carriedFiles) || carriedFiles < 1) {
    throw new Error(`The new chat did not carry the desk (files=${carriedFiles}). Note read: ${noteText.slice(0, 300)}`);
  }
  if (!(await visibleFrame('[data-testid="calculator-display"]', 20_000))) {
    throw new Error('The carried desk never ran the calculator in Preview.');
  }
  const domain = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (['finance', 'travel', 'education', 'research'].includes(domain)) throw new Error(`The continued chat opened on ${domain}.`);

  // The old chat is still there, untouched.
  const chatsAfter = await sidebarChatCount();
  if (chatsAfter !== chatsBefore + 1) throw new Error(`Expected one more chat in the sidebar (${chatsBefore} → ${chatsBefore + 1}), saw ${chatsAfter}.`);
  if (await page.locator('[data-quantora-handover-preview="true"]').count()) throw new Error('A preview panel is still rendered; the chip must be one click.');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/session-handover-pass.png', fullPage: true }).catch(() => {});
  console.log('Session handover browser gate passed: the chip opened a new chat that names its origin, carries the desk, and runs the same build.');
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/session-handover-failure.png', fullPage: true }).catch(() => {});
  console.error('Session handover browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
