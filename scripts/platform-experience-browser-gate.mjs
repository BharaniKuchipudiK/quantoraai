#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';

// These are intentionally broad CI budgets, not synthetic benchmark vanity numbers.
// The gate catches meaningful regressions while avoiding flaky failures caused by
// shared CI hardware. Tight real-user performance monitoring belongs in telemetry.
const SHELL_SLA_MS = Number(process.env.QUANTORA_PLATFORM_SHELL_SLA_MS || 4000);
const SWITCH_SLA_MS = Number(process.env.QUANTORA_PLATFORM_SWITCH_SLA_MS || 1200);
const INPUT_SLA_MS = Number(process.env.QUANTORA_PLATFORM_INPUT_SLA_MS || 350);
const MAX_LONG_TASK_MS = Number(process.env.QUANTORA_PLATFORM_MAX_LONG_TASK_MS || 500);
const TOTAL_LONG_TASK_MS = Number(process.env.QUANTORA_PLATFORM_TOTAL_LONG_TASK_MS || 1600);

await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const runtimeErrors = [];
let startupLongTasks = [];
let interactionLongTasks = [];

page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !/favicon|Failed to load resource.*youtube/i.test(message.text())) {
    runtimeErrors.push(`console: ${message.text()}`);
  }
});

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'false');
  window.__quantoraLongTasks = [];
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__quantoraLongTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long Task API is best-effort. Other platform checks remain authoritative.
  }
});

await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/auth/session') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          sub: 'platform-experience-user',
          name: 'Synthetic User',
          email: 'synthetic@quantora.test',
          picture: null,
          isAdmin: false,
        },
      }),
    });
  }
  if (url.pathname === '/api/models') {
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
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], ok: true }),
  });
});

async function visible(locator, message, timeout = 6000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function assertViewportIntegrity(label) {
  const state = await page.evaluate(() => {
    const textarea = document.querySelector('.app-shell--studio textarea');
    const bodyText = document.body?.innerText?.trim() || '';
    return {
      bodyTextLength: bodyText.length,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      textareaVisible: Boolean(textarea && textarea.getBoundingClientRect().width > 0 && textarea.getBoundingClientRect().height > 0),
    };
  });
  if (state.bodyTextLength < 20) throw new Error(`${label} rendered an effectively blank page.`);
  if (state.horizontalOverflow > 4) throw new Error(`${label} introduced ${state.horizontalOverflow}px horizontal overflow.`);
  if (!state.textareaVisible) throw new Error(`${label} lost the primary composer.`);
}

async function switchWorkspace(label, domain) {
  const target = page.getByText(new RegExp(`^${label}$`, 'i')).first();
  await visible(target, `${label} is missing.`);
  const started = Date.now();
  await target.click();
  await page.waitForFunction((expected) => document.documentElement.dataset.quantoraDomain === expected, domain);
  await visible(page.locator('.app-shell--studio textarea').first(), `${label} composer did not become ready.`);
  const elapsed = Date.now() - started;
  if (elapsed > SWITCH_SLA_MS) {
    throw new Error(`${label} workspace switch exceeded interaction SLA: ${elapsed}ms > ${SWITCH_SLA_MS}ms.`);
  }
  await assertViewportIntegrity(label);
  return elapsed;
}

async function screenshot(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

function summarizeLongTasks(longTasks) {
  return {
    count: longTasks.length,
    max: Math.round(longTasks.reduce((max, task) => Math.max(max, Number(task.duration) || 0), 0)),
    total: Math.round(longTasks.reduce((sum, task) => sum + (Number(task.duration) || 0), 0)),
    entries: longTasks.map((task) => ({
      startTime: Math.round(Number(task.startTime) || 0),
      duration: Math.round(Number(task.duration) || 0),
    })),
  };
}

try {
  const shellStart = Date.now();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const studio = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await visible(studio, 'Studio navigation never became ready.');
  await studio.click();
  const composer = page.locator('.app-shell--studio textarea').first();
  await visible(composer, 'Platform composer never became ready.');
  const shellElapsed = Date.now() - shellStart;
  if (shellElapsed > SHELL_SLA_MS) {
    throw new Error(`Platform shell exceeded readiness SLA: ${shellElapsed}ms > ${SHELL_SLA_MS}ms.`);
  }
  await assertViewportIntegrity('Neutral Studio');

  // Startup responsiveness is governed by the shell-readiness SLA above. Reset
  // the Long Task sample once the composer is usable so runner-dependent bundle
  // parse time cannot masquerade as an interaction regression. Deferred startup
  // work remains covered because workspace interaction begins immediately.
  startupLongTasks = await page.evaluate(() => {
    const tasks = window.__quantoraLongTasks || [];
    window.__quantoraLongTasks = [];
    return tasks;
  });

  const workspaces = [
    ['Travel Advisor', 'travel'],
    ['Finance Advisor', 'finance'],
    ['Study Tutor', 'education'],
    ['Research Analyst', 'research'],
  ];

  const switchTimings = {};
  for (const [label, domain] of workspaces) {
    switchTimings[domain] = await switchWorkspace(label, domain);
  }

  // Composer interaction is a shared platform behavior. Measure it once after
  // traversing the shell so accumulated state/rendering regressions are visible.
  const inputStart = Date.now();
  await composer.fill('Platform responsiveness check '.repeat(24));
  const inputElapsed = Date.now() - inputStart;
  if (inputElapsed > INPUT_SLA_MS) {
    throw new Error(`Composer interaction exceeded SLA: ${inputElapsed}ms > ${INPUT_SLA_MS}ms.`);
  }

  interactionLongTasks = await page.evaluate(() => window.__quantoraLongTasks || []);
  const { max: maxLongTask, total: totalLongTask } = summarizeLongTasks(interactionLongTasks);
  if (maxLongTask > MAX_LONG_TASK_MS) {
    throw new Error(`Main-thread stall exceeded budget: ${Math.round(maxLongTask)}ms > ${MAX_LONG_TASK_MS}ms.`);
  }
  if (totalLongTask > TOTAL_LONG_TASK_MS) {
    throw new Error(`Cumulative long-task time exceeded budget: ${Math.round(totalLongTask)}ms > ${TOTAL_LONG_TASK_MS}ms.`);
  }

  if (runtimeErrors.length) {
    throw new Error(`Browser runtime errors detected:\n${runtimeErrors.join('\n')}`);
  }

  await screenshot('platform-experience-pass');
  console.log(JSON.stringify({
    shellElapsed,
    switchTimings,
    inputElapsed,
    startupLongTasks: summarizeLongTasks(startupLongTasks),
    interactionLongTasks: summarizeLongTasks(interactionLongTasks),
  }, null, 2));
  console.log('Platform experience gate passed.');
} catch (error) {
  interactionLongTasks = await page.evaluate(() => window.__quantoraLongTasks || []).catch(() => interactionLongTasks);
  console.error('Platform experience diagnostics:', JSON.stringify({
    startupLongTasks: summarizeLongTasks(startupLongTasks),
    interactionLongTasks: summarizeLongTasks(interactionLongTasks),
  }, null, 2));
  await screenshot('platform-experience-failure').catch(() => {});
  console.error('Platform experience gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
