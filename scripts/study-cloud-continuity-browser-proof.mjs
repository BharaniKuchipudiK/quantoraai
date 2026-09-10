import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

// Two independent browser stores, actual Study controls and controlled API replies.
// This exercises cloud UI integration, not paid generation or production learner writes.
const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const VERSION = 'study-continuity-cloud-v1';
const MISSION = '[data-quantora-study-adaptive-mission="guided_practice"]';
const PREFIX = 'quantora:study-continuity:v2:';
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/e2e', { recursive: true });

async function scenario(mobile) {
  const records = new Map();
  let revisionNumber = 0;
  const revision = () => `11111111-1111-4111-8111-${String(++revisionNumber).padStart(12, '0')}`;
  const contexts = [];
  async function device(name) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
      hasTouch: mobile, reducedMotion: 'reduce', colorScheme: mobile ? 'light' : 'dark' });
    contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const state = { account: 'cloud-student@quantora.test', calls: 0, assessments: 0, page, context, name };
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      const origin = new URL(BASE_URL).origin;
      await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin !== origin) return route.continue();
        const response = await route.fetch({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass }, maxRedirects: 0 });
        return route.fulfill({ response });
      });
    }
    await page.addInitScript(() => localStorage.setItem('quantora_hide_welcome', 'true'));
    await page.route('**/api/**', async (route) => {
      const req = route.request(); const path = new URL(req.url()).pathname;
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { sub: state.account, email: state.account, name: 'Cloud Student', isAdmin: false } } });
      if (path === '/api/models') return route.fulfill({ json: { models: [{ id: 'synthetic-study', name: 'Synthetic Study', provider: 'Synthetic', available: true }] } });
      if (path === '/api/chat') {
        state.calls++;
        return route.fulfill({ contentType: 'text/event-stream', body: [
          `data: ${JSON.stringify({ text: 'A motion graph connects displacement and time. Its slope represents velocity. What does a steeper slope tell you?' })}`,
          `data: ${JSON.stringify({ provider: 'Synthetic cloud proof', modelId: 'synthetic-study', liveConnected: true })}`,
          'data: [DONE]', '',
        ].join('\n\n') });
      }
      if (path === '/api/study-assessment') { state.assessments++; return route.fulfill({ status: 503, json: { error: 'No assessment may be auto-issued in this proof.' } }); }
      if (path === '/api/study-learning-compass') {
        const body = req.postDataJSON();
        if (body.action === 'continuity-summary') return route.fulfill({ json: {
          version: 'study-return-context-v1', asOf: new Date().toISOString(), coverage: 'partial', observedConcepts: 1,
          unresolvedMisconceptions: [], recentMastery: [], retentionDue: [{ conceptId: 'fixture-concept', label: 'Motion graphs', recommendedActionType: 'retention_probe' }],
        } });
        if (body.action === 'continuity-list') return route.fulfill({ json: { version: VERSION,
          checkpoints: [...records.entries()].filter(([key, row]) => key.startsWith(`${state.account}|`) && row.checkpoint?.label === body.topic).map(([, row]) => row.checkpoint).slice(0, 12),
        } });
        if (body.action?.startsWith('continuity-')) {
          if (body.accountKey !== state.account) return route.fulfill({ status: 401, json: {} });
          const key = `${state.account}|${body.sessionId}`; const row = records.get(key);
          if (body.action === 'continuity-read') return route.fulfill({ json: { version: VERSION, revision: row?.revision || null, checkpoint: row?.checkpoint || null, cleared: Boolean(row && !row.checkpoint) } });
          if ((row?.revision || null) !== body.revision) return route.fulfill({ status: 409, json: {} });
          const next = { revision: revision(), checkpoint: body.action === 'continuity-clear' ? null : body.checkpoint };
          records.set(key, next);
          return route.fulfill({ json: { version: VERSION, ...next, cleared: next.checkpoint === null } });
        }
        return route.fulfill({ json: { status: 'ok', recommendations: [] } });
      }
      return route.fulfill({ json: { projects: [], sessions: [], ok: true } });
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await page.locator('[data-quantora-advisor="education"]').first().click();
    await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const input = page.locator('.app-shell--studio textarea').first();
    await input.fill('Teach me motion graphs'); await input.press('Enter');
    await page.locator('[data-quantora-study-board="true"]').waitFor({ state: 'visible' });
    return state;
  }
  async function waitForServer(predicate) {
    const end = Date.now() + 10000;
    while (!predicate() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(predicate(), 'Cloud fixture never received the actual UI checkpoint.');
  }
  async function compass(page) {
    await page.locator('[data-quantora-study-hub-launcher="true"] .study-h1-hub__launcher').click();
    await page.getByRole('button', { name: 'Where next?', exact: true }).click();
    const history = page.locator('[data-quantora-study-return-context="ready"]');
    await history.waitFor({ state: 'visible' }); await history.locator('summary').click();
    await history.getByText(/Partial history/).waitFor({ state: 'visible' });
    await history.getByText('Retention checks due: 1', { exact: true }).waitFor({ state: 'visible' });
    return history;
  }
  try {
    const a = await device('original');
    assert.equal(await a.page.evaluate((prefix) => Object.keys(localStorage).some((key) => key.startsWith(prefix)), PREFIX), false);
    const handled = await a.page.evaluate(() => {
      const detail = { source: 'guided_chip', handled: false, item: { label: 'Let’s work through it together' } };
      window.dispatchEvent(new CustomEvent('quantora:study-adaptive-mission-request', { detail })); return detail.handled;
    });
    assert.equal(handled, true); await a.page.locator(MISSION).waitFor({ state: 'visible' });
    await waitForServer(() => [...records.values()].some((row) => row.checkpoint?.phase === 'guided_practice'));
    const [sourceKey, sourceRow] = [...records.entries()].find(([, row]) => row.checkpoint);
    const b = await device('second');
    assert.equal(await b.page.evaluate((prefix) => Object.keys(localStorage).some((key) => key.startsWith(prefix)), PREFIX), false, 'The new device must not inherit a local checkpoint.');
    const before = b.calls;
    let history = await compass(b.page);
    const savedButton = history.locator('[data-quantora-study-cloud-resume="true"]');
    await savedButton.waitFor({ state: 'visible' });
    // A concurrent discard after list-read must be rechecked on the actual click.
    records.set(sourceKey, { revision: revision(), checkpoint: null });
    await savedButton.click();
    await history.getByText(/saved position changed/i).waitFor({ state: 'visible' });
    assert.equal(await b.page.locator(MISSION).count(), 0);
    assert.equal(b.calls, before); assert.equal(b.assessments, 0);
    records.set(sourceKey, { revision: revision(), checkpoint: sourceRow.checkpoint });
    await savedButton.click();
    await b.page.locator(MISSION).waitFor({ state: 'visible' });
    await b.page.getByRole('dialog', { name: 'Study AI', exact: true }).getByRole('button', { name: 'Close Study AI', exact: true }).click();
    assert.equal(b.calls, before, 'Cloud Resume must not generate a model turn.');
    assert.equal(b.assessments, 0, 'Cloud Resume must not start an assessment.');
    assert.equal(await b.page.locator('[data-quantora-study-verified-result]').count(), 0);
    await waitForServer(() => [...records.values()].filter((row) => row.checkpoint).length === 2);
    const targetEntry = [...records.entries()].find(([key]) => key !== sourceKey);
    assert.notEqual(targetEntry[1].checkpoint.sessionId, sourceRow.checkpoint.sessionId, 'Resume must bind to the current new chat.');
    const bounds = await b.page.locator('[data-quantora-study-session-resume="restored"]').boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= b.page.viewportSize().width + 1);
    await b.page.screenshot({ path: `artifacts/e2e/study-cloud-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    await b.page.waitForTimeout(1000);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    const discard = b.page.locator('[data-quantora-study-resume-action="discard"]');
    await discard.waitFor({ state: 'visible' }); await discard.click();
    await waitForServer(() => records.get(targetEntry[0])?.checkpoint === null);
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await b.page.locator('[data-quantora-study-board="true"]').waitFor({ state: 'visible' });
    await b.page.waitForTimeout(250);
    assert.equal(await b.page.locator('[data-quantora-study-session-resume="available"]').count(), 0);
    b.account = 'other-cloud-student@quantora.test';
    await b.page.reload({ waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(b.page);
    // Account switching correctly clears the previous user's active workspace.
    // Assert that boundary, then enter the same topic as the new account itself.
    assert.equal(await b.page.locator(MISSION).count(), 0);
    assert.equal(await b.page.locator('[data-quantora-study-session-resume="available"]').count(), 0);
    assert.ok(records.get(sourceKey)?.checkpoint, 'The other account must still have a cloud lesson to isolate.');
    if (mobile) await b.page.setViewportSize({ width: 1440, height: 1000 });
    await b.page.locator('[data-quantora-advisor="education"]').first().click();
    await b.page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');
    if (mobile) await b.page.setViewportSize({ width: 390, height: 844 });
    const newAccountCalls = b.calls;
    const newAccountInput = b.page.locator('.app-shell--studio textarea').first();
    await newAccountInput.fill('Teach me motion graphs'); await newAccountInput.press('Enter');
    await b.page.locator('[data-quantora-study-board="true"]').waitFor({ state: 'visible' });
    history = await compass(b.page);
    assert.equal(await history.locator('[data-quantora-study-cloud-resume="true"]').count(), 0);
    assert.equal(b.calls, newAccountCalls + 1, 'Only the new account’s explicit lesson request may call the model.');
    assert.equal(b.assessments, 0);
    console.log(`Study cloud continuity passed: ${mobile ? 'mobile' : 'desktop'} — independent browser + new chat, fresh pre-resume check, discard tombstone, account isolation, partial history, zero automatic model/assessment calls.`);
  } catch (error) {
    for (const context of contexts) for (const page of context.pages()) await page.screenshot({ path: `artifacts/e2e/study-cloud-${mobile ? 'mobile' : 'desktop'}-${contexts.indexOf(context)}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { for (const context of contexts) await context.close(); }
}
try { await scenario(false); await scenario(true); } finally { await browser.close(); }
