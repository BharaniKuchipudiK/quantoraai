#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { planDeskCheckpointChain } from '../src/lib/desk-checkpoint-delta.js';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const RUN_ID = 'browser-pilot-run';
const GOAL = 'Build a production scheduling board for my factory floor';

function ok(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

export async function proveServerOwnedCloseReconnect() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 960 } });
  let page = await context.newPage();
  let capabilityChecks = 0;
  let submissions = 0;
  let browserRunCreates = 0;
  let chatCalls = 0;
  let runReads = 0;
  let submitted = null;
  let completedRun = null;
  let savedRevision = 1;
  let savedSteps = planDeskCheckpointChain([{ id: 'baseline', vfs: {
    'index.html': '<!doctype html><html><body><h1>Baseline worker project</h1></body></html>',
  } }]).steps;

  await context.addInitScript(() => {
    localStorage.setItem('quantora_hide_welcome', 'true');
    localStorage.removeItem('quantora_active_specialist_domain');
  });

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/session') {
      return ok(route, { user: { sub: 'server-close-user', name: 'Server Close Gate', email: 'server-close@quantora.test', picture: null, isAdmin: false } });
    }
    if (path === '/api/models') {
      return ok(route, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] });
    }
    if (path === '/api/desk-checkpoints') {
      if (request.method() === 'GET') return ok(route, { steps: savedSteps, revision: savedRevision });
      const body = request.postDataJSON?.() || {};
      if (body.expectedRevision !== savedRevision) return ok(route, { error: 'Newer checkpoint' }, 409);
      savedSteps = planDeskCheckpointChain(body.history || []).steps;
      savedRevision += 1;
      return ok(route, { saved: savedSteps.length, revision: savedRevision });
    }
    if (path === '/api/qir-runs') {
      if (request.method() === 'GET' && url.searchParams.get('workerPilot') === '1') {
        capabilityChecks += 1;
        return ok(route, { enabled: true, runId: RUN_ID });
      }
      if (request.method() === 'GET') {
        runReads += 1;
        return completedRun
          ? ok(route, { run: completedRun, storageVersion: 2, durability: 'persisted' })
          : ok(route, { error: 'Scheduled, awaiting initialization' }, 404);
      }
      const body = request.postDataJSON?.() || {};
      if (body.action === 'coding.workflow_submit') {
        submissions += 1;
        submitted = body;
        return ok(route, { runId: RUN_ID, workflowRunId: 'wrun_tab_close', durability: 'scheduled' }, 202);
      }
      if (body.run) {
        browserRunCreates += 1;
        return ok(route, { error: 'Browser must not create a replacement run after worker ownership transfer.' }, 500);
      }
      return ok(route, { error: `Unexpected QIR action ${body.action || 'none'}` }, 409);
    }
    if (path === '/api/chat') {
      chatCalls += 1;
      return ok(route, { error: 'A server-owned turn must not execute through browser chat.' }, 500);
    }
    return ok(route, { projects: [], sessions: [], ok: true });
  });

  try {
    await page.goto(`${BASE_URL}/desk?workerPilot=1`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const studio = await enterSignedInStudio(page);
    const prompt = studio.composer || page.locator('.app-shell--studio textarea').first();
    await visible(prompt, 'Coding composer did not render.');

    const capabilityDeadline = Date.now() + 10_000;
    while (!capabilityChecks && Date.now() < capabilityDeadline) await page.waitForTimeout(100);
    if (!capabilityChecks) throw new Error('Worker capability was never resolved for the signed-in desk.');

    await prompt.fill(GOAL);
    await prompt.press('Enter');
    const submitDeadline = Date.now() + 10_000;
    while (!submissions && Date.now() < submitDeadline) await page.waitForTimeout(100);
    if (submissions !== 1 || !submitted) throw new Error(`Expected one server-owned submission, saw ${submissions}.`);
    await page.getByText('Your background submission was accepted', { exact: false }).last().waitFor({ state: 'visible', timeout: 10_000 });
    if (chatCalls || browserRunCreates) throw new Error(`Ownership leaked before tab close: chat=${chatCalls}, browserRuns=${browserRunCreates}.`);

    const pointer = await page.evaluate((sessionId) => localStorage.getItem(`quantora_qir_coding_run:${sessionId}`), submitted.sessionId);
    if (pointer !== RUN_ID) throw new Error(`Browser stored ${pointer || 'no run'} instead of ${RUN_ID}.`);

    // Destroy the only page. The simulated server then completes and publishes
    // a verified workspace while there is no observer capable of running work.
    await page.close();
    if (context.pages().length !== 0) throw new Error('The browser context still has an observer page after close.');

    savedSteps = planDeskCheckpointChain([{ id: 'worker-published', vfs: {
      'index.html': '<!doctype html><html><body><h1>Worker saved result</h1></body></html>',
      'worker-result.mjs': 'export const verifiedResult = 99;\n',
    } }]).steps;
    savedRevision += 1;
    completedRun = {
      version: 'qir-contracts-2026-09-02.1', runId: RUN_ID, status: 'COMPLETE', updatedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 1000).toISOString(),
      goal: { statement: GOAL, status: 'achieved' },
      steps: [], cursor: { stepId: null, actionId: null, attempt: 0 }, observations: [], verifications: [], checkpoints: [],
      budget: { runUnitsRemaining: 99, stepUnitsRemaining: 39, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
      artifacts: [{ artifactId: 'coding-desk-vfs', state: 'verified', generation: 1, ref: 'desk-checkpoint:worker-published', createdByActionId: 'worker-action', verifiedByActionId: 'worker-verifier' }],
      workingContext: { projectState: { sessionId: submitted.sessionId, executionOwner: 'server', submissionHash: submitted.workspaceHash } },
    };

    page = await context.newPage();
    await page.goto(`${BASE_URL}/desk?workerPilot=1`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await enterSignedInStudio(page);
    await visible(page.getByRole('button', { name: 'worker-result.mjs', exact: true }), 'New tab did not restore the server-published verified file.');
    await visible(page.locator(`[data-quantora-qir-run-id="${RUN_ID}"][data-quantora-qir-run-status="COMPLETE"]`).first(), 'New tab did not reconnect to the exact completed durable run.');

    const reopenedPointer = await page.evaluate((sessionId) => localStorage.getItem(`quantora_qir_coding_run:${sessionId}`), submitted.sessionId);
    if (reopenedPointer !== RUN_ID) throw new Error(`Reconnect changed the durable run pointer to ${reopenedPointer || 'nothing'}.`);
    if (submissions !== 1 || chatCalls || browserRunCreates) {
      throw new Error(`Reconnect executed work instead of observing it: submissions=${submissions}, chat=${chatCalls}, browserRuns=${browserRunCreates}.`);
    }
    if (!runReads) throw new Error('Replacement tab never read the durable run snapshot.');

    console.log(`Server-owned real-tab-close reconnect proof passed on ${RUN_ID}; runReads=${runReads}, capabilityChecks=${capabilityChecks}.`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  proveServerOwnedCloseReconnect().catch((error) => {
    console.error('Server-owned tab-close reconnect proof FAILED:', error?.stack || error);
    process.exitCode = 1;
  });
}
