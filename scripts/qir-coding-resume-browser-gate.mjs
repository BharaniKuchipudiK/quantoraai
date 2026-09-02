#!/usr/bin/env node
/**
 * Browser-visible QIR Phase 2 acceptance proof:
 * broken Preview -> durable failure -> browser loss -> resume the same Run ->
 * new recovery generation -> repaired Preview -> independent verifier -> COMPLETE.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const BROKEN = `<!doctype html><html><body><main><h1>QIR Boutique</h1><img alt="Silk sari" src="https://invalid.quantora.test/missing.jpg"><p>Handloom product catalog</p></main></body></html>`;
const REPAIRED = `<!doctype html><html><head><style>body{font-family:system-ui;margin:0;padding:32px;background:#fff8f2}main{max-width:900px;margin:auto}.products{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{background:white;padding:16px;border-radius:12px}.card img{display:block;width:100%;height:180px;object-fit:cover;background:#ead9cf}button{padding:10px 14px;background:#8f1730;color:white;border:0;border-radius:8px}</style></head><body><main><h1>QIR Boutique Recovered</h1><p>Verified product imagery in INR</p><section class="products"><article class="card"><img alt="Crimson silk sari" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><h2>Crimson Silk</h2><p>₹39,500</p><button onclick="this.textContent='Added'">Add to Cart</button></article><article class="card"><img alt="Peacock silk sari" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><h2>Peacock Silk</h2><p>₹29,800</p><button onclick="this.textContent='Added'">Add to Cart</button></article><article class="card"><img alt="Gold silk sari" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><h2>Gold Silk</h2><p>₹26,500</p><button onclick="this.textContent='Added'">Add to Cart</button></article></section></main></body></html>`;

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic QIR', latencyMs: 10, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

function buildReply(html) {
  return ['Built the boutique.', '', '```html filepath="index.html"', html, '```'].join('\n');
}

let durableRun = null;
let storageVersion = 0;
let repairCalls = 0;
let resumeReads = 0;
let chatTurns = 0;
const transitions = [];

function qirReply(route, status = 200, extra = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ run: durableRun, storageVersion, durability: 'persisted', ...extra }),
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      user: { sub: 'qir-browser-user', name: 'QIR Browser', email: 'qir@quantora.test', picture: null, isAdmin: false },
    }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [
      { id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true },
    ] }) });
  }
  if (path === '/api/qir-runs') {
    if (request.method() === 'GET') {
      resumeReads += 1;
      transitions.push(`resume:${durableRun?.status}`);
      return qirReply(route, durableRun ? 200 : 404, {
        continuation: durableRun ? { stepId: durableRun.cursor.stepId, taskId: 'coding.render', actionId: durableRun.cursor.actionId } : null,
      });
    }
    const body = request.postDataJSON?.() || {};
    if (body.run) {
      durableRun = structuredClone(body.run);
      storageVersion = 1;
      transitions.push('QUEUED');
      return qirReply(route, 201);
    }
    if (body.action === 'coding.start') {
      durableRun.status = 'EXECUTING';
      durableRun.steps = [{ stepId: 'render-storefront', taskId: 'coding.render', objective: durableRun.goal.statement, dependsOn: [], status: 'active', requiresVerification: true, actionId: 'action-build-1' }];
      durableRun.cursor = { stepId: 'render-storefront', actionId: 'action-build-1', attempt: 0 };
      durableRun.artifacts = [{ artifactId: 'coding-desk-vfs', generation: 1, ref: body.artifactRef, state: 'candidate', createdByActionId: 'action-build-1', verifiedByActionId: null }];
      storageVersion += 1;
      transitions.push('EXECUTING:1');
      return qirReply(route);
    }
    if (body.action === 'coding.observe') {
      if (body.observation.actionId !== durableRun.cursor.actionId || body.observation.artifactGeneration !== durableRun.artifacts[0].generation) {
        transitions.push('STALE');
        return qirReply(route, 202, { stale: true });
      }
      durableRun.observations.push(body.observation);
      if (body.observation.status === 'failure') {
        durableRun.status = 'REPAIRING';
        durableRun.cursor.attempt += 1;
        durableRun.steps[0].status = 'failed_recoverable';
        transitions.push('REPAIRING:1');
      } else {
        durableRun.status = 'VERIFYING';
        durableRun.steps[0].status = 'succeeded';
        transitions.push(`VERIFYING:${durableRun.artifacts[0].generation}`);
      }
      storageVersion += 1;
      return qirReply(route);
    }
    if (body.action === 'coding.recover') {
      durableRun.status = 'EXECUTING';
      durableRun.cursor.actionId = 'action-repair-image-pipeline-2';
      durableRun.steps[0].status = 'active';
      durableRun.steps[0].actionId = durableRun.cursor.actionId;
      durableRun.artifacts[0] = { ...durableRun.artifacts[0], generation: 2, ref: body.artifactRef, state: 'candidate', createdByActionId: durableRun.cursor.actionId };
      storageVersion += 1;
      transitions.push('EXECUTING:2');
      return qirReply(route);
    }
    if (body.action === 'coding.promote') {
      durableRun.status = 'COMPLETE';
      durableRun.goal.status = 'achieved';
      durableRun.steps[0].status = 'verified';
      durableRun.artifacts[0].state = 'verified';
      durableRun.artifacts[0].verifiedByActionId = 'independent-verifier-1';
      durableRun.verifications.push({ verificationId: 'verify-2', runId: durableRun.runId, actionId: 'independent-verifier-1', passed: true, proofOfDoneStatus: 'verified', evidenceRefs: body.evidenceRefs, verifiedAt: new Date().toISOString() });
      durableRun.checkpoints.push({ checkpointId: 'checkpoint-2', runId: durableRun.runId, stepId: durableRun.cursor.stepId, actionId: durableRun.cursor.actionId, artifactGenerations: { 'coding-desk-vfs': 2 }, createdAt: new Date().toISOString() });
      storageVersion += 1;
      transitions.push('COMPLETE:2');
      return qirReply(route);
    }
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    if (body.task === 'repair') {
      repairCalls += 1;
      transitions.push('repair:interrupted');
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic worker interrupted before repair completed.' }) });
    }
    if (body.task === 'verify-build') {
      const repaired = String(body.code || '').includes('QIR Boutique Recovered');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        score: repaired ? 100 : 0,
        passed: repaired,
        issues: repaired ? [] : ['Product imagery is broken'],
        checks: [{ id: 'styled', ok: true }],
      }) });
    }
    chatTurns += 1;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(buildReply(chatTurns === 1 ? BROKEN : REPAIRED)),
    });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function waitForRunStatus(status, timeout = 25_000) {
  await page.locator(`[data-quantora-qir-run-status="${status}"]`).first().waitFor({ state: 'visible', timeout });
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const { composer } = await enterSignedInStudio(page);
  await composer.fill('Build a boutique storefront with working product imagery');
  await composer.press('Enter');
  await page.locator('[data-quantora-coding-desk-nav="true"]').click();
  await waitForRunStatus('REPAIRING');

  const originalRunId = await page.locator('[data-quantora-code-workspace="true"]').getAttribute('data-quantora-qir-run-id');
  if (!originalRunId) throw new Error('Coding Desk did not expose its durable Run id.');
  if (durableRun.cursor.attempt !== 1) throw new Error(`Failure did not consume exactly one attempt; saw ${durableRun.cursor.attempt}.`);

  // Browser/worker loss: reload after the durable failure, before repair.
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  const resumedStudio = await enterSignedInStudio(page);
  await resumedStudio.composer.fill('Repair the broken product images and keep this same boutique');
  await resumedStudio.composer.press('Enter');
  await waitForRunStatus('COMPLETE', 30_000);

  const resumedRunId = await page.locator('[data-quantora-code-workspace="true"]').getAttribute('data-quantora-qir-run-id');
  if (resumedRunId !== originalRunId) throw new Error(`Reload created a new Run (${resumedRunId}) instead of resuming ${originalRunId}.`);
  if (resumeReads < 1) throw new Error('Replacement browser never resumed from the durable Run snapshot.');
  if (durableRun.cursor.attempt !== 1) throw new Error('Worker/browser restart reset the retry budget.');
  if (durableRun.artifacts[0].generation !== 2 || durableRun.artifacts[0].state !== 'verified') {
    throw new Error('Recovered artifact generation was not independently verified and promoted.');
  }
  if (!transitions.includes('VERIFYING:2') || transitions.at(-1) !== 'COMPLETE:2') {
    throw new Error(`Run skipped independent verification: ${transitions.join(' -> ')}`);
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/qir-coding-resume-complete.png', fullPage: true });
  console.log(`QIR Coding resume browser gate passed on Run ${originalRunId}: ${transitions.join(' -> ')}`);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/qir-coding-resume-failure.png', fullPage: true }).catch(() => {});
  console.error('QIR Coding resume browser gate FAILED:', error?.stack || error);
  console.error('Observed transitions:', transitions.join(' -> '));
  console.error('Repair calls:', repairCalls, 'resume reads:', resumeReads);
  process.exitCode = 1;
} finally {
  await browser.close();
}
