import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

// Imported by the existing blocking Electricity gate. These are real native
// components in the built app; only server/model responses are deterministic.
const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const CIRCUIT = '[data-quantora-study-lab="simple-dc-circuit"]';
const LESSON = '[data-quantora-study-lesson="true"]';
const DENIAL = 'I cannot run a live video or interactive simulation directly inside this text desk, but we can visualize it clearly using an exact physical equivalent: the bicycle chain.';
const ROUTES = {
  circuit: ['circuit-lab', 'physics.electricity.current'],
  newton: ['newton-lab', 'physics.dynamics.newton-third-law'],
  linear: ['linear-function-lab', 'math.linear-function'],
};
function sse(text, family) {
  const selected = ROUTES[family];
  const studyCognitiveRouting = {
    version: 'study-native-lab-browser-proof-v1',
    concept: { key: selected?.[1] || null },
    representation: {
      requestedMode: 'animation', rendererRequired: Boolean(selected),
      primaryRepresentation: selected ? 'simulation_or_lab' : 'concise_text',
      rendererKind: selected?.[0] || null, fallback: selected ? 'none' : 'renderer_unavailable',
    },
  };
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic native lab proof', modelId: 'synthetic-study', liveConnected: true, conversation: { studyCognitiveRouting } })}`,
    'data: [DONE]', '',
  ].join('\n\n');
}

const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/e2e', { recursive: true });
async function scenario({ name, theme, reduced = false, mobile = false, assetFailure = false }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, reducedMotion: reduced ? 'reduce' : 'no-preference',
    colorScheme: theme, hasTouch: mobile,
  });
  // Production proof uses the exact deployed frontend, with the same fixtures.
  // Scope Vercel credentials to this origin; never send them to third parties.
  // Page-level API fixtures and deliberate chunk failures take precedence.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    const origin = new URL(BASE_URL).origin;
    await context.route('**/*', (route) => {
      const request = route.request();
      return new URL(request.url()).origin === origin
        ? route.continue({ headers: { ...request.headers(), 'x-vercel-protection-bypass': bypass } })
        : route.continue();
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('quantora_hide_welcome', 'true');
    localStorage.setItem('quantora_theme_mode', theme);
    window.__nativeLabObservations = [];
    window.addEventListener('quantora:study-learning-interaction', (event) => {
      window.__nativeLabObservations.push(event.detail);
    });
  }, { theme });
  if (assetFailure) await page.route(/StudyCircuitLab[^/]*\.js(?:\?|$)/, (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: {
      sub: 'native-lab-proof', name: 'Native Lab Student', email: 'native-lab@quantora.test', picture: null, isAdmin: false,
    } } });
    if (path === '/api/models') return route.fulfill({ json: { models: [
      { id: 'synthetic-study', name: 'Synthetic Study', provider: 'Synthetic', available: true },
    ] } });
    if (path === '/api/chat') {
      const message = String(route.request().postDataJSON()?.message || '');
      let family = null;
      let reply = 'A complete battery and lamp loop provides a return path for sustained current.';
      if (/animation to visualise|repeat circuit/i.test(message)) { family = 'circuit'; reply = DENIAL + '\n\nUse the controls to compare the complete and broken loop.'; }
      else if (/animate newton/i.test(message)) { family = 'newton'; reply = DENIAL + '\n\nWatch the two skaters push apart.'; }
      else if (/animate linear/i.test(message)) { family = 'linear'; reply = DENIAL + '\n\nChange the slope after making a prediction.'; }
      else if (/mitosis/i.test(message)) reply = 'Mitosis separates duplicated chromosomes into two nuclei.';
      else if (/neural/i.test(message)) reply = 'This particular animation is not available; a DC battery model would not represent a neural circuit.';
      if (/repeat circuit/i.test(message)) reply += '\n<quantora-study-lab kind=\'simple-dc-circuit\'/><quantora-study-lab kind="simple-dc-circuit" />';
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(reply, family) });
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
    const send = async (message) => {
      const count = await page.locator(LESSON).count();
      await input.fill(message);
      await input.press('Enter');
      const lesson = page.locator(LESSON).nth(count);
      await lesson.waitFor({ state: 'visible' });
      return lesson;
    };
    await send('Explain why a battery and lamp circuit stops working when the return wire is cut.');
    const lesson = await send('can you show me with an animation to visualise');
    if (assetFailure) {
      await lesson.locator('[data-quantora-study-lab-unavailable="true"]').waitFor({ state: 'visible' });
      assert.match(await lesson.textContent(), /compare the complete and broken loop/);
      console.log(`Native lab proof passed: ${name} (failed chunk isolated; written lesson survives).`);
      return;
    }
    const circuit = lesson.locator(CIRCUIT);
    await circuit.waitFor({ state: 'visible' });
    assert.equal(await circuit.count(), 1);
    assert.doesNotMatch(await lesson.textContent(), /cannot run|bicycle chain/);
    assert.equal(await circuit.locator('[data-circuit-lamp="on"]').count(), 1);
    const marker = circuit.locator('[data-study-circuit-marker="0"]');
    const point = async () => [await marker.getAttribute('cx'), await marker.getAttribute('cy')];
    const click = async (locator) => mobile ? locator.tap() : locator.click();
    await circuit.scrollIntoViewIfNeeded();
    const initial = await point();
    if (reduced) {
      assert.equal(await circuit.locator('[data-circuit-control="play"]').count(), 0);
      await page.waitForTimeout(180);
      assert.deepEqual(await point(), initial);
      await click(circuit.locator('[data-circuit-control="step"]'));
      assert.notDeepEqual(await point(), initial);
    } else {
      const play = circuit.locator('[data-circuit-control="play"]');
      await play.focus();
      await play.press('Enter');
      await page.waitForTimeout(250);
      assert.notDeepEqual(await point(), initial, 'Play must visibly move SVG markers, not only update a flag.');
      await click(play);
      const paused = await point();
      await page.waitForTimeout(180);
      assert.deepEqual(await point(), paused, 'Pause must stop marker positions.');
    }
    assert.match(await circuit.locator('[data-study-circuit-current]').textContent(), /0\.60 A/);
    await click(circuit.locator('[data-circuit-control="wire"]'));
    assert.equal(await circuit.getAttribute('data-circuit-connected'), 'false');
    assert.equal(await circuit.locator('[data-circuit-lamp="off"]').count(), 1);
    assert.match(await circuit.locator('[data-study-circuit-current]').textContent(), /0\.00 A/);
    const opened = await point();
    await page.waitForTimeout(150);
    assert.deepEqual(await point(), opened);
    await circuit.screenshot({ path: `artifacts/e2e/study-native-circuit-${name}-open.png` });
    await click(circuit.locator('[data-circuit-control="wire"]'));
    assert.equal(await circuit.getAttribute('data-circuit-connected'), 'true');
    assert.match(await circuit.locator('[data-study-circuit-current]').textContent(), /0\.60 A/);
    await circuit.locator('summary').click();
    const volts = circuit.getByRole('slider', { name: 'Source EMF (V)', exact: true });
    await volts.focus();
    await volts.press('ArrowRight');
    assert.match(await circuit.locator('[data-study-circuit-current]').textContent(), /0\.70 A/);
    await click(circuit.locator('[data-circuit-control="reset"]'));
    assert.equal(await volts.inputValue(), '6');
    assert.equal(await circuit.getAttribute('data-circuit-phase'), '0.000000');
    assert.equal(await circuit.getAttribute('data-circuit-playing'), 'false');
    assert.equal(await circuit.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true, 'Circuit content overflows its container.');
    const bounds = await circuit.boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1, 'Circuit must fit the visible viewport.');
    await circuit.locator('summary').click();
    await circuit.screenshot({ path: `artifacts/e2e/study-native-circuit-${name}.png` });

    if (name === 'desktop-dark') {
      const switched = await send('Now explain mitosis in a cell.');
      assert.equal(await switched.locator(CIRCUIT).count(), 0);
      assert.equal(await lesson.locator(CIRCUIT).count(), 1, 'A later topic must not erase the earlier circuit.');
      await circuit.locator('[data-circuit-control="wire"]').click();
      const events = await page.evaluate(() => window.__nativeLabObservations.filter((event) => event.labKind === 'simple-dc-circuit'));
      assert.ok(events.length > 0);
      assert.ok(events.every((event) => event.observationOnly === true && event.conceptId === 'physics.electricity.current' && !('correct' in event)));
      const repeated = await send('Repeat circuit animation.');
      await repeated.locator(CIRCUIT).waitFor({ state: 'visible' });
      assert.equal(await repeated.locator(CIRCUIT).count(), 1, 'Equivalent tags must not duplicate a lab.');
      const newton = await send('Animate Newton third law.');
      const skaters = newton.locator('[data-quantora-study-animation="newton-third-law"]');
      await skaters.waitFor({ state: 'visible' });
      const skater = skaters.locator('circle').first();
      const before = await skater.getAttribute('cx');
      await skaters.getByRole('button', { name: 'Play push-apart animation' }).click();
      await page.waitForTimeout(250);
      assert.notEqual(await skater.getAttribute('cx'), before);
      const linear = await send('Animate linear function y = mx + b.');
      const graph = linear.locator('[data-quantora-study-interactive-lab="linear-function"]');
      await graph.waitFor({ state: 'visible' });
      await graph.getByRole('button', { name: 'It gets steeper', exact: true }).click();
      await graph.getByRole('button', { name: 'Run graph', exact: true }).click();
      await graph.locator('[data-quantora-study-lab-step="observe-explain"]').waitFor({ state: 'visible' });
      const unsupported = await send('Animate a neural circuit.');
      assert.equal(await unsupported.locator('[data-quantora-study-workspace]').count(), 0);
      // Let the existing session writer settle, then exercise its real reload path.
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator(CIRCUIT).first().waitFor({ state: 'attached' });
      assert.equal(await page.locator(CIRCUIT).count(), 2, 'Saved messages must retain both independent circuit routes after reload.');
    }
    console.log(`Native lab proof passed: ${name} (actual motion/step, pause, open/reconnect/reset, keyboard, layout).`);
  } catch (error) {
    await page.screenshot({ path: `artifacts/e2e/study-native-lab-${name}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
try {
  await scenario({ name: 'desktop-dark', theme: 'dark' });
  await scenario({ name: 'desktop-light-reduced', theme: 'light', reduced: true });
  await scenario({ name: 'mobile-light', theme: 'light', mobile: true });
  await scenario({ name: 'mobile-dark-reduced', theme: 'dark', mobile: true, reduced: true });
  await scenario({ name: 'unavailable-chunk', theme: 'dark', assetFailure: true });
} finally { await browser.close(); }
