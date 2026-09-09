#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { pageStateSnapshot } from './lib/golden-page-state.mjs';
import { reconcilePipeline } from './lib/business-tool-reconcile.mjs';
import { engineRefusalStopsRun } from './lib/golden-engine-refusal.mjs';
import { planGoldenTransactions } from './lib/golden-plan.mjs';
import { claimFilterWroteThis } from '../src/lib/desk-chat-claim-filter.js';
import { buildMinimalPdf, bylawsFixtureText, eventCalendarFixtureText } from './lib/minimal-pdf.mjs';
import { wordDocumentWords } from './lib/office-words.mjs';

/*
 * THE ROSTER, AND WHY A SUCCESSFUL RUN NOW HAS TO NAME IT.
 *
 * Adding the business-tool transaction, the run went green and step 10 finished
 * FASTER than the three-transaction runs before it. Nothing in the log could
 * settle whether the new transaction had run at all: on success this script
 * printed a JSON blob in the middle of the output and wrote no verdict file, so
 * the workflow's final `cat` printed nothing. The only clue was the artifact
 * growing by 400KB, which is a guess wearing evidence's clothes.
 *
 * A transaction that silently stops running would report success forever. That
 * is the §4 case at its worst — the suite still costs four live model turns per
 * run and would be proving three of them. So the roster is declared, checked
 * against what actually completed, and printed last on every run, pass or fail.
 */
const EXPECTED_TRANSACTIONS = ['calculator', 'simple-website', 'guided-intake', 'business-tool', 'document-grounded', 'brief-with-documents', 'iterate-heading', 'office-document'];
/*
 * A pull request plans the first two (the deployment answers, and builds);
 * production plans the whole roster. See scripts/lib/golden-plan.mjs for why.
 */
const { limit: TRANSACTION_LIMIT, planned: PLANNED_TRANSACTIONS } = planGoldenTransactions(
  EXPECTED_TRANSACTIONS,
  process.env.QUANTORA_GOLDEN_TRANSACTION_LIMIT,
);
const runs = (position) => TRANSACTION_LIMIT >= position;

const BASE_URL = String(process.env.QUANTORA_E2E_BASE_URL || '').replace(/\/+$/, '');
const CANARY_TOKEN = String(process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '');
const VERCEL_BYPASS_TOKEN = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');
const ARTIFACT_DIR = process.env.QUANTORA_E2E_ARTIFACT_DIR || 'artifacts/e2e';
const TURN_TIMEOUT_MS = Number(process.env.QUANTORA_GOLDEN_TURN_TIMEOUT_MS || 150_000);
const BASE_ORIGIN = new URL(BASE_URL).origin;

if (!/^https:\/\//.test(BASE_URL)) throw new Error('QUANTORA_E2E_BASE_URL must be an HTTPS deployment URL.');
if (CANARY_TOKEN.length < 24) throw new Error('QUANTORA_GOLDEN_CANARY_TOKEN is missing or too short.');
if (VERCEL_BYPASS_TOKEN.length < 24) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is missing or too short.');

// Node's fetch does not persist Set-Cookie across redirects. Sending
// x-vercel-set-bypass-cookie here makes Vercel 307 forever (redirect count
// exceeded). Header-only bypass is enough for this readiness probe; the
// browser path below still sets the cookie for in-page navigations.
const apiBypassHeaders = {
  'X-Quantora-Golden-Canary': CANARY_TOKEN,
  'x-vercel-protection-bypass': VERCEL_BYPASS_TOKEN,
};
const browserBypassHeaders = {
  ...apiBypassHeaders,
  'x-vercel-set-bypass-cookie': 'samesitenone',
};

mkdirSync(ARTIFACT_DIR, { recursive: true });

const healthResponse = await fetch(`${BASE_URL}/api/inference-health`, { headers: apiBypassHeaders });
const health = await healthResponse.json().catch(() => ({}));
if (!healthResponse.ok || health.ready !== true) {
  throw new Error(`Deployed inference is not executable (${healthResponse.status}): ${JSON.stringify(health)}`);
}
/*
 * ASK THE ENGINE ITSELF, before the first turn spends five transactions on it.
 *
 * "ready" above is configuration: a key is present, a route is planned. On
 * 2026-09-05 two preview deployments failed their FIRST transaction four hours
 * apart — once as "no healthy AI route", once as a silent turn — and the
 * verdict could not say whether Gemini (the only engine a preview has) had
 * answered anything at all. This live probe lists models and generates one
 * short answer through the same credential path the chat handler uses. Its
 * outcome rides in the evidence and in the failure verdict's state digest as
 * engine=ok(model) or engine=FAILED(status: reason), so a dead gateway reads
 * as a dead gateway and never again as a mystery in the calculator.
 */
const engineProbe = await (async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/inference-health?probe=gemini`, { headers: apiBypassHeaders });
    const report = await response.json().catch(() => ({}));
    const generate = report?.generate || {};
    const list = report?.list || {};
    return {
      httpStatus: response.status,
      ok: generate.ok === true,
      model: generate.model || null,
      listOk: list.ok === true,
      listed: typeof list.totalListed === 'number' ? list.totalListed : null,
      status: generate.status ?? list.status ?? null,
      error: generate.error || list.error || report?.error || null,
      ms: typeof generate.ms === 'number' ? generate.ms : null,
      verdict: typeof report?.verdict === 'string' ? report.verdict : null,
    };
  } catch (error) {
    return { httpStatus: null, ok: false, model: null, listOk: false, listed: null, status: null, error: error?.message || String(error), ms: null, verdict: null };
  }
})();
let engineDigest = engineProbe.ok
  ? `engine=ok(${engineProbe.model || 'gemini'}${engineProbe.ms ? ` ${engineProbe.ms}ms` : ''})`
  : `engine=FAILED(${engineProbe.status || engineProbe.httpStatus || 'no-answer'}${engineProbe.error ? `: ${String(engineProbe.error).replace(/\s+/g, ' ').slice(0, 120)}` : ''})`;
console.log(`Engine probe before the first turn: ${engineDigest}`);
console.log(`Transactions planned: ${PLANNED_TRANSACTIONS.join(', ')} (${TRANSACTION_LIMIT} of ${EXPECTED_TRANSACTIONS.length}${TRANSACTION_LIMIT < EXPECTED_TRANSACTIONS.length ? ', limited by QUANTORA_GOLDEN_TRANSACTION_LIMIT' : ''})`);
/*
 * Fail in one second with the real cause, not in forty with a false one.
 *
 * On 2026-09-01 this gate failed 3/3 on PR previews as "no healthy AI route"
 * + console 401s. The actual defect was configuration: the canary token env
 * was scoped to Production, so the deployment did not recognize the header,
 * mayUseServerKeys stayed false, and every canary chat turn ran keyless. The
 * health endpoint now answers the exact question ("would this deployment
 * honor my canary?") before any model turn is spent. Deployments older than
 * that field cannot reach this check: the workflow checks out the deployed
 * commit, so script and handler always travel together.
 */
if (health.goldenCanaryHonored !== true) {
  throw new Error(
    'The deployment did NOT honor the golden canary token'
    + (health.goldenCanaryConfigured === false
      ? ' — QUANTORA_GOLDEN_CANARY_TOKEN is not configured on this deployment. On a Vercel preview that means the env var is scoped to Production only; enable it for the Preview environment.'
      : " — the CI secret does not match this deployment's QUANTORA_GOLDEN_CANARY_TOKEN.")
    + ' Without it every canary chat turn runs keyless and reports a provider outage that is not real.',
  );
}
/*
 * The 2026-09-01 preview runs falsified the canary hypothesis: the handshake
 * passed and the chat turn still found no routes — on previews only, 4/4,
 * while production stayed green. The next discriminators are already in this
 * health response: an empty route catalog fails here in one second naming
 * itself, and the full readiness snapshot (routeCount, key flags, spend —
 * no secret material) rides along in the evidence so a failed run carries
 * its own diagnosis instead of demanding another round of guessing.
 */
if (Number(health.routeCount) === 0) {
  throw new Error(
    'The deployment reports ZERO inference routes despite ready=true — the '
    + 'chat turn cannot succeed. Readiness snapshot: '
    + JSON.stringify(health),
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
});
await context.route('**/*', (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== BASE_ORIGIN) return route.continue();
  return route.continue({
    headers: {
      ...request.headers(),
      ...browserBypassHeaders,
    },
  });
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

/*
 * Every failed API answer: path, status, and the server's own words. The
 * console reports "the server responded with a status of 502 ()" and nothing
 * else — not the path, not the body — so the office-document failure of
 * 2026-09-06 could only be read from the desk's prose, which carried the
 * error's headline and not its cause. A JSON error body is where the server
 * says what it tried (`stage`, `detail`); this keeps the last forty, tagged
 * with the transaction that was running.
 */
let activeTransactionName = null;
const apiFailures = [];
let failedOwnerWriteCount = 0;
let rejectedCodingWriteCount = 0;
page.on('response', (response) => {
  let url;
  try { url = new URL(response.url()); } catch { return; }
  if (url.origin !== BASE_ORIGIN || !url.pathname.startsWith('/api/') || response.status() < 400) return;
  const entry = { at: new Date().toISOString(), transaction: activeTransactionName, path: url.pathname, status: response.status() };
  const request = response.request();
  const method = request.method();
  let action = null;
  try { action = request.postDataJSON()?.action || null; } catch { /* no JSON body */ }
  const ownerWrite = method === 'POST' && (entry.path === '/api/desk-checkpoints' || (entry.path === '/api/projects' && action === 'save'));
  // The diagnostic tail may roll over; a failed save, including a conflict,
  // must remain load-bearing for the whole run.
  if (ownerWrite) failedOwnerWriteCount += 1;
  if (entry.path === '/api/qir-runs' && entry.status === 400) rejectedCodingWriteCount += 1;
  apiFailures.push(entry);
  if (apiFailures.length > 40) apiFailures.shift();
  response.text().then((body) => {
    try {
      const data = JSON.parse(body);
      for (const field of ['error', 'stage', 'detail']) {
        if (typeof data?.[field] === 'string' && data[field]) entry[field] = data[field].replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      entry.body = String(body || '').replace(/\s+/g, ' ').slice(0, 160);
    }
  }).catch(() => {});
});
function lastApiFailure(pathPrefix, transaction = null) {
  for (let index = apiFailures.length - 1; index >= 0; index -= 1) {
    const entry = apiFailures[index];
    if (!entry.path.startsWith(pathPrefix)) continue;
    if (transaction && entry.transaction !== transaction) continue;
    return entry;
  }
  return null;
}
function describeApiFailure(entry) {
  if (!entry) return null;
  const words = entry.detail || entry.error || entry.body || '';
  return `${entry.path} answered HTTP ${entry.status}${entry.stage ? ` at ${entry.stage}` : ''}${words ? `: ${words}` : ''}`;
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
});

// The canary uses an isolated synthetic identity only to enter the Studio shell.
// /api/chat, provider routing, response parsing, /api/preview-compile and iframe
// rendering remain the real deployed services and are never intercepted.
await page.route('**/api/auth/session', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    user: {
      sub: 'quantora-golden-canary',
      name: 'Golden Canary',
      email: 'golden-canary@quantora.invalid',
      picture: null,
      isAdmin: false,
    },
  }),
}));

async function visible(locator, message, timeout = TURN_TIMEOUT_MS) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

async function frameWith(selector, timeout = TURN_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.locator(selector).first().isVisible().catch(() => false)) return frame;
    }
    const previewError = await page.locator('[data-quantora-real-project-preview="true"]').first().getAttribute('data-quantora-preview-error').catch(() => null);
    if (previewError) throw new Error(`The deployed iframe failed before ${selector} rendered: ${previewError}`);
    await page.waitForTimeout(250);
  }
  return null;
}

async function setGoldenTransaction(name) {
  await page.evaluate((transaction) => sessionStorage.setItem('quantora_golden_transaction', transaction), name);
}

async function correlationForPreview(previous = null) {
  const preview = page.locator('[data-quantora-real-project-preview="true"]').first();
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const contractError = await page.locator('[data-quantora-preview-contract-error]').first()
      .getAttribute('data-quantora-preview-contract-error').catch(() => null);
    if (contractError) throw new Error(contractError);
    /*
     * A turn that has already failed is not worth waiting out.
     *
     * The desk publishes data-quantora-last-turn-failed once the last AI
     * message is an error and nothing is still generating. Without it this
     * loop burned its full 150s on a turn that died in seconds, and reported
     * only that the artifact "never reached the preview" — the symptom of a
     * dozen different causes. Anchored on the hook, never on the failure copy,
     * which is free to change.
     */
    const turnFailed = await page.locator('[data-quantora-last-turn-failed="true"]').first()
      .isVisible().catch(() => false);
    if (turnFailed) {
      throw new Error(
        `The chat turn failed before any artifact was produced. `
        + `Page state: ${await recordPageState()}`,
      );
    }
    if (await preview.isVisible().catch(() => false)) {
      const correlationId = await preview.getAttribute('data-quantora-correlation-id');
      if (correlationId && correlationId !== previous) return correlationId;
    }
    await page.waitForTimeout(250);
  }
  /*
   * Say what the page was doing, not just that it did not finish. Without
   * this the only way to tell a failed chat turn from a slow one was to
   * download the run artifact, which is why this gate stayed mislabelled
   * as flaky instead of being diagnosed.
   */
  throw new Error(
    `The generated artifact never reached the deployed project preview after ${Math.round(TURN_TIMEOUT_MS / 1000)}s. `
    + `Page state at timeout: ${await recordPageState()}`,
  );
}

/*
 * The snapshot kept as DATA, not only as a sentence.
 *
 * describePageState returns JSON embedded in a long message, and the verdict
 * line then truncated it — on the ad6412b run it cut at exactly "previewMou",
 * losing previewMounted/previewCompiling/previewError, which are the three
 * fields that separate "the turn failed" from "the preview never mounted" from
 * "the preview crashed". Keeping the object means the verdict can lead with
 * them instead of with a URL and a paragraph of model prose.
 */
async function recordPageState() {
  const snapshot = await pageStateSnapshot(page, consoleErrors);
  evidence.pageState = snapshot;
  try {
    return JSON.stringify(snapshot);
  } catch {
    return '{"snapshotFailed":"page state was not serialisable"}';
  }
}

async function recordInteraction(correlationId, transaction) {
  const ok = await page.evaluate(async ({ correlationId: id, transaction: tx }) => {
    const response = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Quantora-Correlation-Id': id },
      body: JSON.stringify({ correlationId: id, transaction: tx, boundary: 'browser.interaction', state: 'interacted' }),
    });
    return response.ok;
  }, { correlationId, transaction });
  if (!ok) throw new Error(`Interaction proof could not be recorded for ${transaction}.`);
}

const evidence = {
  baseUrl: BASE_URL,
  deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA || null,
  startedAt: new Date().toISOString(),
  // The deployment's own account of its readiness, captured before any model
  // turn — carries no secrets and answers "which key/route path differed"
  // without a fifth round of hypothesis.
  inferenceHealth: health,
  // The engine's own answer at the start, not the configuration's promise.
  engineProbe,
  plannedTransactions: PLANNED_TRANSACTIONS,
  transactions: [],
  apiFailures,
};

function markActiveTransaction(name, correlationId = null) {
  activeTransactionName = name;
  evidence.activeTransaction = { name, correlationId };
}

try {
  /*
   * STOP HERE when the engine itself refused the credential. A 401, 403 or 429
   * from the engine is not about any one model or any one turn: every route on
   * that key fails the same way, so five browser transactions would only
   * restate it as a mystery in the calculator (2026-09-05: "Your prepayment
   * credits are depleted"). Any other probe outcome — a single-model 404, the
   * probe endpoint unreachable — is recorded and the transactions still run,
   * because that evidence is not unambiguous (§5).
   *
   * UNLESS the deployment has a second engine a turn can reach. Production
   * plans OpenRouter behind Gemini, and on 2026-09-06 the first version of
   * this stop blinded the gate to that path five minutes after a run had
   * proved three transactions on it — the same path whose React 17 mounts
   * had just broken production (#560). scripts/lib/golden-engine-refusal.mjs
   * decides, from the health snapshot's own words: a refusal is fatal only
   * when no other route exists; otherwise the run continues on the fallback
   * and the verdict's state digest says so ("fallback=openrouter").
   *
   * INSIDE the try, deliberately: the first version threw above it and the
   * run ended with a stack trace and no GOLDEN VERDICT line, no verdict file
   * and no evidence JSON — the gate said less at the moment it knew most (§8).
   * From here the catch below composes the verdict like any other failure:
   * "failed at: engine-probe … engine=FAILED(429: …)".
   */
  // Not a transaction (the roster test reads markActiveTransaction), but the
  // verdict's "failed at:" must still name where the run stopped.
  evidence.activeTransaction = { name: 'engine-probe', correlationId: null };
  const refusal = engineRefusalStopsRun(engineProbe, health);
  evidence.engineRefusal = refusal;
  if (refusal.stop) {
    // The reason FIRST: the verdict's "why" keeps 160 characters, the state
    // digest already carries engine=FAILED(...), and a stop whose verdict
    // line cannot say why it was fatal is a diagnosis nobody can find (§8).
    throw new Error(`${refusal.reason} ${engineDigest}. ${engineProbe.verdict || ''}`.trim());
  }
  if (refusal.refused) {
    // The verdict's state digest must say the transactions ran on the
    // fallback, or a pass here would read as Gemini answering.
    engineDigest = `${engineDigest} fallback=${refusal.fallback}`;
    console.log(`Engine refused; the transactions run on the fallback engine. ${refusal.reason}`);
  }

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  /*
   * Anchor on the data hook, not the button's words.
   *
   * This used to be getByRole('button', { name: /^(AI )?Studio$/i }). The
   * landing CTA was later reworded to "Try Quantora", so the locator matched
   * nothing and this gate failed on EVERY run — which is what "historically
   * flaky" in the workflow actually meant. It was not flaky; it was stale and
   * permanently red, and being muted is why the ESM outage of 2026-08-31 went
   * unseen. data-quantora-enter-studio is the durable contract the landing
   * page already publishes for exactly this purpose, so copy changes can no
   * longer silence the deployment's most valuable test.
   */
  const studio = page.locator('[data-quantora-enter-studio="true"]').first();
  await visible(studio, 'The landing page never offered a way into the Studio (looked for [data-quantora-enter-studio]).', 20_000);
  await studio.click();

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing after the canary identity was restored.', 20_000);

  const calculatorStartedAt = Date.now();
  markActiveTransaction('calculator');
  await setGoldenTransaction('calculator');
  await prompt.fill('Create a simple working React calculator. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. It must render an output with data-testid="calculator-display" initially showing 0 and a button with data-testid="calculator-one" that changes the display to 1 when clicked. Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package.');
  await prompt.press('Enter');
  const calculatorCorrelationId = await correlationForPreview();
  markActiveTransaction('calculator', calculatorCorrelationId);
  const calculatorFrame = await frameWith('[data-testid="calculator-display"]');
  if (!calculatorFrame) throw new Error(`Calculator artifact compiled, but its rendered DOM never appeared. Page state: ${await recordPageState()}`);
  const calculatorDisplay = calculatorFrame.locator('[data-testid="calculator-display"]').first();
  if ((await calculatorDisplay.innerText()).trim() !== '0') throw new Error('Calculator rendered with the wrong initial value.');
  await calculatorFrame.locator('[data-testid="calculator-one"]').first().click();
  await calculatorFrame.locator('[data-testid="calculator-display"]').first().waitFor({ state: 'visible', timeout: 10_000 });
  const calculatorValue = (await calculatorDisplay.innerText()).trim();
  if (calculatorValue !== '1') throw new Error(`Calculator interaction failed: expected 1, received ${calculatorValue}.`);
  await recordInteraction(calculatorCorrelationId, 'calculator');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-calculator.png`, fullPage: true });
  evidence.transactions.push({
    name: 'calculator',
    correlationId: calculatorCorrelationId,
    rendered: true,
    interacted: true,
    durationMs: Date.now() - calculatorStartedAt,
  });
  delete evidence.activeTransaction;

  let websiteCorrelationId = calculatorCorrelationId;
  let toolCorrelationId = null;

  if (runs(2)) {
  const newChat = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChat, 'New Chat control is missing after the calculator transaction.', 15_000);
  await newChat.click();

  const websiteStartedAt = Date.now();
  markActiveTransaction('simple-website');
  await setGoldenTransaction('simple-website');
  await prompt.fill('Create a simple polished one-page React website for a neighborhood bakery. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. The rendered page must contain an h1 with the exact text "Sunrise Bakery" and a visible button with data-testid="website-cta" labeled "View today’s menu". Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package, and do not use asset URLs, localStorage, sessionStorage, fetch, or undeclared variables.');
  await prompt.press('Enter');
  websiteCorrelationId = await correlationForPreview(calculatorCorrelationId);
  markActiveTransaction('simple-website', websiteCorrelationId);
  const websiteFrame = await frameWith('h1');
  if (!websiteFrame) throw new Error(`Website artifact compiled, but its rendered DOM never appeared. Page state: ${await recordPageState()}`);
  const websiteHeading = await websiteFrame.locator('h1').first().innerText().catch(() => '');
  if (websiteHeading.trim() !== 'Sunrise Bakery') throw new Error(`Website rendered the wrong heading: ${websiteHeading}.`);
  const websiteCta = websiteFrame.locator('[data-testid="website-cta"]').first();
  await visible(websiteCta, 'Website CTA is missing from the rendered iframe.', 10_000);
  await websiteCta.click();
  await recordInteraction(websiteCorrelationId, 'simple-website');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-website.png`, fullPage: true });
  evidence.transactions.push({
    name: 'simple-website',
    correlationId: websiteCorrelationId,
    rendered: true,
    interacted: true,
    durationMs: Date.now() - websiteStartedAt,
  });
  delete evidence.activeTransaction;

  /*
   * TRANSACTION 3 — GUIDED INTAKE, the flow real users actually run.
   *
   * The two transactions above are specified-tool prompts that demand fenced
   * VFS output, so the platform's #1 real ask — "help me build a website for
   * my client's business" — was never a golden transaction, which is how the
   * 2026-09-01 intake contradiction (a first turn ordered to output NO code,
   * then failed for having no code) shipped and was found by a screenshot.
   *
   * The invariant asserted here is the one that is robust to model choice:
   * the turn must end in EITHER an intake question (the decision modal) OR a
   * runnable artifact — NEVER a failed turn. No goldenTransaction canary is
   * set: this is a behavioral invariant, not an artifact-shape one, and an
   * artifact canary would forbid the intake reply we are here to protect.
   * Anchored on data-quantora-* hooks only (§6).
   */
  }

  if (runs(3)) {
  const intakeStartedAt = Date.now();
  markActiveTransaction('guided-intake');
  await page.evaluate(() => sessionStorage.removeItem('quantora_golden_transaction'));
  const newChatForIntake = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChatForIntake, 'New Chat control is missing after the website transaction.', 15_000);
  await newChatForIntake.click();
  await prompt.fill('help me build a website for a client who is running a Boutique that is into specialized Indian Sarees like Kanjivaram, Uppada, Gadwal, and also selling ready made dresses for all ages. They also provide services like Blouse Stitching, Saree Draping, Pico and Fall, and Mehndi.');
  await prompt.press('Enter');

  const intakeModal = page.locator('[data-quantora-decision-modal="true"]').first();
  const failedTurn = page.locator('[data-quantora-last-turn-failed="true"]').first();
  const intakePreview = page.locator('[data-quantora-real-project-preview="true"]').first();
  let intakeOutcome = null;
  let modalAnswers = 0;
  const intakeDeadline = Date.now() + TURN_TIMEOUT_MS;
  while (Date.now() < intakeDeadline) {
    if (await failedTurn.isVisible().catch(() => false)) {
      throw new Error(
        'The guided-intake turn FAILED outright — a website ask must end in an intake question or an artifact, never a dead turn. '
        + `Page state: ${await recordPageState()}`,
      );
    }
    const previewCorrelation = await intakePreview.getAttribute('data-quantora-correlation-id').catch(() => null);
    if (previewCorrelation && previewCorrelation !== websiteCorrelationId) {
      intakeOutcome = intakeOutcome === 'intake-answered' ? 'intake-then-artifact' : 'direct-artifact';
      break;
    }
    if (await intakeModal.isVisible().catch(() => false)) {
      /*
       * Answer the designer's question and keep going. Real models may need
       * more than one round to gather the minimum brief; three answered
       * modals without a build means intake is looping, which is its own
       * failure worth seeing.
       */
      if (modalAnswers >= 3) {
        throw new Error(
          `Guided intake asked ${modalAnswers + 1} questions without ever building. `
          + `Page state: ${await recordPageState()}`,
        );
      }
      modalAnswers += 1;
      intakeOutcome = 'intake-answered';
      await page.locator('[data-quantora-decision-option]').first().click();
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(250);
  }
  if (!intakeOutcome || intakeOutcome === 'intake-answered') {
    /*
     * An intake question that rendered is the invariant HELD, even if the
     * follow-up build outran the clock — the class this transaction guards
     * is the dead first turn, not build latency. But NOTHING appearing is a
     * failure: no question, no artifact, no error is the worst outcome of
     * all, a silent stall.
     */
    if (modalAnswers === 0) {
      /*
       * WHICH of these it is decides who fixes it, so the verdict must say.
       *
       * On 2026-09-04 this branch printed "produced neither an intake question
       * nor an artifact" while the page held a perfectly good intake question:
       * "does your client want real online selling or a beautiful showcase?".
       * The desk HAD asked. It had simply not wrapped the question in a modal,
       * because the same system prompt both required one (FIRST-TURN RULE) and
       * excused it ("omit the modal if a free-text answer is better").
       *
       * A blocking gate whose only diagnosis is false costs a night (§8), and
       * three outcomes that share one sentence are one outcome as far as the
       * next reader is concerned. They are separated here by the page state
       * that is already being captured.
       */
      const state = await recordPageState();
      const snapshot = evidence.pageState || {};
      if (snapshot.modalUnreadable) {
        /*
         * WHICH REPAIR, THOUGH.
         *
         * This branch used to end "repair the reader (src/lib/assistant-modal.js)"
         * for every unreadable modal, and on 2026-09-05 that advice was wrong.
         * The parser said "Unterminated string in JSON at position 106" — the
         * modal was CUT OFF, and finishing a truncated string means inventing
         * the rest of the user's question, which assistant-modal refuses to do
         * on purpose. Sending the next reader to the reader would have cost
         * another round; it is the third time this class has been guessed at.
         *
         * A malformed-but-complete modal is the reader's problem. A truncated
         * one never reaches the reader intact and is an output problem.
         */
        const reason = snapshot.modalFailure
          || '(no reason published — the desk is not carrying data-quantora-modal-failure)';
        /*
         * WHO CUT IT, THOUGH (2026-09-05, the third round on one failure).
         * The bytes at the failure were "t confirmed Add to Cart yet." — the
         * desk's own claim-filter wording, written INTO the modal JSON in
         * place of a sentence that mentioned a control. Not the provider, not
         * transport, not the reader: the desk corrupting its own artifact.
         * The filter's wordings are recognisable from a fragment, so this is
         * decided first, before "truncated" gets to guess again.
         */
        const rewritten = claimFilterWroteThis(reason);
        const truncated = !rewritten && (/unterminated|unexpected end of (?:json|input)/i.test(reason)
          || snapshot.replyFinish === 'truncated');
        // The provider's word, when the desk carried one — this is the fact
        // the parser error was only ever a symptom of. "complete" is a fact
        // too: the model ENDED the reply itself, so whatever is missing was
        // removed on our side. Silence is a third: the done payload's finish
        // never reached the message. Each is said, none is left to be guessed.
        const provider = snapshot.replyFinish
          ? (snapshot.replyFinish === 'complete'
            ? ` The provider reported finish_reason ${snapshot.replyFinishReason || 'stop'} — the model ended this reply itself, so anything missing was removed on our side, not cut by the provider.`
            : ` The provider reported finish_reason ${snapshot.replyFinishReason || snapshot.replyFinish}.`)
          : ' The desk published NO finish state — the done payload\'s finish never reached this message (src/hooks/useChatStream.js), so the provider\'s word is unknown here.';
        throw new Error(
          'The guided-intake turn wrote a decision modal the desk could not READ, so nothing rendered. '
          + (rewritten
            ? 'The DESK REWROTE the modal: the bytes at the failure are the claim filter\'s own wording '
              + '(src/lib/desk-chat-claim-filter.js), written into the JSON in place of a sentence that mentioned a control. '
              + 'This is NOT truncation and NOT the reader — the filter must leave <quantora-modal> blocks verbatim '
              + `(claimFiltered=${snapshot.claimFiltered === true}).`
            : truncated
              ? 'The modal was TRUNCATED — the JSON ends mid-string. This is NOT a reader bug: completing it would mean '
                + 'inventing the rest of the question. Look at why the reply was cut off (token budget, stream end), '
                + 'not at src/lib/assistant-modal.js.'
              : 'The modal is malformed but complete, which IS the reader\'s problem — repair '
                + 'src/lib/assistant-modal.js, and do not reword the prompt.')
          + ` Parser said: ${reason}.${provider} `
          + `Page state: ${state}`,
        );
      }
      if ((snapshot.assistantMessages || 0) > 0 && snapshot.lastAssistantText) {
        throw new Error(
          'The guided-intake turn asked its question in PROSE and never rendered the decision modal the '
          + 'FIRST-TURN RULE requires, leaving the user to type an answer the desk could have offered. '
          + 'The turn was NOT dead — check what the assembled system prompt tells the model about omitting '
          + `the modal before blaming the model. Page state: ${state}`,
        );
      }
      throw new Error(
        `The guided-intake turn produced NOTHING within ${Math.round(TURN_TIMEOUT_MS / 1000)}s — no question, no artifact, no error. `
        + `Page state: ${state}`,
      );
    }
    intakeOutcome = 'intake-rendered';
  }
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-guided-intake.png`, fullPage: true });
  evidence.transactions.push({
    name: 'guided-intake',
    outcome: intakeOutcome,
    modalAnswers,
    durationMs: Date.now() - intakeStartedAt,
  });
  delete evidence.activeTransaction;

  /*
   * TRANSACTION 4 — A BUSINESS TOOL, WHICH IS WHAT PEOPLE ACTUALLY BUILD HERE.
   *
   * The three transactions above prove a calculator renders, a one-page site
   * renders, and intake asks before it builds. None of them is the shape of the
   * platform's real output: a working internal tool — a form with a dropdown,
   * rows that accumulate, and a number computed FROM those rows.
   *
   * That gap was found by a screenshot, again. A user shipped a consulting CRM
   * with a SOW intake form, contract-model and deal-stage selects, weighted
   * pipeline value and a bench-burn figure, and nothing in this gate covered
   * any of it. Its own Preview checks listed "Totals match their rows" — a
   * correctness property the deployed gate never asserted end to end.
   *
   * WHY THE TOTAL IS COMPARED TO THE ROWS, NOT TO A NUMBER I PREDICTED.
   *
   * Asserting "the total says 460000" would pass for a build that hardcoded
   * 460000 and never computes anything, which is the confidently-wrong class
   * this repo already has a gate for on the travel desk: reachability is not
   * correctness, and a dashboard of invented numbers renders perfectly. So the
   * total is checked against the sum of the rows in the DOM, twice — before any
   * interaction, and again after adding a deal. A hardcoded total passes the
   * first check by luck and fails the second every time.
   */
  }

  if (runs(4)) {
  const newChatForTool = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChatForTool, 'New Chat control is missing after the guided-intake transaction.', 15_000);
  await newChatForTool.click();

  const toolStartedAt = Date.now();
  markActiveTransaction('business-tool');
  await setGoldenTransaction('business-tool');
  await prompt.fill('Create a small React deal pipeline tool for an IT consulting firm. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. It must render a form with data-testid="deal-form" containing a text input data-testid="deal-name", a number input data-testid="deal-value", a select data-testid="deal-stage" offering Discovery, Proposal and Won, and a submit button data-testid="add-deal". It must render one element per deal with data-testid="deal-row", each carrying that deal\'s numeric value in a data-deal-value attribute. It must render an element data-testid="pipeline-total" showing the sum of every deal value, recomputed whenever a deal is added. Seed it with exactly two deals worth 120000 and 60000. Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package, and do not use asset URLs, localStorage, sessionStorage, fetch, or undeclared variables.');
  await prompt.press('Enter');
  toolCorrelationId = await correlationForPreview(websiteCorrelationId);
  markActiveTransaction('business-tool', toolCorrelationId);

  const toolFrame = await frameWith('[data-testid="pipeline-total"]');
  if (!toolFrame) throw new Error(`Business tool compiled, but its rendered DOM never appeared. Page state: ${await recordPageState()}`);

  /** The displayed total as a number — "$180,000" and "180000" both read 180000. */
  const readTotal = async () => {
    const text = (await toolFrame.locator('[data-testid="pipeline-total"]').first().innerText()).trim();
    const digits = text.replace(/[^0-9.-]/g, '');
    const value = Number.parseFloat(digits);
    if (!Number.isFinite(value)) throw new Error(`Pipeline total is not a number: "${text}".`);
    return value;
  };

  /** The sum the rows themselves claim, straight from the DOM. */
  const readRowSum = async () => {
    const rows = toolFrame.locator('[data-testid="deal-row"]');
    const count = await rows.count();
    let sum = 0;
    for (let index = 0; index < count; index += 1) {
      const raw = await rows.nth(index).getAttribute('data-deal-value');
      const value = Number.parseFloat(String(raw ?? '').replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(value)) throw new Error(`Deal row ${index} carries no readable data-deal-value (saw "${raw}").`);
      sum += value;
    }
    return { count, sum };
  };

  const seeded = await readRowSum();
  const seededTotal = await readTotal();

  const ADDED_DEAL_VALUE = 280000;
  await toolFrame.locator('[data-testid="deal-name"]').first().fill('HIPAA Cloud Migration');
  await toolFrame.locator('[data-testid="deal-value"]').first().fill(String(ADDED_DEAL_VALUE));
  /*
   * The select is asserted by USING it. A dropdown that renders and cannot be
   * chosen from is the dead-control class, and a business tool is mostly
   * dropdowns.
   */
  const stage = toolFrame.locator('[data-testid="deal-stage"]').first();
  await visible(stage, 'The deal form rendered without its stage select.', 10_000);
  await stage.selectOption({ label: 'Proposal' }).catch(async () => { await stage.selectOption({ index: 1 }); });
  await toolFrame.locator('[data-testid="add-deal"]').first().click();

  // Give the new row a chance to attach before judging; its absence is a
  // verdict reconcilePipeline reports by name, not a Playwright timeout.
  await toolFrame.locator('[data-testid="deal-row"]').nth(seeded.count)
    .waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});

  const after = await readRowSum();
  const afterTotal = await readTotal();

  const verdict = reconcilePipeline({
    seededRows: seeded.count,
    seededSum: seeded.sum,
    seededTotal,
    afterRows: after.count,
    afterSum: after.sum,
    afterTotal,
    addedValue: ADDED_DEAL_VALUE,
  });
  if (!verdict.ok) throw new Error(`${verdict.message} Page state: ${await recordPageState()}`);

  await recordInteraction(toolCorrelationId, 'business-tool');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-business-tool.png`, fullPage: true });
  evidence.transactions.push({
    name: 'business-tool',
    correlationId: toolCorrelationId,
    rendered: true,
    interacted: true,
    seededRows: seeded.count,
    rowsAfterAdd: after.count,
    totalMatchedRows: true,
    durationMs: Date.now() - toolStartedAt,
  });
  delete evidence.activeTransaction;

  /*
   * TRANSACTION 5 — A DOCUMENT THE USER ATTACHED, READ AND BUILT FROM.
   *
   * 2026-09-05: four association documents attached to one chat turn were
   * dropped in the browser as "(not a readable image)", and the model — told
   * nothing about files it never received — asked the user how to get them.
   * Nothing in this gate had ever attached a file.
   *
   * A PDF is generated here with a registration number that exists nowhere
   * else, attached through the composer's real file input, and the ask is a
   * page that must SHOW that number. The number can only come from the PDF,
   * so its presence in the rendered preview proves the whole path: intake,
   * request, server extraction, the model's context, the build. A reply that
   * asks for the document, or a page without the number, fails by name.
   */
  }

  if (runs(5)) {
  const newChatForDocument = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChatForDocument, 'New Chat control is missing after the business-tool transaction.', 15_000);
  await newChatForDocument.click();

  const documentStartedAt = Date.now();
  markActiveTransaction('document-grounded');
  await setGoldenTransaction('document-grounded');
  const REGISTRATION_NUMBER = `RKV-${String(Date.now()).slice(-6)}-GLD`;
  const bylawsPdf = buildMinimalPdf(bylawsFixtureText(REGISTRATION_NUMBER));
  const fileInput = page.locator('.app-shell--studio input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'rkv-bylaws.pdf', mimeType: 'application/pdf', buffer: bylawsPdf });
  const chip = page.locator('[data-quantora-attachment-chip="rkv-bylaws.pdf"]').first();
  await visible(chip, 'The composer never showed the attached PDF as a chip.', 10_000);
  const chipKind = await chip.getAttribute('data-quantora-attachment-kind');
  if (chipKind !== 'document') {
    throw new Error(`The composer took the PDF as "${chipKind}", not as a document — it would be dropped at send. Page state: ${await recordPageState()}`);
  }
  /*
   * The ask takes the same shape as calculator, simple-website and
   * business-tool, and for the same reason: setGoldenTransaction arms two
   * contracts on the turn it precedes — the server validator owes files and
   * forbids an intake move, and the desk refuses any non-empty VFS that is not
   * a React/VFS project. This transaction's first run asked for "a single-file
   * HTML page" with the canary armed; the model obeyed, and the desk failed the
   * page by construction ("did not satisfy the React/VFS project runtime
   * contract"). The two must agree, and deployed-gate-contract.test.js holds
   * every armed transaction to it. The attach → question → build handoff, where
   * the desk carries documents across turns, is proven deterministically by
   * scripts/attachments-browser-gate.mjs; this transaction proves the document
   * reaches the REAL model.
   */
  await prompt.fill('Create a small React information page for the association named in the attached bylaws PDF. Return a Vite-style VFS project with package.json, src/main.jsx, src/App.jsx, and src/styles.css in fenced code blocks with filepath attributes. Import React and react-dom from their bare package names; do not return index.html or use any CDN. It must render an h1 with the association\'s exact name as written in the document and a paragraph with data-testid="reg-no" whose text is the registration number exactly as it appears in the document. Use only React, react-dom, semantic text, and CSS. Do not import any icon, image, asset, or other third-party package, and do not use asset URLs, localStorage, sessionStorage, fetch, or undeclared variables.');
  await prompt.press('Enter');

  // The desk says so at send time, before any model turn, so it is checked first.
  await page.waitForTimeout(1_000);
  const headsUp = page.locator('[data-quantora-assistant-prose]', { hasText: /could not send/i }).first();
  if (await headsUp.isVisible().catch(() => false)) {
    throw new Error(`The desk dropped the attached PDF before sending — the 2026-09-05 defect is back. Page state: ${await recordPageState()}`);
  }

  /*
   * Say which half. A turn that asked for the document instead of building
   * means the PDF's text never reached the model, and the desk's own account
   * of what it read (data-quantora-document-reads) separates "never sent"
   * from "sent, but unreadable".
   */
  const documentDiagnosis = async (why) => {
    const state = /Page state:/.test(why) ? '' : ` Page state: ${await recordPageState()}`;
    const snapshot = evidence.pageState || {};
    // A request for the file, not a mention of it: a build reply that says
    // "based on the attached document" must not read as the model asking.
    const asked = /\b(?:attach|upload|send|share|paste|provide)\b[^.]{0,60}\b(?:document|file|pdf|bylaws)\b|\b(?:document|file|pdf|attachment)\b[^.]{0,40}\b(?:didn't|did not|never|hasn't|has not)\b[^.]{0,30}\b(?:come through|arrive|receive|reach|attach)|\bcould(?:n't| not) (?:find|see|read|access|open)\b[^.]{0,40}\b(?:document|file|pdf|attachment)\b/i
      .test(String(snapshot.lastAssistantText || ''));
    return (asked
      ? 'The model asked for the document instead of building from it — the attached PDF\'s text did not reach the model. '
      : '')
      + `Document reads published by the desk: ${JSON.stringify(snapshot.documentReads ?? null)}. ${why}${state}`;
  };
  let documentCorrelationId;
  try {
    documentCorrelationId = await correlationForPreview(toolCorrelationId);
  } catch (error) {
    throw new Error(await documentDiagnosis(error?.message || String(error)));
  }
  markActiveTransaction('document-grounded', documentCorrelationId);

  const documentFrame = await frameWith('[data-testid="reg-no"]');
  if (!documentFrame) {
    throw new Error(await documentDiagnosis('The document-grounded page compiled but never rendered its data-testid="reg-no" element.'));
  }
  const shown = (await documentFrame.locator('[data-testid="reg-no"]').first().innerText()).trim();
  if (!shown.includes(REGISTRATION_NUMBER)) {
    throw new Error(
      `The page rendered but its registration number is "${shown}", not the ${REGISTRATION_NUMBER} that exists only in the attached PDF — `
      + (REGISTRATION_NUMBER.startsWith(shown) && shown.length >= 4
        ? 'a prefix of it: the document reached the model cut short (2026-09-06: pdf.js returns nothing past the page edge, and the fixture wrote one line off it). '
        : 'the model built without reading the document. ')
      + `Page state: ${await recordPageState()}`,
    );
  }
  await recordInteraction(documentCorrelationId, 'document-grounded');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-document-grounded.png`, fullPage: true });
  evidence.transactions.push({
    name: 'document-grounded',
    correlationId: documentCorrelationId,
    rendered: true,
    groundedFact: true,
    registrationNumber: REGISTRATION_NUMBER,
    durationMs: Date.now() - documentStartedAt,
  });
  delete evidence.activeTransaction;
  }

  /*
   * TRANSACTION 6 — THE BRIEF PEOPLE ACTUALLY SEND, WITH THE DOCUMENTS THEY ATTACH.
   *
   * 2026-09-06: a founder attached an association's documents and asked for a
   * website in plain words. The desk read "excel-like" in the brief and sent
   * the whole thing to the workbook generator, which ran out of host time, and
   * the person read "Failed to generate document" for a website ask. Every
   * transaction above is a specified-tool prompt; none of them is this brief.
   * This one is: two attached PDFs, a natural ask that mentions a spreadsheet
   * as a LOOK, no canary armed. It must end in a site that shows facts that
   * exist only in the documents — the registration number from one PDF, the
   * event from the other — with an intake question or two allowed on the way,
   * and never an Office file. The Office generator is watched at the wire, so
   * the 2026-09-06 defect fails by its own name and not as a missing page.
   */
  if (runs(6)) {
  const newChatForBrief = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChatForBrief, 'New Chat control is missing after the document-grounded transaction.', 15_000);
  await newChatForBrief.click();

  const briefStartedAt = Date.now();
  markActiveTransaction('brief-with-documents');
  await page.evaluate(() => sessionStorage.removeItem('quantora_golden_transaction'));
  const BRIEF_REGISTRATION = `RKV-${String(Date.now()).slice(-6)}-BRF`;
  const BRIEF_EVENT_CODE = `GH-${String(Date.now()).slice(-5)}`;
  const BRIEF_EVENT_NAME = 'Golden Harvest Fair';
  const briefFileInput = page.locator('.app-shell--studio input[type="file"]').first();
  await briefFileInput.setInputFiles([
    { name: 'association-bylaws.pdf', mimeType: 'application/pdf', buffer: buildMinimalPdf(bylawsFixtureText(BRIEF_REGISTRATION)) },
    { name: 'event-calendar.pdf', mimeType: 'application/pdf', buffer: buildMinimalPdf(eventCalendarFixtureText(BRIEF_EVENT_CODE)) },
  ]);
  for (const fileName of ['association-bylaws.pdf', 'event-calendar.pdf']) {
    const briefChip = page.locator(`[data-quantora-attachment-chip="${fileName}"]`).first();
    await visible(briefChip, `The composer never showed ${fileName} as a chip.`, 10_000);
    const chipKind = await briefChip.getAttribute('data-quantora-attachment-kind');
    if (chipKind !== 'document') {
      throw new Error(`The composer took ${fileName} as "${chipKind}", not as a document — it would be dropped at send. Page state: ${await recordPageState()}`);
    }
  }
  let officeGenerationRequested = false;
  const officeWatch = (request) => { if (/\/api\/generate-office\b/.test(request.url())) officeGenerationRequested = true; };
  page.on('request', officeWatch);
  await prompt.fill('Build a website for the association described in the attached documents. The home page must show the association\'s name and its registration number exactly as written in the bylaws, and an Events section that lists every event from the attached calendar by its exact name and event code. Lay the members section out like an Excel tracker with columns for name, flat number and dues status. Keep it simple, clean and mobile friendly.');
  await prompt.press('Enter');
  await page.waitForTimeout(1_000);
  const briefHeadsUp = page.locator('[data-quantora-assistant-prose]', { hasText: /could not send/i }).first();
  if (await briefHeadsUp.isVisible().catch(() => false)) {
    throw new Error(`The desk dropped an attached PDF before sending — the 2026-09-05 defect is back. Page state: ${await recordPageState()}`);
  }

  /**
   * The first rendered frame — never the desk's own, whose transcript may
   * quote the documents back — whose text carries every fact, or null.
   */
  const frameShowing = async (facts) => {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const text = await frame.locator('body').innerText({ timeout: 2_000 }).catch(() => '');
      if (facts.every((fact) => text.includes(fact))) return frame;
    }
    return null;
  };
  const BRIEF_FACTS = [BRIEF_REGISTRATION, BRIEF_EVENT_NAME, BRIEF_EVENT_CODE];
  const briefModal = page.locator('[data-quantora-decision-modal="true"]').first();
  const briefFailed = page.locator('[data-quantora-last-turn-failed="true"]').first();
  const briefPreview = page.locator('[data-quantora-real-project-preview="true"]').first();
  let briefFrame = null;
  let briefModalAnswers = 0;
  // Two turns' worth of clock: an intake question may precede the build.
  const briefDeadline = Date.now() + TURN_TIMEOUT_MS * 2;
  while (Date.now() < briefDeadline) {
    if (officeGenerationRequested) {
      throw new Error(
        'The website brief was sent to the OFFICE GENERATOR — the desk read "Excel" in a website ask and chose a '
        + `workbook over the site (the 2026-09-06 defect). Page state: ${await recordPageState()}`,
      );
    }
    if (await briefFailed.isVisible().catch(() => false)) {
      throw new Error(
        'The brief-with-documents turn FAILED outright — a website ask with documents must end in a question or a site, '
        + `never a dead turn. Page state: ${await recordPageState()}`,
      );
    }
    briefFrame = await frameShowing(BRIEF_FACTS);
    if (briefFrame) break;
    if (await briefModal.isVisible().catch(() => false)) {
      if (briefModalAnswers >= 3) {
        throw new Error(`The desk asked ${briefModalAnswers + 1} questions about the brief without ever building. Page state: ${await recordPageState()}`);
      }
      briefModalAnswers += 1;
      await page.locator('[data-quantora-decision-option]').first().click();
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(500);
  }
  page.off('request', officeWatch);
  if (!briefFrame) {
    /*
     * WHICH fact is missing decides who fixes it: the number is in one PDF and
     * the event in the other, so a page with one and not the other read one
     * document and dropped the second; a page with neither built without
     * reading; no page at all is the turn.
     */
    const withNumber = Boolean(await frameShowing([BRIEF_REGISTRATION]));
    const withEvent = Boolean(await frameShowing([BRIEF_EVENT_NAME, BRIEF_EVENT_CODE]));
    const state = await recordPageState();
    const snapshot = evidence.pageState || {};
    throw new Error(
      (withNumber && !withEvent
        ? `The site shows the registration number but not the event ${BRIEF_EVENT_NAME} ${BRIEF_EVENT_CODE} — the second attached PDF did not reach the build. `
        : !withNumber && withEvent
          ? `The site shows the event but not the registration number ${BRIEF_REGISTRATION} — the first attached PDF did not reach the build. `
          : snapshot.previewMounted
            ? `A site rendered but shows neither ${BRIEF_REGISTRATION} nor ${BRIEF_EVENT_NAME} ${BRIEF_EVENT_CODE} — the model built without reading the documents. `
            : `No site rendered within ${Math.round((TURN_TIMEOUT_MS * 2) / 1000)}s (${briefModalAnswers} intake question(s) answered). `)
      + `Document reads published by the desk: ${JSON.stringify(snapshot.documentReads ?? null)}. Page state: ${state}`,
    );
  }
  const briefCorrelationId = await briefPreview.getAttribute('data-quantora-correlation-id').catch(() => null);
  markActiveTransaction('brief-with-documents', briefCorrelationId);
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-brief-with-documents.png`, fullPage: true });
  evidence.transactions.push({
    name: 'brief-with-documents',
    correlationId: briefCorrelationId,
    rendered: true,
    groundedFacts: BRIEF_FACTS.length,
    modalAnswers: briefModalAnswers,
    officeGenerationRequested,
    durationMs: Date.now() - briefStartedAt,
  });
  delete evidence.activeTransaction;

  /*
   * TRANSACTION 7 — THE SECOND TURN, WHICH IS WHERE PEOPLE ACTUALLY LIVE.
   *
   * Nothing deployed had ever sent a follow-up into a built site. The whole
   * point of a desk is the second ask — change this, add that — and the
   * classes that break it are invisible on a first turn: the build session
   * not recognised, the edit rebuilt from scratch, the preview not
   * re-rendered. One edit, one exact fact to find afterwards. The heading is
   * looked for in the rendered site itself, whether the desk re-rendered
   * under a new correlation id or patched the running preview in place.
   */
  }

  if (runs(7)) {
  const iterateStartedAt = Date.now();
  markActiveTransaction('iterate-heading');
  const NEW_HEADING = `Golden Harvest Community Portal ${String(Date.now()).slice(-4)}`;
  await prompt.fill(`Change the main heading at the top of the home page to read exactly: ${NEW_HEADING}. Keep everything else exactly as it is.`);
  await prompt.press('Enter');
  /** Every h1 and h2 in every rendered frame but the desk's own. */
  const headingsShown = async () => {
    const seen = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      seen.push(...(await frame.locator('h1, h2').allInnerTexts().catch(() => [])));
    }
    return seen.map((text) => text.trim());
  };
  const iterateFailed = page.locator('[data-quantora-last-turn-failed="true"]').first();
  // Two attempts' worth of clock: a fileless edit reply is retried once (2026-09-06).
  const iterateDeadline = Date.now() + TURN_TIMEOUT_MS * 2;
  let headingFound = false;
  while (Date.now() < iterateDeadline) {
    if (await iterateFailed.isVisible().catch(() => false)) {
      throw new Error(`The follow-up edit turn FAILED before the site changed. Page state: ${await recordPageState()}`);
    }
    if ((await headingsShown()).includes(NEW_HEADING)) { headingFound = true; break; }
    await page.waitForTimeout(500);
  }
  if (!headingFound) {
    /*
     * WHICH half: the first run of this transaction (2026-09-06) found the
     * model DESCRIBING the edit — "I've updated the main heading…" — and
     * returning no files, and the desk closing the turn as done on the files
     * from the turn before. A claim without a changed site is that class by
     * name; a site that changed to the wrong heading is the model's.
     */
    const state = await recordPageState();
    const snapshot = evidence.pageState || {};
    const claimed = /\b(?:updated|changed|replaced|renamed|set)\b/i.test(String(snapshot.lastAssistantText || ''));
    throw new Error(
      `The follow-up edit did not land: no heading reads "${NEW_HEADING}" after ${Math.round((TURN_TIMEOUT_MS * 2) / 1000)}s; `
      + `headings seen: ${JSON.stringify((await headingsShown()).slice(0, 6))}. `
      + (claimed
        ? 'The reply CLAIMS the change was made while the site shows the old heading — a fileless edit reply accepted as done (src/lib/desk-edit-proof.js closes this class). '
        : '')
      + `Page state: ${state}`,
    );
  }
  const iterateCorrelationId = await page.locator('[data-quantora-real-project-preview="true"]').first()
    .getAttribute('data-quantora-correlation-id').catch(() => null);
  markActiveTransaction('iterate-heading', iterateCorrelationId);
  if (iterateCorrelationId) await recordInteraction(iterateCorrelationId, 'iterate-heading');
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-iterate-heading.png`, fullPage: true });
  evidence.transactions.push({
    name: 'iterate-heading',
    correlationId: iterateCorrelationId,
    rendered: true,
    headingChanged: true,
    durationMs: Date.now() - iterateStartedAt,
  });
  delete evidence.activeTransaction;

  /*
   * TRANSACTION 8 — AN OFFICE FILE, OPENED.
   *
   * "No gate has asked for a deck and opened the file it got" was the ledger's
   * own note on the Office journey. The generator's failure of 2026-09-06 —
   * the host clock running out behind "Failed to generate document" — was on
   * a turn that should never have reached it, but the path itself had never
   * been proven in production either. A one-page Word document is asked for
   * with the briefing skipped, the card's Download is clicked, and the file
   * the browser received is opened: word/document.xml must carry the title.
   */
  }

  if (runs(8)) {
  const newChatForOffice = page.getByRole('button', { name: /New Chat/i }).first();
  await visible(newChatForOffice, 'New Chat control is missing after the iterate-heading transaction.', 15_000);
  await newChatForOffice.click();

  const officeStartedAt = Date.now();
  markActiveTransaction('office-document');
  const OFFICE_TITLE = `Golden Canary Brief GC-${String(Date.now()).slice(-6)}`;
  await prompt.fill(`Create a one-page Word document titled exactly "${OFFICE_TITLE}" with two short paragraphs introducing a neighbourhood bakery. Generate the file now; do not ask me any questions first.`);
  await prompt.press('Enter');
  const officeCard = page.locator('[data-quantora-office-card="true"]').last();
  const officeModal = page.locator('[data-quantora-decision-modal="true"]').first();
  const officeFailed = page.locator('[data-quantora-last-turn-failed="true"]').first();
  let officeModalAnswers = 0;
  let officeReady = false;
  // A briefing round may precede generation, and generation has its own clock.
  const officeDeadline = Date.now() + TURN_TIMEOUT_MS * 2;
  while (Date.now() < officeDeadline) {
    if (await officeFailed.isVisible().catch(() => false)) {
      const state = await recordPageState();
      const snapshot = evidence.pageState || {};
      // The generator's own account first — path, status, stage, and the
      // providers it asked or refused to ask — then the desk's sentence: "ran
      // out of host time" and "Please sign in" are different defects, and
      // between them the two name which.
      const generatorAnswer = describeApiFailure(lastApiFailure('/api/generate-office', 'office-document'));
      throw new Error(`The Office turn FAILED. ${generatorAnswer ? `${generatorAnswer}. ` : ''}Desk showed: ${String(snapshot.lastAssistantText || '').replace(/\s+/g, ' ').slice(0, 220)}. Page state: ${state}`);
    }
    if (await officeCard.isVisible().catch(() => false)) { officeReady = true; break; }
    if (await officeModal.isVisible().catch(() => false)) {
      if (officeModalAnswers >= 3) {
        throw new Error(`The Office briefing asked ${officeModalAnswers + 1} questions without ever generating. Page state: ${await recordPageState()}`);
      }
      officeModalAnswers += 1;
      await page.locator('[data-quantora-decision-option]').first().click();
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForTimeout(500);
  }
  if (!officeReady) {
    throw new Error(`No Office card appeared within ${Math.round((TURN_TIMEOUT_MS * 2) / 1000)}s (${officeModalAnswers} briefing answer(s)). Page state: ${await recordPageState()}`);
  }
  const officeKind = await officeCard.getAttribute('data-quantora-office-kind');
  if (officeKind !== 'word') {
    throw new Error(`The desk generated a "${officeKind || 'unknown'}" file for a Word ask. Page state: ${await recordPageState()}`);
  }
  const downloadEvent = page.waitForEvent('download', { timeout: 30_000 });
  await officeCard.locator('[data-quantora-office-download="true"]').first().click();
  const download = await downloadEvent;
  const downloadedPath = `${ARTIFACT_DIR}/deployed-golden-office-document.docx`;
  await download.saveAs(downloadedPath);
  const docxBytes = readFileSync(downloadedPath);
  // The words wherever the writer put them: <w:t> runs in document.xml, or
  // the HTML altChunk part the platform's writer defers to. The first run
  // read document.xml alone and found "" on a file Word opens with the title.
  const wordFile = wordDocumentWords(docxBytes);
  if (wordFile === null) {
    throw new Error(`The downloaded file (${download.suggestedFilename()}, ${docxBytes.length} bytes) is not a Word document: it has no word/document.xml.`);
  }
  // Runs may split a title, and a style may case it: compare the words alone.
  const squash = (value) => String(value).replace(/\s+/g, '').toLowerCase();
  if (!squash(wordFile.words).includes(squash(OFFICE_TITLE))) {
    const partsRead = wordFile.parts.map((part) => `${part.name} (${part.missing ? 'missing' : `${part.words.split(/\s+/).filter(Boolean).length} words`})`).join(', ');
    throw new Error(`The Word document opened but does not carry the title "${OFFICE_TITLE}". Parts read: ${partsRead}. Its text begins: ${wordFile.words.slice(0, 160)}`);
  }
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-office-document.png`, fullPage: true });
  evidence.transactions.push({
    name: 'office-document',
    fileName: download.suggestedFilename(),
    bytes: docxBytes.length,
    opened: true,
    titleFound: true,
    modalAnswers: officeModalAnswers,
    durationMs: Date.now() - officeStartedAt,
  });
  delete evidence.activeTransaction;
  }

  /*
   * Thrown, not warned, and thrown INSIDE the try so it is reported by the same
   * verdict machinery as any other failure. A run that quietly covers less than
   * it PLANNED is a worse outcome than a run that fails — and the plan itself
   * is printed above and carried in the evidence, so a two-transaction pull
   * request run can never read as a five-transaction production one.
   */
  const ran = evidence.transactions.map((entry) => entry.name);
  const missing = PLANNED_TRANSACTIONS.filter((name) => !ran.includes(name));
  if (missing.length) {
    throw new Error(
      `The golden reported success while ${missing.length} planned transaction(s) never ran: ${missing.join(', ')}. `
      + `Planned: ${PLANNED_TRANSACTIONS.join(', ')}. Completed: ${ran.join(', ') || 'none'}. A suite that silently covers less than it claims is worse than a red one.`,
    );
  }

  // A rendered page is not a successful handover if its durable writes failed.
  const rejectedCodingWrites = rejectedCodingWriteCount;
  if (rejectedCodingWrites) {
    throw new Error(`Coding artifact persistence rejected ${rejectedCodingWrites} request(s): /api/qir-runs HTTP 400`);
  }
  const failedOwnerWrites = failedOwnerWriteCount;
  if (failedOwnerWrites) {
    throw new Error(`Project/checkpoint persistence failed: ${failedOwnerWrites} unsuccessful save request(s)`);
  }

  evidence.completedAt = new Date().toISOString();
  evidence.consoleErrors = consoleErrors.slice(0, 20);
  writeFileSync(`${ARTIFACT_DIR}/deployed-golden-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...evidence }));

  /*
   * The same last line a failure gets. "Which transactions actually ran?" was
   * unanswerable from a green log, and that question is the whole reason to
   * trust a green log at all.
   */
  const passedVerdict = `GOLDEN VERDICT | all ${ran.length} transactions passed | `
    + evidence.transactions
      .map((entry) => `${entry.name}(${Math.round((entry.durationMs || 0) / 1000)}s)`)
      .join(' ');
  console.log(`\n${passedVerdict}`);
  try {
    writeFileSync(`${ARTIFACT_DIR}/golden-verdict.txt`, `${passedVerdict}\n`);
  } catch { /* the console line above is still the primary record */ }
} catch (error) {
  evidence.failedAt = new Date().toISOString();
  evidence.error = error?.message || String(error);
  evidence.consoleErrors = consoleErrors.slice(0, 20);
  writeFileSync(`${ARTIFACT_DIR}/deployed-golden-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/deployed-golden-failure.png`, fullPage: true }).catch(() => {});
  console.error('Deployed golden transactions FAILED:', error?.stack || error);
  // Whoever reads a failed run has the log; they may not have the artifact.
  console.error('Deployed golden evidence:', JSON.stringify(evidence, null, 2));
  /*
   * THE LAST LINE, AND THE SHORTEST ONE.
   *
   * The dump above is thousands of characters wide: a single console error can
   * carry an entire base64 font, and one CSP violation about a data: URI dwarfs
   * everything else in the run. Reading this failure over the GitHub log API
   * cost several attempts per diagnosis, every attempt landing in the middle of
   * that blob instead of on the sentence that matters.
   *
   * So the verdict is repeated here, last, in one line and bounded. Rule 8 in
   * its plainest form: a diagnosis nobody can find is not a diagnosis.
   */
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').slice(0, 300);
  const done = evidence.transactions.map((entry) => entry.name).join(', ') || 'none';
  /*
   * The decisive fields FIRST. The previous order led with the URL and the
   * model's prose, so the 300-character bound spent itself on context and cut
   * off at "previewMou" — the exact field being looked for.
   */
  const state = evidence.pageState || {};
  // The last failed API answer of the failed transaction — path, status and
  // the server's stage. The console said "502 ()" and no more.
  const failedApi = lastApiFailure('/api/', evidence.activeTransaction?.name || null);
  const digest = [
    `preview=${state.previewMounted ? 'mounted' : 'absent'}`,
    state.previewCompiling ? 'compiling' : null,
    state.previewError ? `previewError=${oneLine(state.previewError).slice(0, 80)}` : null,
    state.lastTurnFailed ? 'lastTurnFailed' : null,
    typeof state.buildJobs === 'number' ? `buildJobs=${state.buildJobs}` : null,
    state.previewCorrelationId ? `previewCid=${state.previewCorrelationId}` : null,
    state.storageFault ? `storageFault` : null,
    failedApi ? `api=${failedApi.status} ${failedApi.path}${failedApi.stage ? `@${failedApi.stage}` : ''}` : null,
    engineDigest,
  ].filter(Boolean).join(' ');
  const verdict = `GOLDEN VERDICT | failed at: ${evidence.activeTransaction?.name || 'unknown'}`
    + ` | completed: ${done}`
    + (digest ? ` | state: ${digest}` : '')
    + ` | why: ${oneLine(error?.message || error).slice(0, 240)}`;
  console.error(`\n${verdict}`);
  /*
   * AND WRITTEN OUT, because printing it here was not enough.
   *
   * The first attempt at this only shortened the line. It still sat above the
   * shop-preview gate, the artifact upload and the outcome step — roughly forty
   * lines of tail — so reading it over the log API still took several fetches
   * that each landed past it. Shorter is not the same as findable (rule 8).
   *
   * The workflow's final step cats this file, so the verdict is the LAST thing
   * in the job log rather than merely a small thing in the middle of it.
   */
  try {
    writeFileSync(`${ARTIFACT_DIR}/golden-verdict.txt`, `${verdict}\n`);
  } catch { /* the console line above is still the primary record */ }
  process.exitCode = 1;
} finally {
  await browser.close();
}
