#!/usr/bin/env node
/*
 * GITHUB REPOSITORY DESTINATION + WORKING COPY GATE.
 *
 * A repository chip is not enough. This gate proves the selected repository is
 * actually checked out into the Coding Desk, that read-only repositories can be
 * loaded for review without being advertised as writable, and that changing the
 * branch pulls that branch rather than moving only the label in the toolbar.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const ACCOUNT = 'gate-owner';
const WRITABLE = { fullName: `${ACCOUNT}/gate-service`, owner: ACCOUNT, repo: 'gate-service', defaultBranch: 'main', canPush: true, isPrivate: false };
const READ_ONLY = { fullName: 'someone-else/upstream-lib', owner: 'someone-else', repo: 'upstream-lib', defaultBranch: 'trunk', canPush: false, isPrivate: false };
const OTHER = { fullName: `${ACCOUNT}/gate-notes`, owner: ACCOUNT, repo: 'gate-notes', defaultBranch: 'main', canPush: true, isPrivate: true };
const BRANCHES = [
  { name: 'main', isDefault: true, protected: true },
  { name: 'release/2026-09', isDefault: false, protected: false },
];
const PICK_BRANCH = 'release/2026-09';
const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  githubRequests: [],
  alerts: [],
};

let connected = false;
let connectionDelayMs = 0;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QUANTORA_E2E_CHROMIUM ? { executablePath: process.env.QUANTORA_E2E_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));
// Repository/branch changes replace a working copy. This gate accepts that
// confirmation because its purpose is to prove the requested checkout occurs.
page.on('dialog', async (dialog) => {
  evidence.alerts.push(dialog.message());
  await dialog.accept().catch(() => {});
});

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const postedJson = (request) => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };
const repoForUrl = (repoUrl = '') => String(repoUrl).includes('/upstream-lib') ? READ_ONLY : WRITABLE;

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const body = postedJson(request);

  if (path === '/api/auth/session') {
    return route.fulfill(json(200, { user: { sub: 'dest-gate', name: 'Destination Gate', email: 'dest-gate@quantora.invalid', picture: null, isAdmin: false } }));
  }
  if (path === '/api/models') {
    return route.fulfill(json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'synthetic', available: true }] }));
  }
  if (path === '/api/plan-turn') return route.fulfill(json(500, { error: 'planner offline in this gate' }));

  if (path === '/api/github/connection') {
    evidence.githubRequests.push({ path, connected, delayedMs: connectionDelayMs });
    if (connectionDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, connectionDelayMs));
    return connected
      ? route.fulfill(json(200, { connected: true, login: ACCOUNT, scopes: ['repo'] }))
      : route.fulfill(json(200, { connected: false, reason: 'Connect your GitHub account to choose a repository.' }));
  }
  if (path === '/api/github/list-repos') {
    evidence.githubRequests.push({ path, limit: body.limit ?? null });
    return route.fulfill(json(200, { repositories: [WRITABLE, READ_ONLY, OTHER] }));
  }
  if (path === '/api/github/list-branches') {
    evidence.githubRequests.push({ path, repoUrl: body.repoUrl || null, defaultBranch: body.defaultBranch || null });
    const repo = repoForUrl(body.repoUrl);
    const branches = repo === READ_ONLY
      ? [{ name: 'trunk', isDefault: true, protected: false }]
      : BRANCHES;
    return route.fulfill(json(200, { branches }));
  }
  if (path === '/api/github/checkout') {
    const repo = repoForUrl(body.repoUrl);
    const branch = String(body.branch || repo.defaultBranch);
    evidence.githubRequests.push({ path, repoUrl: body.repoUrl || null, branch });
    return route.fulfill(json(200, {
      owner: repo.owner,
      repo: repo.repo,
      branch,
      commitSha: COMMIT_SHA,
      treeFileCount: 2,
      omitted: [],
      treeTruncated: false,
      notice: '',
      files: [
        { path: 'src/index.js', content: `export const repository = ${JSON.stringify(repo.fullName)};\nexport const branch = ${JSON.stringify(branch)};\n` },
        { path: 'README.md', content: `# ${repo.fullName}\n` },
      ],
    }));
  }
  if (path.startsWith('/api/github/')) return route.fulfill(json(200, { ok: true, connected, login: ACCOUNT }));
  return route.fulfill(json(200, { ok: true }));
});

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

const bar = () => page.locator('[data-quantora-github-destination]').first();
const chip = (id) => page.locator(`[data-quantora-github-destination-chip="${id}"]`).first();
const chipText = async (id) => (await chip(id).innerText().catch(() => '')).trim();

async function chipBecomes(id, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let seen = '';
  while (Date.now() < deadline) {
    seen = await chipText(id);
    if (seen === expected) return seen;
    await page.waitForTimeout(150);
  }
  return seen;
}

async function waitForCheckout(owner, repo, branch, timeout = 15_000) {
  const suffix = `/${owner}/${repo}`;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const match = evidence.githubRequests.find((entry) => (
      entry.path === '/api/github/checkout'
      && String(entry.repoUrl || '').endsWith(suffix)
      && (!branch || entry.branch === branch)
    ));
    if (match) return match;
    await page.waitForTimeout(150);
  }
  return null;
}

async function pageState() {
  return {
    url: page.url(),
    barState: await bar().getAttribute('data-quantora-github-destination').catch(() => null),
    chips: {
      owner: await chipText('owner').catch(() => null),
      repo: await chipText('repo').catch(() => null),
      branch: await chipText('branch').catch(() => null),
    },
    blocker: await page.locator('[data-quantora-github-destination-blocker="true"]').first().innerText({ timeout: 600 }).catch(() => null),
    gitBase: await page.locator('[data-quantora-desk-git-base="true"]').first().innerText({ timeout: 600 }).catch(() => null),
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

try {
  await step('signed out of GitHub, the bar offers the connection door', async () => {
    connectionDelayMs = 4_000;
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await visible(bar(), 'The composer has no GitHub destination control.', 20_000);
    const state = await bar().getAttribute('data-quantora-github-destination');
    if (state !== 'disconnected') throw new Error(`Unresolved GitHub connection rendered as ${JSON.stringify(state)}, not disconnected.`);
    connectionDelayMs = 0;
    await visible(page.locator('[data-quantora-github-destination-connect="true"]').first(), 'Signed out, the GitHub connection door is missing.');
  });

  await step('connected, the chips name the account and no repository yet', async () => {
    connected = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await visible(bar(), 'The GitHub destination control did not return after connection.', 20_000);
    const owner = await chipBecomes('owner', ACCOUNT);
    if (owner !== ACCOUNT) throw new Error(`Owner chip reads ${JSON.stringify(owner)}, expected ${ACCOUNT}.`);
    const repo = await chipText('repo');
    if (!/no repository/i.test(repo)) throw new Error(`Repository chip reads ${JSON.stringify(repo)} before a repository was chosen.`);
  });

  await step('repository menu lists readable repositories and their write capability', async () => {
    await chip('repo').click();
    await visible(page.locator('[data-quantora-github-destination-menu="repo"]').first(), 'Repository menu did not open.');
    for (const row of [WRITABLE, READ_ONLY, OTHER]) {
      const item = page.locator(`[data-quantora-github-destination-repo="${row.fullName}"]`).first();
      await visible(item, `${row.fullName} is missing from the repository menu.`);
      const writable = await item.getAttribute('data-quantora-github-destination-writable');
      if (writable !== (row.canPush ? 'true' : 'false')) throw new Error(`${row.fullName} write capability rendered as ${writable}.`);
    }
  });

  await step('a read-only repository can be cloned for review without becoming writable', async () => {
    const row = page.locator(`[data-quantora-github-destination-repo="${READ_ONLY.fullName}"]`).first();
    if (!(await row.isEnabled().catch(() => false))) throw new Error(`${READ_ONLY.fullName} cannot be selected for read-only review.`);
    await row.click();
    if (await chipBecomes('repo', READ_ONLY.repo) !== READ_ONLY.repo) throw new Error('Read-only repository chip did not move to the selected repository.');
    if (await chipBecomes('branch', READ_ONLY.defaultBranch) !== READ_ONLY.defaultBranch) throw new Error('Read-only repository branch did not use its default branch.');
    const checkout = await waitForCheckout(READ_ONLY.owner, READ_ONLY.repo, READ_ONLY.defaultBranch);
    if (!checkout) throw new Error('Selecting a read-only repository changed the chip but never called /api/github/checkout.');
    const blocker = await page.locator('[data-quantora-github-destination-blocker="true"]').first().innerText({ timeout: 3_000 }).catch(() => '');
    if (!blocker) throw new Error('Read-only repository loaded without any warning that GitHub writes are unavailable.');
  });

  await step('choosing a writable repository clones it and changing branch pulls that branch', async () => {
    await chip('repo').click();
    await visible(page.locator('[data-quantora-github-destination-menu="repo"]').first(), 'Repository menu did not reopen.');
    await page.locator(`[data-quantora-github-destination-repo="${WRITABLE.fullName}"]`).first().click();
    if (await chipBecomes('repo', WRITABLE.repo) !== WRITABLE.repo) throw new Error(`After choosing ${WRITABLE.fullName}, the repository chip did not update.`);
    if (await chipBecomes('branch', WRITABLE.defaultBranch) !== WRITABLE.defaultBranch) throw new Error('Writable repository did not start on its default branch.');
    if (!await waitForCheckout(WRITABLE.owner, WRITABLE.repo, WRITABLE.defaultBranch)) {
      throw new Error('Selecting a writable repository did not clone/checkout it into the desk.');
    }

    await chip('branch').click();
    await visible(page.locator('[data-quantora-github-destination-menu="branch"]').first(), 'Branch menu did not open.');
    const asked = evidence.githubRequests.find((entry) => entry.path === '/api/github/list-branches' && String(entry.repoUrl || '').endsWith(`/${WRITABLE.owner}/${WRITABLE.repo}`));
    if (!asked) throw new Error('Branch menu never asked GitHub for branches of the selected repository.');
    await page.locator(`[data-quantora-github-destination-branch="${PICK_BRANCH}"]`).first().click();
    if (await chipBecomes('branch', PICK_BRANCH) !== PICK_BRANCH) throw new Error(`Branch chip did not move to ${PICK_BRANCH}.`);
    if (!await waitForCheckout(WRITABLE.owner, WRITABLE.repo, PICK_BRANCH)) {
      throw new Error(`Selecting ${PICK_BRANCH} changed the label but did not pull that branch into the working copy.`);
    }
  });

  await step('Pull latest refreshes the selected repository and branch', async () => {
    const before = evidence.githubRequests.filter((entry) => entry.path === '/api/github/checkout').length;
    const pull = page.locator('[data-quantora-github-destination-open="true"]').first();
    await visible(pull, 'Pull latest control is missing for the selected repository.');
    await pull.click();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && evidence.githubRequests.filter((entry) => entry.path === '/api/github/checkout').length <= before) {
      await page.waitForTimeout(150);
    }
    const latest = evidence.githubRequests.filter((entry) => entry.path === '/api/github/checkout').at(-1);
    if (!latest || latest.branch !== PICK_BRANCH || !String(latest.repoUrl || '').endsWith(`/${WRITABLE.owner}/${WRITABLE.repo}`)) {
      throw new Error(`Pull latest did not refresh ${WRITABLE.fullName}@${PICK_BRANCH}.`);
    }
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-destination.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/desk-destination-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`DESK DESTINATION | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/desk-destination-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-destination-failure.png`, fullPage: true }).catch(() => {});
  console.error('Desk destination gate FAILED:', error?.stack || error);
  console.error('Desk destination evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 260);
  console.error(`\nDESK DESTINATION | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: bar=${JSON.stringify(state.barState)} chips=${JSON.stringify(state.chips)} blocker=${JSON.stringify(state.blocker)} sent=${JSON.stringify(state.githubRequests)}`);
  await browser.close();
  process.exit(1);
}
