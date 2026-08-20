#!/usr/bin/env node
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const repairedHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Repaired</title></head><body><main id="app">Drone simulator repaired</main></body></html>`;

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_code_workspace_v1');
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
          sub: 'synthetic-code-user',
          name: 'Synthetic Builder',
          email: 'builder@quantora.test',
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
        models: [{
          id: 'synthetic/coder',
          name: 'Synthetic Coding Engine',
          description: 'Synthetic coding model for release gating',
          provider: 'Synthetic',
          available: true,
          pricingKind: 'test',
        }],
      }),
    });
  }

  if (path === '/api/code/cognition') {
    const payload = JSON.parse(request.postData() || '{}');
    const prompt = String(payload.prompt || '');
    const isDrone = /drone|quadcopter/i.test(prompt);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cognition: {
          version: 'synthetic-code-cognition',
          purpose: isDrone ? 'robotics_simulation' : 'web_app',
          purposeLabel: isDrone ? 'Robotics / drone simulation' : 'Web application',
          objective: prompt || 'Build and evolve the starter project.',
          intent: 'build',
          confidence: 0.93,
          languages: ['HTML', 'JavaScript'],
          frameworks: isDrone ? ['Three.js'] : [],
          architecture: ['frontend', ...(isDrone ? ['3d'] : [])],
          runtimeClass: 'browser_web',
          runtimeReasons: ['browser-first'],
          evidence: ['synthetic browser gate'],
        },
        runtime: {
          version: 'synthetic-runtime',
          preferred: {
            id: 'browser-web',
            tier: 'browser',
            runtimeClass: 'browser_web',
            capabilities: ['browser_js', 'webgl', 'webgpu'],
            estimatedCostClass: 'zero_or_client',
            reason: 'Run close to the user.',
          },
          fallbacks: [],
          missingCapabilities: [],
          shouldEscalate: false,
        },
        repairPolicy: {
          maxAttempts: 3,
          autoHeal: true,
          requireReviewableDiff: true,
          requireVerification: true,
          keepDiagnosticsVisible: true,
          qualityRules: ['minimal patch', 'verify before done'],
        },
      }),
    });
  }

  if (path === '/api/chat') {
    const payload = JSON.parse(request.postData() || '{}');
    if (payload.task === 'repair') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: repairedHtml, unchanged: false }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'ok' }) });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ projects: [], sessions: [], artifacts: [], ok: true }),
  });
});

async function visible(locator, message, timeout = 8000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const studioButton = page.getByRole('button', { name: /^(AI )?Studio$/i }).first();
  await visible(studioButton, 'Studio navigation did not become visible.');
  await studioButton.click();

  const codeEntry = page.locator('[data-quantora-code-entry="true"]').first();
  await visible(codeEntry, 'Quantora Code entry was not added to Studio specialist navigation.', 10_000);
  await codeEntry.click();

  const workspace = page.locator('[data-quantora-code-workspace="true"]').first();
  await visible(workspace, 'Quantora Code workspace did not open.');
  await visible(workspace.getByText('Build · Run · Diagnose · Repair · Verify', { exact: true }), 'Code workspace promise is missing.');
  await visible(workspace.getByText('PCL PROJECT COGNITION', { exact: true }), 'PCL project cognition panel is missing.');
  await visible(workspace.getByText('Browser runtime', { exact: true }), 'Browser-first runtime decision was not surfaced.');

  const monacoHost = workspace.locator('[data-quantora-monaco-editor="true"]').first();
  await visible(monacoHost, 'Monaco host did not mount.');
  await page.waitForFunction(() => Boolean(document.querySelector('[data-quantora-monaco-editor="true"] .monaco-editor')), null, { timeout: 15_000 });

  const intentBox = workspace.getByPlaceholder(/quadcopter simulator/i).first();
  await visible(intentBox, 'Project objective input is missing.');
  await intentBox.fill('Build a quadcopter drone simulator with Three.js and tuneable rotor speeds.');
  await workspace.getByRole('button', { name: 'Understand this project', exact: true }).click();
  await visible(workspace.getByText('Robotics / drone simulation', { exact: true }), 'PCL did not surface the synthetic drone project purpose.');
  await visible(workspace.getByText(/frontend · 3d/i).first(), 'PCL did not surface the 3D architecture signal.');

  // Inject the same structured runtime event emitted by the preview harness. The
  // Code workspace must expose the diagnostic, let the bounded self-heal loop
  // repair it, and keep a visible engineering trail instead of silently hiding it.
  await page.evaluate(() => {
    window.postMessage({
      __quantora: true,
      kind: 'error',
      message: 'ReferenceError: syntheticRotorSpeed is not defined',
    }, '*');
  });

  await visible(workspace.getByText(/syntheticRotorSpeed is not defined/i).first(), 'Runtime diagnostic was not exposed in Problems.');
  await visible(workspace.getByText(/Applied a bounded repair to index\.html/i).first(), 'Self-heal did not expose the repair event in Activity.', 10_000);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('quantora_code_workspace_v1') || '{}'));
  if (!stored?.files?.['index.html']?.content?.includes('Drone simulator repaired')) {
    throw new Error('Self-heal did not persist the repaired file into the workspace VFS.');
  }

  await workspace.getByRole('button', { name: 'Close Quantora Code', exact: true }).click();
  await workspace.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  if (await workspace.isVisible().catch(() => false)) throw new Error('Quantora Code workspace did not close cleanly.');

  console.log('Quantora Code browser gate passed.');
} catch (error) {
  console.error('Quantora Code browser gate FAILED:', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
