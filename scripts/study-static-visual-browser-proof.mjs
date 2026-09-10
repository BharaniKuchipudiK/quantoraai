import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

// Same blocking CI and exact-deployment entrypoint as the native-lab proof.
// Exercise real server routing functions and deployed UI, NOT live model output.
const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const CASES = [
  ['Show equivalent fractions 2/3 and 4/6 visually', 'fraction-model'],
  ['Show this diagram: Before/after: ice -> liquid water', 'before-after'],
  ['Show this diagram: Process: input -> change -> result', 'process-flow'],
  ['Show a timeline of events in 1914 and 1918 visually', 'timeline'],
  ['Show a number line from -3 to 5, mark 2 visually', 'number-line'],
  ['Show EMF and terminal voltage in a battery visually', 'electricity-circuit'],
  ['Show vector components on x and y axes visually', 'physics-motion'],
  ['Show a right triangle using Pythagoras visually', 'geometry-construction'],
  ['Show the cell membrane and nucleus visually', 'biology-cell'],
  ['Show a covalent bond between two atoms visually', 'chemistry-bond'],
  ['Show a displacement-time graph visually', 'graph'],
  ['Show magnetic field direction using the right-hand rule visually', 'field-lines'],
  ['Show an algebra equation balance visually', 'algebra-balance'],
];
const routeSource = `
import { interpretStudyTurn, publicStudyCognitiveMetadata } from './api/_lib/study-cognitive-routing.ts';
const cases = ${JSON.stringify(CASES)};
console.log('STATIC_ROUTES:' + JSON.stringify(cases.map(([message]) => publicStudyCognitiveMetadata(interpretStudyTurn({ studioDomain: 'education', message, history: [], workingState: null })))));
`;
const routingOutput = execFileSync('npx', ['--no-install', 'tsx', '--eval', routeSource], { encoding: 'utf8', timeout: 60_000 });
const routesLine = routingOutput.split('\n').find((line) => line.startsWith('STATIC_ROUTES:'));
assert.ok(routesLine, 'Real public Study metadata must be available for this proof.');
const routes = JSON.parse(routesLine.slice('STATIC_ROUTES:'.length));
for (const [index, [, kind]] of CASES.entries()) {
  assert.equal(routes[index]?.representation?.rendererKind, kind, `Server routing mismatch for ${kind}`);
  assert.equal(routes[index]?.representation?.rendererRequired, true);
  assert.ok(routes[index]?.representation?.renderCaption, `${kind} needs concrete caption data`);
}
const LESSON = '[data-quantora-study-lesson="true"]';
const ART = '[data-quantora-study-picture], [data-quantora-study-micro-visual]';
const browser = await chromium.launch({ headless: true });
mkdirSync('artifacts/e2e', { recursive: true });

async function scenario(name, mobile = false, failChunk = false) {
  const theme = mobile ? 'light' : 'dark';
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme, reducedMotion: mobile ? 'reduce' : 'no-preference' });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    const origin = new URL(BASE_URL).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin) return route.continue();
      const response = await route.fetch({ headers: { ...request.headers(), 'x-vercel-protection-bypass': bypass }, maxRedirects: 0 });
      return route.fulfill({ response });
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.addInitScript((theme) => {
    localStorage.setItem('quantora_hide_welcome', 'true');
    localStorage.setItem('quantora_theme_mode', theme);
  }, theme);
  if (failChunk) await page.route(/StudyMicroVisual[^/]*\.js(?:\?|$)/, (route) => route.abort());
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: { sub: 'static-visual-proof', name: 'Static Visual Student', email: 'static-visual@quantora.test', isAdmin: false } } });
    if (path === '/api/models') return route.fulfill({ json: { models: [{ id: 'synthetic-study', name: 'Synthetic Study', provider: 'Synthetic', available: true }] } });
    if (path === '/api/chat') {
      const message = String(route.request().postDataJSON()?.message || '');
      const index = CASES.findIndex(([prompt]) => prompt === message);
      const selected = routes[index] || null;
      // The first case has no visual tag at all. Later cases include duplicate
      // and unrelated model tags; metadata, not generated prose, must win.
      const competition = index > 0 ? '\n<quantora-study-picture caption="Cell membrane and nucleus" />\n<quantora-study-picture caption="Right triangle" />\n<quantora-study-lab kind="newton-third-law" />' : '';
      const text = selected ? `I cannot show a diagram in this text chat.\n\nKeep this written explanation alongside the visual.${competition}` : 'This topic has no supported native visual in this test. Keep the written explanation.';
      const body = [`data: ${JSON.stringify({ text })}`, `data: ${JSON.stringify({ provider: 'Controlled static visual proof', modelId: 'synthetic-study', liveConnected: true, conversation: { studyCognitiveRouting: selected } })}`, 'data: [DONE]', ''].join('\n\n');
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body });
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
    const limit = failChunk ? 1 : mobile ? 5 : CASES.length;
    for (let index = 0; index < limit; index += 1) {
      const [prompt, kind] = CASES[index];
      const count = await page.locator(LESSON).count();
      await input.fill(prompt);
      await input.press('Enter');
      const lesson = page.locator(LESSON).nth(count);
      await lesson.waitFor({ state: 'visible' });
      if (failChunk) {
        await lesson.locator('[data-quantora-study-visual-unavailable="true"]').waitFor({ state: 'visible' });
        assert.match(await lesson.textContent(), /Keep this written explanation/);
        continue;
      }
      const routed = lesson.locator(`[data-quantora-study-routed-visual="${kind}"]`);
      const svg = routed.locator('svg[role="img"]');
      await svg.waitFor({ state: 'visible' });
      assert.equal(await routed.count(), 1);
      assert.equal(await lesson.locator(ART).count(), 1, `${kind}: no missing/duplicate/competing illustration`);
      assert.equal(await lesson.locator('[data-quantora-study-lab]').count(), 0);
      assert.ok((await svg.getAttribute('aria-label'))?.trim());
      assert.doesNotMatch(await lesson.textContent(), /cannot show a diagram/i);
      assert.match(await lesson.textContent(), /Keep this written explanation/);
      const bounds = await svg.boundingBox();
      assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1, `${kind}: viewport overflow`);
      if (kind === 'before-after') assert.match(await svg.getAttribute('aria-label'), /ice becomes liquid water/);
      if (kind === 'fraction-model') assert.match(await svg.getAttribute('aria-label'), /2\/3 equals 4\/6/);
      if (index < 3) await routed.screenshot({ path: `artifacts/e2e/study-static-${name}-${kind}.png` });
    }
    if (!failChunk) {
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-quantora-study-routed-visual]').first().waitFor({ state: 'attached' });
      assert.equal(await page.locator('[data-quantora-study-routed-visual]').count(), limit, 'Later topics and reload must retain each original visual contract.');
    }
    console.log(`Governed static visual proof passed: ${name} (${limit} real server routes; controlled API replies).`);
  } catch (error) {
    await page.screenshot({ path: `artifacts/e2e/study-static-${name}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
try {
  await scenario('desktop-dark');
  await scenario('mobile-light-reduced', true);
  await scenario('unavailable-chunk', false, true);
} finally { await browser.close(); }
