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

  // Cold chat advisor inference still works (no coding desk / files).
  await newChat.click();
  await page.waitForTimeout(400);
  await prompt.fill('help me with my taxes and portfolio');
  await prompt.press('Enter');
  await page.getByText(/help me with my taxes and portfolio/i).first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.waitForTimeout(800);
  const domainAfterColdFinance = await page.evaluate(() => document.documentElement.dataset.quantoraDomain || '');
  if (domainAfterColdFinance !== 'finance') {
    throw new Error(`Cold finance question did not open Finance Advisor (saw "${domainAfterColdFinance || '(empty)'}").`);
  }

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
