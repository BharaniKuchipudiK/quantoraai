import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

// Actual built Study workspace and browser storage; every API reply is a fixture.
// No paid model generation, durable assessment writes, or injected checkpoint
// is used to prove ordinary save/reload/resume. Tampering is a separate negative.
const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const PREFIX = 'quantora:study-continuity:v2:';
const AVAILABLE = '[data-quantora-study-session-resume="available"]';
const MISSION = '[data-quantora-study-adaptive-mission]';
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/e2e', { recursive: true });

async function scenario(mobile) {
  const name = mobile ? 'mobile-light-reduced' : 'desktop-dark';
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, hasTouch: mobile,
    reducedMotion: 'reduce', colorScheme: mobile ? 'light' : 'dark',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  let chatCalls = 0;
  const issues = [];
  let account = 'continuity-student@quantora.test';
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    const origin = new URL(BASE_URL).origin;
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== origin) return route.continue();
      const response = await route.fetch({
        headers: { ...route.request().headers(), 'x-vercel-protection-bypass': bypass }, maxRedirects: 0,
      });
      return route.fulfill({ response });
    });
  }
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('quantora_hide_welcome', 'true');
    localStorage.setItem('quantora_theme_mode', theme);
  }, { theme: mobile ? 'light' : 'dark' });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: {
      sub: account, name: 'Continuity Student', email: account, picture: null, isAdmin: false,
    } } });
    if (path === '/api/models') return route.fulfill({ json: { models: [
      { id: 'synthetic-study', name: 'Synthetic Study', provider: 'Synthetic', available: true },
    ] } });
    if (path === '/api/chat') {
      chatCalls += 1;
      return route.fulfill({ contentType: 'text/event-stream', body: [
        `data: ${JSON.stringify({ text: 'A motion graph connects displacement and time. Its slope represents velocity. What would a steeper slope tell you?' })}`,
        `data: ${JSON.stringify({ provider: 'Synthetic continuity proof', modelId: 'synthetic-study', liveConnected: true })}`,
        'data: [DONE]', '',
      ].join('\n\n') });
    }
    if (path === '/api/study-assessment') {
      const body = route.request().postDataJSON();
      assert.equal(body.action, 'issue', 'The recovery proof must never submit a grade.');
      issues.push(body);
      return route.fulfill({ status: 201, json: {
        attemptId: '22222222-2222-4222-8222-222222222222',
        item: { itemKey: 'continuity-fresh-check', itemVersion: '1', conceptKey: 'physics.kinematics.motion-graphs',
          prompt: 'Fresh reviewed check: what does the slope represent?',
          options: [{ id: 'a', text: 'Velocity' }, { id: 'b', text: 'Time' }], responseFormat: 'single_correct' },
      } });
    }
    return route.fulfill({ json: { projects: [], sessions: [], ok: true } });
  });
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await enterSignedInStudio(page);
    await page.locator('[data-quantora-advisor="education"]').first().click();
    await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const input = page.locator('.app-shell--studio textarea').first();
    await input.fill('Teach me motion graphs');
    await input.press('Enter');
    await page.locator('[data-quantora-study-lesson="true"]').first().waitFor({ state: 'visible' });
    await page.locator('[data-quantora-study-board="true"]').waitFor({ state: 'visible' });
    const handled = await page.evaluate(() => {
      const detail = { source: 'guided_chip', handled: false, item: { label: 'Let’s work through it together' } };
      window.dispatchEvent(new CustomEvent('quantora:study-adaptive-mission-request', { detail }));
      return detail.handled;
    });
    assert.equal(handled, true, 'The actual mounted mission owner must accept the guided action.');
    await page.locator(`${MISSION}[data-quantora-study-adaptive-mission="guided_practice"]`).waitFor({ state: 'visible' });
    await page.waitForFunction((prefix) => Object.keys(localStorage).some((key) => {
      if (!key.startsWith(prefix)) return false;
      try { return JSON.parse(localStorage.getItem(key))?.phase === 'guided_practice'; } catch { return false; }
    }), PREFIX);
    const saved = await page.evaluate((prefix) => {
      const key = Object.keys(localStorage).find((item) => item.startsWith(prefix));
      return { key, checkpoint: JSON.parse(localStorage.getItem(key)) };
    }, PREFIX);
    assert.ok(saved.key.includes(encodeURIComponent(account)));
    assert.ok(saved.checkpoint.sessionId);
    assert.equal(saved.checkpoint.observationOnly, true);
    assert.equal(saved.checkpoint.phase, 'guided_practice');
    // Same settling window as the existing saved-message native visual proof.
    await page.waitForTimeout(1000);
    const beforeResume = chatCalls;
    assert.equal(issues.length, 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(AVAILABLE).waitFor({ state: 'visible' });
    assert.equal(await page.locator(MISSION).count(), 0, 'Reload must not auto-start a mission.');
    const resume = page.locator('[data-quantora-study-resume-action="resume"]');
    if (mobile) await resume.tap();
    else { await resume.focus(); await resume.press('Enter'); }
    await page.locator('[data-quantora-study-session-resume="restored"]').waitFor({ state: 'visible' });
    await page.locator('[data-quantora-study-adaptive-mission="guided_practice"]').waitFor({ state: 'visible' });
    assert.equal(chatCalls, beforeResume, 'Hydration and Resume must not generate another model turn.');
    assert.equal(issues.length, 0, 'Resume must not issue an assessment automatically.');
    assert.equal(await page.locator('[data-quantora-study-verified-result]').count(), 0);
    assert.equal(await page.locator('[data-quantora-study-adaptive-mission="complete"]').count(), 0);
    const bounds = await page.locator('[data-quantora-study-session-resume="restored"]').boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1);
    await page.screenshot({ path: `artifacts/e2e/study-continuity-${name}.png`, fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(AVAILABLE).waitFor({ state: 'visible' });
    await page.locator('[data-quantora-study-resume-action="discard"]').click();
    await page.locator(AVAILABLE).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), saved.key), null);

    // Tampered metadata can at most request progress, never restore a pass or
    // substitute a different canonical concept in the fresh server request.
    await page.evaluate(({ key, checkpoint }) => localStorage.setItem(key, JSON.stringify({
      ...checkpoint, phase: 'verified_check', savedAt: Date.now(), conceptKey: 'forged.other-concept',
      verifiedOutcome: 'correct', verifiedAttemptId: 'forged-attempt', mastery: 1,
    })), saved);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(AVAILABLE).waitFor({ state: 'visible' });
    await page.locator('[data-quantora-study-resume-action="resume"]').click();
    const checking = page.locator('[data-quantora-study-adaptive-mission="verified_check"]');
    await checking.waitFor({ state: 'visible' });
    assert.equal(chatCalls, beforeResume);
    assert.equal(issues.length, 0);
    assert.equal(await page.locator('[data-quantora-study-verified-result]').count(), 0);
    await checking.getByRole('button', { name: 'Open verified check', exact: true }).click();
    await page.locator('[data-quantora-study-verified-check="true"]').waitFor({ state: 'visible' });
    assert.equal(issues.length, 1);
    assert.notEqual(issues[0].conceptKey, 'forged.other-concept');
    assert.equal(issues[0].sessionId, saved.checkpoint.sessionId);

    account = 'other-continuity-student@quantora.test';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.app-shell--studio').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    assert.equal(await page.locator(AVAILABLE).count(), 0, 'An authenticated different account must not get this lesson checkpoint.');
    console.log(`Study continuity proof passed: ${name} (real save/reload, explicit resume, zero automatic model/assessment calls, discard, cached-grade rejection, fresh check, account isolation).`);
  } catch (error) {
    await page.screenshot({ path: `artifacts/e2e/study-continuity-${name}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
try { await scenario(false); await scenario(true); }
finally { await browser.close(); }
