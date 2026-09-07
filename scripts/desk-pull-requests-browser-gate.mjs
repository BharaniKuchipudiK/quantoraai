#!/usr/bin/env node
/*
 * PULL REQUESTS FROM THE DESK: list, read, comment, open, merge.
 *
 * `github-pull-requests` is the last GitHub journey in the ledger that nothing
 * has ever driven. Its server side is tested, its panel is hooked, and no gate
 * had clicked any of it -- which is where `github-push` sat on the day its link
 * vanished after a push, and where three production endpoints sat on the day a
 * green check said they were fine.
 *
 * WHAT THIS PROVES, AND WHY TWO OF THE STEPS MATTER MORE THAN THE REST
 *
 *   1. The panel lists the open pull requests of the imported repository.
 *   2. Opening one shows its brief -- and a commit with NO checks does not get
 *      a green tick. The panel's own header promises that; nothing enforced it
 *      on screen.
 *   3. A comment posts against the pull request that is open, and the panel
 *      says who it was posted as.
 *   4. "Open a draft PR" sends draft:true with the desk's head and base.
 *   5. Merge carries the sha of the commit that was READ, not whatever the
 *      branch has moved to since.
 *
 * Steps 2 and 5 are the ones worth the file. Both are refusals, and a refusal
 * is exactly what stops being tested: nobody notices a guard that quietly stops
 * guarding, because the happy path still looks right.
 *
 * Step 5 is the pull-request form of what `candidate-patch.js` does for a desk
 * write -- an action is bound to the state it was computed against, or it does
 * not happen. Here the cost of losing it is merging code nobody read.
 *
 * Everything is asserted on what the desk SENT. A panel that renders the right
 * words and posts the wrong number is the failure this path hides.
 *
 * The verdict is the last line: DESK PRS | passed … or
 * DESK PRS | FAILED at <step> | <why> | <state>.
 */
import process from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { compilePreviewVfs } from '../api/_lib/preview-compiler.js';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_DIR = 'artifacts/e2e';
mkdirSync(ARTIFACT_DIR, { recursive: true });

const REPO_URL = 'https://github.com/gate-owner/gate-service';
const REPO_NAME = 'gate-owner/gate-service';
const ACTED_AS = 'gate-owner';

/*
 * Two pull requests, chosen for what they let this gate assert.
 *
 * #7 carries NO checks. GitHub answers the same way for "CI has not started"
 * and "this repository runs none", and the panel must not turn either into a
 * green tick -- that is the difference between "safe to merge" and "nobody has
 * looked".
 *
 * #9 is green, and is the one that gets merged.
 */
/*
 * Shaped from api/_lib/github-intelligence.ts (PullRequestSummary, CheckSummary)
 * rather than from what the panel happens to read. A stub narrower than the
 * server's own type is a gate testing fiction: the first draft of this file
 * sent `checks: {}`, the brief threw on `checks.failing.length`, and the
 * failure looked exactly like a missing durable hook in the component.
 */
const summary = (fields) => ({
  state: 'open',
  draft: false,
  author: ACTED_AS,
  headRef: 'quantora-desk',
  baseRef: 'main',
  htmlUrl: `https://github.com/${REPO_NAME}/pull/${fields.number}`,
  updatedAt: '2026-09-07T08:00:00Z',
  additions: 12,
  deletions: 3,
  changedFiles: 1,
  mergeable: true,
  mergeStateStatus: 'clean',
  ...fields,
});
const checks = (state, headSha) => ({ state, headSha, total: state === 'none' ? 0 : 1, failing: [], pending: [] });

const PR_UNCHECKED = summary({ number: 7, title: 'Add retry backoff to the worker', headSha: 'aaaaaaaaaaaa1111', author: 'someone-else' });
const PR_GREEN = summary({ number: 9, title: 'Tighten the upload guard', headSha: 'bbbbbbbbbbbb2222' });
const OPENED_PR_NUMBER = 11;
const COMMENT_BODY = 'Checked the retry path against the failing case.';

/*
 * The Git rail only exists once the desk holds files, so this gate has to build
 * something before it can reach the pull request panel at all. The build is
 * scaffolding here -- coding-desk-must-write-files owns proving it works.
 */
const SITE_HTML = '<!DOCTYPE html><html><body><main><h1 data-testid="pr-gate-site">gate-service</h1></main></body></html>';
const BUILD_REPLY = ['Built a page for the service.', '', '```html filepath="index.html"', SITE_HTML, '```'].join('\n');
const sseBody = (text) => [
  `data: ${JSON.stringify({ text })}`,
  `data: ${JSON.stringify({ provider: 'Synthetic PR Gate', latencyMs: 18, modelId: 'synthetic-a', liveConnected: true })}`,
  'data: [DONE]',
  '',
].join('\n\n');

const briefFor = (pr, checksState) => ({
  repository: REPO_NAME,
  summary: pr,
  checks: checks(checksState, pr.headSha),
  files: [{ path: 'worker.js', status: 'modified', additions: 12, deletions: 3, patch: '@@ -1 +1 @@' }],
  reviews: [],
  threads: [],
  comments: [],
  truncated: { files: false },
});

const evidence = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  steps: [],
  githubRequests: [],
  alerts: [],
};

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
  localStorage.removeItem('quantora_studio_chat_width_pct');
  localStorage.removeItem('quantora_desk_files_width_px');
});

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const postedJson = (request) => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };

let openPullRequests = [PR_UNCHECKED, PR_GREEN];

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  const body = postedJson(request);
  if (path === '/api/auth/session') {
    return route.fulfill(json(200, { user: { sub: 'pr-gate', name: 'PR Gate', email: 'pr-gate@quantora.invalid', picture: null, isAdmin: false } }));
  }
  if (path === '/api/models') {
    return route.fulfill(json(200, { models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'synthetic', available: true }] }));
  }
  if (path === '/api/plan-turn') return route.fulfill(json(500, { error: 'planner offline in this gate' }));
  if (path === '/api/preview-compile' && method === 'POST') {
    try {
      return route.fulfill(json(200, await compilePreviewVfs(body.vfs || {})));
    } catch (error) {
      return route.fulfill(json(400, { error: error?.message || 'compile failed' }));
    }
  }
  if (path === '/api/chat' && method === 'POST') {
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(BUILD_REPLY) });
  }
  if (path === '/api/github/preview' && method === 'POST') {
    return route.fulfill(json(200, { name: REPO_NAME, content: '// worker.js', branch: 'main' }));
  }
  if (path === '/api/github/connection') {
    return route.fulfill(json(200, { connected: true, login: ACTED_AS, scopes: ['repo'] }));
  }
  if (path === '/api/github/list-prs' && method === 'POST') {
    evidence.githubRequests.push({ path, repoUrl: body.repoUrl || null, state: body.state || null });
    return route.fulfill(json(200, { pullRequests: openPullRequests }));
  }
  if (path === '/api/github/read-pr' && method === 'POST') {
    evidence.githubRequests.push({ path, number: body.number ?? null });
    if (body.number === PR_UNCHECKED.number) return route.fulfill(json(200, briefFor(PR_UNCHECKED, 'none')));
    return route.fulfill(json(200, briefFor(PR_GREEN, 'passing')));
  }
  if (path === '/api/github/comment' && method === 'POST') {
    evidence.githubRequests.push({ path, number: body.number ?? null, body: body.body || null });
    return route.fulfill(json(200, { actedAs: ACTED_AS }));
  }
  if (path === '/api/github/create-pr' && method === 'POST') {
    evidence.githubRequests.push({ path, title: body.title || null, head: body.head || null, base: body.base || null, draft: body.draft ?? null });
    openPullRequests = [...openPullRequests, summary({ number: OPENED_PR_NUMBER, title: body.title, draft: true, headSha: 'cccccccccccc3333' })];
    return route.fulfill(json(200, { number: OPENED_PR_NUMBER, actedAs: ACTED_AS }));
  }
  if (path === '/api/github/merge-pr' && method === 'POST') {
    evidence.githubRequests.push({ path, number: body.number ?? null, expectedHeadSha: body.expectedHeadSha ?? null, mergeMethod: body.mergeMethod || null });
    /*
     * The server's real refusal, kept rather than stubbed away. A gate whose
     * server accepts any sha cannot tell a bound merge from an unbound one.
     */
    if (body.expectedHeadSha !== PR_GREEN.headSha) {
      return route.fulfill(json(409, { error: 'The head commit moved since you read it.' }));
    }
    return route.fulfill(json(200, { sha: 'dddddddddddd4444merged' }));
  }
  if (path.startsWith('/api/github/')) return route.fulfill(json(200, { ok: true, connected: true, login: ACTED_AS }));
  return route.fulfill(json(200, { ok: true }));
});

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

async function visible(locator, message, timeout = 15_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

const panel = () => page.locator('[data-quantora-github-prs="true"]').first();
const statusText = async () => (await panel().locator('[data-quantora-github-status="true"]').first().innerText().catch(() => '')).trim();
const errorText = async () => (await panel().locator('[data-quantora-github-error="true"]').first().innerText({ timeout: 600 }).catch(() => '')).trim();

async function pageState() {
  return {
    url: page.url(),
    panelVisible: await panel().isVisible().catch(() => false),
    status: await statusText().catch(() => null),
    error: await errorText().catch(() => null),
    checks: await panel().locator('[data-quantora-github-checks]').first().innerText({ timeout: 600 }).catch(() => null),
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

const sent = (path) => evidence.githubRequests.filter((entry) => entry.path === path);
const lastSent = (path) => sent(path).at(-1) || null;

async function waitForSent(path, predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = sent(path).find((entry) => predicate(entry));
    if (found) return found;
    await page.waitForTimeout(200);
  }
  return null;
}

try {
  await step('a repository is open and its pull requests list', async () => {
    await page.goto(`${BASE_URL}/desk`, { waitUntil: 'domcontentloaded' });
    const { composer } = await enterSignedInStudio(page);
    await page.locator('[data-quantora-attachment-menu="true"]').first().click();
    await page.locator('[data-quantora-github-import-open="true"]').first().click();
    await page.locator('[data-quantora-github-import-url="true"]').first().fill(REPO_URL);
    await page.locator('[data-quantora-github-import-run="true"]').first().click();
    await visible(page.locator(`[data-quantora-attachment-chip="${REPO_NAME}"]`).first(), 'The repository never imported, so the pull request panel has no repository.', 20_000);

    // The Git rail only exists once the desk holds files.
    await composer.fill('Build a small page for this service');
    await composer.press('Enter');
    if (!(await frameShowing('[data-testid="pr-gate-site"]'))) throw new Error('The build never rendered, so the desk never opened and the Git rail cannot exist.');

    const rail = page.locator('[data-quantora-desk-rail="git"]').first();
    await visible(rail, 'The desk rail has no Git entry ([data-quantora-desk-rail="git"]).');
    await rail.click();
    await visible(panel(), 'The Git view opened without the pull request panel ([data-quantora-github-prs]).', 20_000);
    await visible(panel().locator('[data-quantora-github-connected="true"]').first(), 'The panel does not show the connected GitHub account.');

    const refresh = panel().locator('[data-quantora-github-refresh="true"]').first();
    if (!(await refresh.isEnabled().catch(() => false))) throw new Error('Refresh is disabled: the panel sees no repository, so the import never reached it.');
    await refresh.click();
    const listed = await waitForSent('/api/github/list-prs', (entry) => entry.repoUrl === REPO_URL);
    if (!listed) throw new Error(`Refresh never listed pull requests for ${REPO_URL} (requests: ${JSON.stringify(evidence.githubRequests)}; error: ${await errorText()}).`);
    await visible(page.locator(`[data-quantora-github-pr="${PR_GREEN.number}"]`).first(), `Pull request #${PR_GREEN.number} is not on screen after listing.`);
  });

  /*
   * THE FIRST REFUSAL.
   *
   * The panel's own header says it "deliberately never renders a green tick for
   * a commit with no checks", and until now only a unit test held it. On screen
   * the difference is between "safe to merge" and "nobody has looked".
   */
  await step('a commit with no checks is not shown as green', async () => {
    await page.locator(`[data-quantora-github-pr="${PR_UNCHECKED.number}"]`).first().click();
    const read = await waitForSent('/api/github/read-pr', (entry) => entry.number === PR_UNCHECKED.number);
    if (!read) throw new Error(`Opening #${PR_UNCHECKED.number} never asked the server to read it.`);
    const checksLine = panel().locator('[data-quantora-github-checks]').first();
    await visible(checksLine, 'The pull request brief shows no check state at all.');
    const state = await checksLine.getAttribute('data-quantora-github-checks');
    const label = (await checksLine.innerText()).trim();
    if (state === 'passing' || /green/i.test(label)) {
      throw new Error(`A commit with no checks is being shown as ${JSON.stringify(label)} (state ${JSON.stringify(state)}); that reads as safe to merge when nobody has looked.`);
    }
    if (!/no checks/i.test(label)) throw new Error(`The brief reads ${JSON.stringify(label)}; expected it to say no checks ran on this commit.`);
  });

  await step('a comment posts against the pull request that is open', async () => {
    await page.locator(`[data-quantora-github-pr="${PR_GREEN.number}"]`).first().click();
    if (!(await waitForSent('/api/github/read-pr', (entry) => entry.number === PR_GREEN.number))) {
      throw new Error(`Opening #${PR_GREEN.number} never asked the server to read it.`);
    }
    const box = panel().locator('[data-quantora-github-comment="true"]').first();
    await visible(box, 'The brief has no comment box ([data-quantora-github-comment]).');
    await box.fill(COMMENT_BODY);
    await panel().locator('[data-quantora-github-post-comment="true"]').first().click();
    const posted = await waitForSent('/api/github/comment', (entry) => entry.body === COMMENT_BODY);
    if (!posted) throw new Error(`The comment never posted (requests: ${JSON.stringify(sent('/api/github/comment'))}; error: ${await errorText()}).`);
    if (posted.number !== PR_GREEN.number) throw new Error(`The comment went to #${posted.number}, not the pull request on screen (#${PR_GREEN.number}).`);
    await page.waitForFunction(() => /posted as/i.test(document.querySelector('[data-quantora-github-status="true"]')?.textContent || ''), null, { timeout: 10_000 }).catch(() => {});
    const status = await statusText();
    if (!status.includes(ACTED_AS)) throw new Error(`The panel reports ${JSON.stringify(status)}; it must name who the comment was posted as.`);
  });

  await step('opening a pull request from the desk sends a draft against the desk branch', async () => {
    await panel().locator('[data-quantora-github-open-pr="true"]').first().click();
    const opened = await waitForSent('/api/github/create-pr', () => true);
    if (!opened) throw new Error(`Open PR never reached the server (error: ${await errorText()}).`);
    if (opened.draft !== true) throw new Error(`The pull request was opened with draft ${JSON.stringify(opened.draft)}; the desk opens drafts so a person reviews before it is live.`);
    if (!opened.head || !opened.base) throw new Error(`The pull request was opened without a head/base (head ${JSON.stringify(opened.head)}, base ${JSON.stringify(opened.base)}).`);
    if (opened.head === opened.base) throw new Error(`The pull request was opened from ${opened.head} into itself.`);
    await page.waitForFunction(() => /Draft pull request/i.test(document.querySelector('[data-quantora-github-status="true"]')?.textContent || ''), null, { timeout: 10_000 }).catch(() => {});
    const status = await statusText();
    if (!status.includes(String(OPENED_PR_NUMBER)) || !status.includes(ACTED_AS)) {
      throw new Error(`The panel reports ${JSON.stringify(status)}; it must name the pull request opened and who opened it.`);
    }
  });

  /*
   * THE SECOND REFUSAL, AND THE ONE THAT COSTS THE MOST TO LOSE.
   *
   * The merge must carry the sha of the commit that was READ. Without that
   * binding a merge lands whatever the branch has moved to since -- code nobody
   * in this session ever saw. The stub answers 409 for any other sha, so a
   * merge that sends the wrong one fails here rather than passing quietly.
   */
  await step('merging carries the commit that was read, not whatever the branch became', async () => {
    await page.locator(`[data-quantora-github-pr="${PR_GREEN.number}"]`).first().click();
    if (!(await waitForSent('/api/github/read-pr', (entry) => entry.number === PR_GREEN.number))) {
      throw new Error(`Re-opening #${PR_GREEN.number} never asked the server to read it.`);
    }
    const merge = panel().locator('[data-quantora-github-merge="true"]').first();
    await visible(merge, 'The brief has no merge control ([data-quantora-github-merge]).');
    if (!(await merge.isEnabled().catch(() => false))) {
      throw new Error(`Merge is disabled on an open, mergeable, CI-green pull request (status: ${await statusText()}; error: ${await errorText()}).`);
    }
    await merge.click();
    const merged = await waitForSent('/api/github/merge-pr', () => true);
    if (!merged) throw new Error(`Merge never reached the server (error: ${await errorText()}).`);
    if (merged.number !== PR_GREEN.number) throw new Error(`Merge was sent for #${merged.number}, not the pull request on screen (#${PR_GREEN.number}).`);
    if (!merged.expectedHeadSha) {
      throw new Error(`Merge was sent with no expectedHeadSha, so it would land whatever the branch has moved to since it was read. Sent: ${JSON.stringify(merged)}.`);
    }
    if (merged.expectedHeadSha !== PR_GREEN.headSha) {
      throw new Error(`Merge was bound to ${merged.expectedHeadSha}, not the commit the brief displayed (${PR_GREEN.headSha}).`);
    }
    const failed = await errorText();
    if (failed) throw new Error(`The merge was refused: ${failed}. Sent: ${JSON.stringify(merged)}.`);
  });

  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-pull-requests.png`, fullPage: true });
  evidence.completedAt = new Date().toISOString();
  writeFileSync(`${ARTIFACT_DIR}/desk-pull-requests-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`DESK PRS | passed | ${evidence.steps.map((entry) => `${entry.name} (${entry.ms}ms)`).join(' → ')}`);
  await browser.close();
  process.exit(0);
} catch (error) {
  const state = await pageState().catch(() => ({ snapshotFailed: true }));
  evidence.failedAt = new Date().toISOString();
  evidence.failedStep = currentStep;
  evidence.error = error?.message || String(error);
  evidence.pageState = state;
  writeFileSync(`${ARTIFACT_DIR}/desk-pull-requests-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/desk-pull-requests-failure.png`, fullPage: true }).catch(() => {});
  console.error('Desk pull requests gate FAILED:', error?.stack || error);
  console.error('Desk pull requests evidence:', JSON.stringify(evidence, null, 2));
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 260);
  console.error(`\nDESK PRS | FAILED at: ${currentStep} | why: ${oneLine(error?.message || error)} | state: panel=${state.panelVisible} status=${JSON.stringify(state.status)} error=${JSON.stringify(state.error)} checks=${JSON.stringify(state.checks)} sent=${JSON.stringify(state.githubRequests)}`);
  await browser.close();
  process.exit(1);
}
