#!/usr/bin/env node
/*
 * WHERE THIS WORK IS GOING TO SIT, CHOSEN BEFORE IT STARTS.
 *
 * The destination bar's own header says why it exists: "a repository you cannot
 * write to costs nothing to swap now, and costs the whole build to discover at
 * the push." That sentence describes a REFUSAL, and until this gate nothing
 * had ever exercised it -- github-connect-destination has been "helpers only"
 * since it shipped.
 *
 * WHAT IT PROVES
 *
 *   1. Signed out of GitHub, the bar says so and offers the connect door
 *      rather than an empty slot.
 *   2. Connected, the chips name the account and say no repository is chosen.
 *      Not choosing is a first-class answer and must read as one.
 *   3. The repository menu lists what the account can see.
 *   4. A repository the person can READ but not WRITE is offered as
 *      unselectable. This is the refusal the bar was built for.
 *   5. Choosing a writable repository sets owner, repo and branch, and the
 *      branch menu can then move it to another branch.
 * Step 4 is the point. Everything else is the happy path, and the happy path
 * is not what costs somebody their build.
 *
 * NOT HERE, DELIBERATELY: the wording a read-only destination shows. A first
 * draft added a sixth step for it that reached into the app's own module from
 * the page -- unimportable against a built preview -- and RETURNED EARLY when
 * that failed. A step that cannot fail is worse than no step, and the wording
 * is a pure function already covered by github-destination.test.js. A browser
 * gate should prove what only a browser can.
 *
 * The evidence is what the desk SENT and what it SHOWS: a menu that renders
 * the right rows and then hands the wrong destination to the build is the
 * failure this path hides. Learned on #596 -- a request landing is not the
 * flow completing -- so each step waits for the chip to change, not merely
 * for a click to be accepted.
 *
 * The verdict is the last line: DESK DESTINATION | passed … or
 * DESK DESTINATION | FAILED at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const ACCOUNT = 'gate-owner';
/*
 * Three repositories, chosen for what they let this gate assert: one the
 * account owns and can push to, one it can only read (the refusal), and one
 * more writable so "picked the right row" is not satisfiable by picking any.
 */
const WRITABLE = { fullName: `${ACCOUNT}/gate-service`, owner: ACCOUNT, repo: 'gate-service', defaultBranch: 'main', canPush: true, isPrivate: false };
const READ_ONLY = { fullName: 'someone-else/upstream-lib', owner: 'someone-else', repo: 'upstream-lib', defaultBranch: 'trunk', canPush: false, isPrivate: false };
const OTHER = { fullName: `${ACCOUNT}/gate-notes`, owner: ACCOUNT, repo: 'gate-notes', defaultBranch: 'main', canPush: true, isPrivate: true };
const BRANCHES = [
  { name: 'main', isDefault: true, protected: true },
  { name: 'release/2026-09', isDefault: false, protected: false },
];
const PICK_BRANCH = 'release/2026-09';

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  githubRequests: [],
  alerts: [],
};

let connected = false;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.QUANTORA_E2E_CHROMIUM ? { executablePath: process.env.QUANTORA_E2E_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('dialog', async (dialog) => { evidence.alerts.push(dialog.message()); await dialog.dismiss().catch(() => {}); });

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const postedJson = (request) => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };

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
    evidence.githubRequests.push({ path, connected });
    return connected
      ? route.fulfill(json(200, { connected: true, login: ACCOUNT, scopes: ['repo'] }))
      : route.fulfill(json(200, { connected: false, reason: 'Connect your GitHub account to choose where this build is saved.' }));
  }
  if (path === '/api/github/list-repos') {
    evidence.githubRequests.push({ path, limit: body.limit ?? null });
    return route.fulfill(json(200, { repositories: [WRITABLE, READ_ONLY, OTHER] }));
  }
  if (path === '/api/github/list-branches') {
    evidence.githubRequests.push({ path, repoUrl: body.repoUrl || null, defaultBranch: body.defaultBranch || null });
    return route.fulfill(json(200, { branches: BRANCHES }));
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

/** Wait for a chip to read something, so a click that did nothing cannot pass. */
async function chipBecomes(id, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let seen = '';
  while (Date.now() < deadline) {
    seen = await chipText(id);
    if (seen === expected) return seen;
    await page.waitForTimeout(200);
  }
  return seen;
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
  await step('signed out of GitHub, the bar offers the door rather than an empty slot', async () => {
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await visible(bar(), 'The composer has no destination bar ([data-quantora-github-destination]).', 20_000);
    const state = await bar().getAttribute('data-quantora-github-destination');
    if (state !== 'disconnected') throw new Error(`With GitHub not connected the bar reads ${JSON.stringify(state)}; expected "disconnected".`);
    await visible(
      page.locator('[data-quantora-github-destination-connect="true"]').first(),
      'Signed out, the bar shows no way to connect GitHub ([data-quantora-github-destination-connect]).',
    );
  });

  await step('connected, the chips name the account and say no repository is chosen', async () => {
    connected = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await visible(bar(), 'The destination bar did not come back after reconnecting.', 20_000);
    const owner = await chipBecomes('owner', ACCOUNT);
    if (owner !== ACCOUNT) throw new Error(`The owner chip reads ${JSON.stringify(owner)}, not the connected account ${ACCOUNT}.`);
    const repo = await chipText('repo');
    if (!/no repository/i.test(repo)) {
      throw new Error(`With nothing chosen the repository chip reads ${JSON.stringify(repo)}; not choosing is a first-class answer and must say so.`);
    }
  });

  await step('the repository menu lists what the account can see', async () => {
    await chip('repo').click();
    const menu = page.locator('[data-quantora-github-destination-menu="repo"]').first();
    await visible(menu, 'The repository menu did not open ([data-quantora-github-destination-menu="repo"]).');
    for (const row of [WRITABLE, READ_ONLY, OTHER]) {
      await visible(
        page.locator(`[data-quantora-github-destination-repo="${row.fullName}"]`).first(),
        `${row.fullName} is missing from the repository menu.`,
      );
    }
    if (!evidence.githubRequests.some((entry) => entry.path === '/api/github/list-repos')) {
      throw new Error('The menu rendered without ever asking the server for the account\'s repositories.');
    }
  });

  /*
   * THE REFUSAL THIS BAR WAS BUILT FOR.
   *
   * "A repository you cannot write to costs nothing to swap now, and costs the
   * whole build to discover at the push." Offering it as selectable is how that
   * cost gets paid.
   */
  await step('a repository the account cannot write to is offered as unselectable', async () => {
    const row = page.locator(`[data-quantora-github-destination-repo="${READ_ONLY.fullName}"]`).first();
    const writable = await row.getAttribute('data-quantora-github-destination-writable');
    if (writable !== 'false') throw new Error(`${READ_ONLY.fullName} is marked writable ${JSON.stringify(writable)}; the menu cannot tell read from write.`);
    if (await row.isEnabled().catch(() => false)) {
      throw new Error(`${READ_ONLY.fullName} is selectable. The account can only read it, so this build would run and fail at the push, which is the whole cost this control exists to avoid.`);
    }
    const ok = page.locator(`[data-quantora-github-destination-repo="${WRITABLE.fullName}"]`).first();
    if (!(await ok.isEnabled().catch(() => false))) throw new Error(`${WRITABLE.fullName} is not selectable, so no repository can be chosen at all.`);
  });

  await step('choosing a repository sets the destination, and the branch can be moved', async () => {
    await page.locator(`[data-quantora-github-destination-repo="${WRITABLE.fullName}"]`).first().click();
    const repo = await chipBecomes('repo', WRITABLE.repo);
    if (repo !== WRITABLE.repo) throw new Error(`After choosing ${WRITABLE.fullName} the repository chip reads ${JSON.stringify(repo)}.`);
    const branch = await chipBecomes('branch', WRITABLE.defaultBranch);
    if (branch !== WRITABLE.defaultBranch) throw new Error(`The branch chip reads ${JSON.stringify(branch)}, not the repository's default ${WRITABLE.defaultBranch}.`);

    await chip('branch').click();
    await visible(page.locator('[data-quantora-github-destination-menu="branch"]').first(), 'The branch menu did not open.');
    const asked = evidence.githubRequests.find((entry) => entry.path === '/api/github/list-branches');
    if (!asked) throw new Error('The branch menu opened without asking the server for branches.');
    if (!String(asked.repoUrl || '').endsWith(`/${WRITABLE.owner}/${WRITABLE.repo}`)) {
      throw new Error(`Branches were requested for ${asked.repoUrl}, not the repository just chosen.`);
    }
    await page.locator(`[data-quantora-github-destination-branch="${PICK_BRANCH}"]`).first().click();
    const moved = await chipBecomes('branch', PICK_BRANCH);
    if (moved !== PICK_BRANCH) throw new Error(`After choosing ${PICK_BRANCH} the branch chip still reads ${JSON.stringify(moved)}; the build would go to the wrong branch.`);
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
