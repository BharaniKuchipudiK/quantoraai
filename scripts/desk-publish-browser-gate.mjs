#!/usr/bin/env node
/*
 * SHIPPING FROM THE DESK: share a preview link, publish to Vercel, push to
 * GitHub — from a site the desk actually built.
 *
 * The Publish menu was proven to OFFER these (coding-desk-chrome), and the
 * server side of each is tested on its own. Nothing had ever clicked one:
 * share-preview-link, publish-vercel and github-push were "helpers only" in
 * the ledger, and /api/deploy was dead in production for a day on 2026-08-31
 * behind a green check. This gate drives the three journeys through the real
 * desk with the server stubbed at the wire in the shapes the real handlers
 * answer, and it checks what the desk SENT — the human-confirmation header,
 * the code, the project name, the files, the branch — because a click that
 * posts the wrong thing is the failure these paths hide.
 *
 * What it proves, in order:
 *   1. A two-file site built in the desk renders in Preview.
 *   2. Share link posts the built code with the share confirmation header,
 *      puts the returned URL on the clipboard, and says so by the Publish
 *      control.
 *   3. Publish to Vercel opens its dialog, takes a project name, posts with
 *      the publish confirmation header, asks for domain ideas, and shows the
 *      live URL.
 *   4. The Git rail opens the GitHub push panel; Run creates the repository
 *      and pushes both files to the branch, and the panel says so with a
 *      link to the repository.
 *
 * The verdict is the last line: DESK PUBLISH | passed … or
 * DESK PUBLISH | FAILED at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const SHARE_URL = 'https://preview-gate-share.vercel.app';
const PUBLISH_NAME = 'gate-bakery-site';
const PUBLISH_URL = `https://${PUBLISH_NAME}.vercel.app`;
const DOMAIN_IDEAS = ['gatebakery.com', 'gate-bakery.co'];
const REPO = { owner: 'gate-owner', repo: 'gate-bakery-site', fullName: 'gate-owner/gate-bakery-site', htmlUrl: 'https://github.com/gate-owner/gate-bakery-site' };
const ACTED_AS = 'gate-owner';

const SITE_HTML = '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><main><h1 data-testid="site-heading">Gate Bakery</h1><output data-testid="calculator-display">0</output><button data-testid="calculator-one">1</button></main></body></html>';
const SITE_CSS = 'body { font-family: sans-serif; } h1 { color: #b45309; }';
const buildReply = [
  'Built the bakery site.',
  '',
  '```html filepath="index.html"',
  SITE_HTML,
  '```',
  '',
  '```css filepath="styles.css"',
  SITE_CSS,
  '```',
].join('\n');

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Publish Gate', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  deployRequests: [],
  domainRequests: [],
  githubRequests: [],
  alerts: [],
};

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QUANTORA_E2E_CHROMIUM ? { executablePath: process.env.QUANTORA_E2E_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_URL).origin });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));
// The desk reports a failed share or publish with alert(); a gate that let the
// alert block would hang, and one that ignored it would miss the sentence.
page.on('dialog', async (dialog) => {
  evidence.alerts.push(dialog.message());
  await dialog.dismiss().catch(() => {});
});

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_studio_chat_width_pct');
  localStorage.removeItem('quantora_desk_files_width_px');
});

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const postedJson = (request) => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (path === '/api/auth/session') {
    return route.fulfill(json(200, { user: { sub: 'publish-gate', name: 'Publish Gate', email: 'publish-gate@quantora.invalid', picture: null, isAdmin: false } }));
  }
  if (path === '/api/models') {
    return route.fulfill(json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'synthetic', available: true }] }));
  }
  if (path === '/api/plan-turn') return route.fulfill(json(500, { error: 'planner offline in this gate' }));
  if (path === '/api/preview-compile' && method === 'POST') {
    try {
      const compiled = await compilePreviewVfs(postedJson(request).vfs || {});
      return route.fulfill(json(200, compiled));
    } catch (error) {
      return route.fulfill(json(400, { error: error?.message || 'compile failed' }));
    }
  }
  if (path === '/api/chat' && method === 'POST') {
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(buildReply) });
  }
  if (path === '/api/deploy' && method === 'POST') {
    const body = postedJson(request);
    const confirmed = request.headers()['x-quantora-human-confirmed'] || null;
    evidence.deployRequests.push({ confirmed, projectName: body.projectName || null, codeChars: String(body.code || '').length, codeHasSite: String(body.code || '').includes('Gate Bakery') });
    if (!confirmed) return route.fulfill(json(400, { error: 'Deploy requires a human confirmation header.' }));
    if (!String(body.code || '').trim()) return route.fulfill(json(400, { error: 'Nothing to deploy: the request carried no code.' }));
    const projectName = String(body.projectName || 'quantora-app');
    const url = confirmed === 'share-preview-button' ? SHARE_URL : `https://${projectName}.vercel.app`;
    return route.fulfill(json(200, { url, projectName }));
  }
  if (path === '/api/domains' && method === 'POST') {
    const body = postedJson(request);
    evidence.domainRequests.push({ contextChars: String(body.context || '').length });
    return route.fulfill(json(200, { domains: DOMAIN_IDEAS }));
  }
  if (path === '/api/github/create-repo' && method === 'POST') {
    const body = postedJson(request);
    evidence.githubRequests.push({ path, targetStage: body.targetStage || null, name: body.name || null, isPrivate: body.isPrivate });
    if (body.targetStage !== 'github-create-repo') return route.fulfill(json(400, { error: `wrong stage ${body.targetStage}` }));
    return route.fulfill(json(200, REPO));
  }
  if (path === '/api/github/push' && method === 'POST') {
    const body = postedJson(request);
    const files = Array.isArray(body.files) ? body.files : [];
    evidence.githubRequests.push({ path, targetStage: body.targetStage || null, repoUrl: body.repoUrl || null, branch: body.branch || null, message: body.message || null, files: files.map((file) => file.path) });
    if (body.targetStage !== 'github-push') return route.fulfill(json(400, { error: `wrong stage ${body.targetStage}` }));
    if (!files.length) return route.fulfill(json(400, { error: 'No files to push.' }));
    // The shape api/_lib/github-actions.ts pushDeskFiles answers: the branch's tree URL is htmlUrl.
    return route.fulfill(json(200, { fileCount: files.length, branch: body.branch || 'main', createdBranch: true, actedAs: ACTED_AS, htmlUrl: `${REPO.htmlUrl}/tree/${body.branch || 'main'}` }));
  }
  if (path.startsWith('/api/github/')) {
    return route.fulfill(json(200, { ok: true, connected: true, login: ACTED_AS, repositories: [], branches: [], pullRequests: [], issues: [] }));
  }
  return route.fulfill(json(200, { ok: true, projects: [], sessions: [] }));
});

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameShowing(selector, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return frame;
    }
    await page.waitForTimeout(400);
  }
  return null;
}

async function pageState() {
  return {
    url: page.url(),
    shareNotice: await page.locator('[data-quantora-share-notice="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    publishDialog: await page.locator('[data-quantora-publish-dialog="true"]').first().isVisible().catch(() => false),
    deployResult: await page.locator('[data-quantora-deploy-url="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    githubStatus: await page.locator('[data-quantora-github-push-status="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    githubError: await page.locator('[data-quantora-github-push-error="true"]').first().innerText({ timeout: 800 }).catch(() => null),
    deployRequests: evidence.deployRequests,
    domainRequests: evidence.domainRequests,
    githubRequests: evidence.githubRequests,
    alerts: evidence.alerts,
    consoleErrors: consoleErrors.slice(-5),
  };
}

let currentStep = 'boot';
async function step(name, run) {
  currentStep = name;
  const startedAt = Date.now();
  await run();
  evidence.steps.push({ name, ms: Date.now() - startedAt });
}

const publishControl = () => page.locator('[data-quantora-desk-publish="true"]').first();
const publishMenu = () => page.locator('[data-quantora-desk-publish-menu="true"]').first();
const openPublishMenu = async () => {
  await visible(publishControl(), 'The Publish control is missing from the desk chrome ([data-quantora-desk-publish]).');
  await publishControl().click();
  await visible(publishMenu(), 'The Publish menu did not open.');
};

try {
  await step('a two-file site built in the desk renders in Preview', async () => {
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    const { composer } = await enterSignedInStudio(page);
    await composer.fill('Build me a small bakery site with a heading and a calculator widget');
    await composer.press('Enter');
    const frame = await frameShowing('[data-testid="site-heading"]');
    if (!frame) throw new Error('The built site never rendered in Preview (no frame shows [data-testid="site-heading"]).');
  });

  await step('Share link posts the built code with its confirmation and copies the URL', async () => {
    await openPublishMenu();
    await publishMenu().locator('button', { hasText: /Share link/i }).first().click();
    // The desk's feedback for a completed share is the notice by the Publish
    // control; the canvas's own "Link copied" button is not in this chrome.
    const notice = page.locator('[data-quantora-share-notice="true"]').first();
    await visible(notice, `After Share link nothing on screen said the link was copied ([data-quantora-share-notice]); deploy requests: ${JSON.stringify(evidence.deployRequests)}; alerts: ${JSON.stringify(evidence.alerts)}.`);
    const label = (await notice.innerText()).trim();
    const share = evidence.deployRequests.find((entry) => entry.confirmed === 'share-preview-button');
    if (!share) throw new Error(`Share link never posted to /api/deploy with the share confirmation header (deploy requests: ${JSON.stringify(evidence.deployRequests)}; alerts: ${JSON.stringify(evidence.alerts)}).`);
    if (!share.codeHasSite) throw new Error(`Share link posted code that is not the built site (${share.codeChars} chars).`);
    if (!/^preview-/.test(String(share.projectName || ''))) throw new Error(`Share link posted an unexpected project name: ${share.projectName}.`);
    if (!/Link copied/i.test(label) || !label.includes(SHARE_URL)) throw new Error(`The share notice reads "${label}"; expected "Link copied" and the URL ${SHARE_URL}.`);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (clipboard !== SHARE_URL) throw new Error(`The clipboard holds ${JSON.stringify(clipboard)}, not the share URL ${SHARE_URL}.`);
  });

  await step('Publish to Vercel takes a name, posts with its confirmation, and shows the live URL', async () => {
    await openPublishMenu();
    await publishMenu().locator('button', { hasText: /Publish to Vercel/i }).first().click();
    const dialog = page.locator('[data-quantora-publish-dialog="true"]').first();
    await visible(dialog, 'Publish to Vercel did not open its dialog ([data-quantora-publish-dialog]).');
    await dialog.locator('[data-quantora-publish-name="true"]').first().fill(PUBLISH_NAME);
    await dialog.locator('[data-quantora-publish-confirm="true"]').first().click();
    const urlShown = page.locator('[data-quantora-deploy-url="true"]').first();
    await visible(urlShown, `Publish never showed a live URL ([data-quantora-deploy-url]); deploy requests: ${JSON.stringify(evidence.deployRequests)}; alerts: ${JSON.stringify(evidence.alerts)}.`, 20_000);
    const publish = evidence.deployRequests.find((entry) => entry.confirmed === 'publish-dialog');
    if (!publish) throw new Error(`Publish never posted to /api/deploy with the publish confirmation header (deploy requests: ${JSON.stringify(evidence.deployRequests)}).`);
    if (publish.projectName !== PUBLISH_NAME) throw new Error(`Publish posted project name ${JSON.stringify(publish.projectName)}, not the one typed (${PUBLISH_NAME}).`);
    if (!publish.codeHasSite) throw new Error(`Publish posted code that is not the built site (${publish.codeChars} chars).`);
    const shown = (await urlShown.innerText()).trim();
    if (shown !== PUBLISH_URL) throw new Error(`The live URL shown is ${JSON.stringify(shown)}, not ${PUBLISH_URL}.`);
    if (!evidence.domainRequests.length) throw new Error('Publish never asked /api/domains for domain ideas.');
    const resultText = await page.locator('[data-quantora-deploy-result="true"]').first().innerText();
    for (const idea of DOMAIN_IDEAS) {
      if (!resultText.includes(idea)) throw new Error(`The publish result does not list the domain idea ${idea}.`);
    }
  });

  await step('the GitHub push panel creates the repository and pushes both files', async () => {
    // Close the publish result first: it covers the Preview.
    await page.keyboard.press('Escape').catch(() => {});
    const rail = page.locator('[data-quantora-desk-rail="git"]').first();
    await visible(rail, 'The desk rail has no Git entry ([data-quantora-desk-rail="git"]).');
    await rail.click();
    const panel = page.locator('[data-quantora-github-push="true"]').first();
    await visible(panel, 'The Git view opened without the GitHub push panel ([data-quantora-github-push]).', 20_000);
    const nameInput = panel.locator('[data-quantora-github-push-name="true"]').first();
    await visible(nameInput, 'The push panel has no repository name field: it is not in "new repository" mode.');
    await nameInput.fill(REPO.repo);
    await panel.locator('[data-quantora-github-push-message="true"]').first().fill('Initial commit from the publish gate');
    const run = panel.locator('[data-quantora-github-push-run="true"]').first();
    if (!(await run.isEnabled().catch(() => false))) throw new Error('The push button is disabled: the panel sees no desk files to push.');
    await run.click();
    const status = panel.locator('[data-quantora-github-push-status="true"]').first();
    await page.waitForFunction(() => /^Pushed /.test(document.querySelector('[data-quantora-github-push-status="true"]')?.textContent || ''), null, { timeout: 20_000 }).catch(() => {});
    const statusText = (await status.innerText().catch(() => '')).trim();
    const errorText = (await panel.locator('[data-quantora-github-push-error="true"]').first().innerText({ timeout: 800 }).catch(() => '')).trim();
    const created = evidence.githubRequests.find((entry) => entry.path === '/api/github/create-repo');
    const pushed = evidence.githubRequests.find((entry) => entry.path === '/api/github/push');
    if (!created) throw new Error(`Run never asked the server to create the repository (github requests: ${JSON.stringify(evidence.githubRequests)}; error shown: ${errorText || 'none'}).`);
    if (created.name !== REPO.repo) throw new Error(`The repository was requested as ${JSON.stringify(created.name)}, not the name typed (${REPO.repo}).`);
    if (!pushed) throw new Error(`Run never pushed (github requests: ${JSON.stringify(evidence.githubRequests)}; status: ${statusText || 'none'}; error shown: ${errorText || 'none'}).`);
    const files = pushed.files.slice().sort();
    if (files.join(',') !== 'index.html,styles.css') throw new Error(`The push carried ${JSON.stringify(pushed.files)}, not both desk files.`);
    if (pushed.repoUrl !== REPO.htmlUrl) throw new Error(`The push targeted ${pushed.repoUrl}, not the repository just created (${REPO.htmlUrl}).`);
    if (!/^Pushed 2 files and created "main"\. As gate-owner\./.test(statusText)) throw new Error(`The panel's status reads ${JSON.stringify(statusText)}; expected the push outcome and who acted (error shown: ${errorText || 'none'}).`);
    const link = panel.locator('[data-quantora-github-push-link="true"]').first();
    await visible(link, 'The panel shows no link to the repository after the push.');
    const href = await link.getAttribute('href');
    if (href !== `${REPO.htmlUrl}/tree/main`) throw new Error(`The repository link points at ${href}, not the pushed branch ${REPO.htmlUrl}/tree/main.`);
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-publish.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/desk-publish-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`DESK PUBLISH | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/desk-publish-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-publish-failure.png`, fullPage: true }).catch(() => {});
  console.error('Desk publish gate FAILED:', error?.stack || error);
  console.error('Desk publish evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 260);
  console.error(`\nDESK PUBLISH | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: share=${JSON.stringify(state.shareNotice)} dialog=${state.publishDialog} liveUrl=${JSON.stringify(state.deployResult)} github=${JSON.stringify(state.githubStatus)} githubError=${JSON.stringify(state.githubError)} alerts=${JSON.stringify(state.alerts)}`);
  await browser.close();
  process.exit(1);
}
