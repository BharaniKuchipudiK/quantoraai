import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

// Real /api/chat, real provider output, real metadata and native components.
// Only shell authentication uses the existing isolated golden-canary identity.
// No SSE, model catalog, renderer decision, or lesson response is fabricated.
const base = new URL(process.env.QUANTORA_E2E_BASE_URL || '');
assert.equal(base.protocol, 'https:');
assert.ok(/^quantora-platform-[a-z0-9]+-sartho\.vercel\.app$/.test(base.hostname), 'Use an immutable project deployment, not a moving branch alias.');
const canary = process.env.QUANTORA_GOLDEN_CANARY_TOKEN || '';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
assert.ok(canary.length >= 24 && bypass.length >= 24, 'Live proof credentials are required.');
const headers = { 'X-Quantora-Golden-Canary': canary, 'x-vercel-protection-bypass': bypass };
const healthResponse = await fetch(new URL('/api/inference-health', base), { headers, redirect: 'error' });
const health = await healthResponse.json();
assert.ok(healthResponse.ok && health.ready === true && health.goldenCanaryHonored === true, 'The actual deployment must honor the canary and be inference-ready.');
const dir = 'artifacts/e2e';
mkdirSync(dir, { recursive: true });
const proof = { test: 'live-study-animation', deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA, origin: base.origin, mocked: ['shell-authentication-only'], turns: [], passed: false };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
// Forward unchanged requests/responses, adding credentials only for this origin
// and only this hop. A redirected request cannot inherit our secret headers.
await context.route('**/*', async (route) => {
  const request = route.request();
  if (new URL(request.url()).origin !== base.origin) return route.continue();
  const response = await route.fetch({ headers: { ...request.headers(), ...headers }, maxRedirects: 0, timeout: 180_000 });
  return route.fulfill({ response });
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
await page.addInitScript(() => localStorage.setItem('quantora_hide_welcome', 'true'));
await page.route('**/api/auth/session', (route) => route.fulfill({ json: { user: {
  sub: 'quantora-golden-canary', name: 'Golden Canary', email: 'golden-canary@quantora.invalid', picture: null, isAdmin: false,
} } }));
const LESSON = '[data-quantora-study-lesson="true"]';
const CIRCUIT = '[data-quantora-study-lab="simple-dc-circuit"]';
const FALSE_DENIAL = /(?:I|We)\s+(?:cannot|can't|can’t)\s+(?:create|display|run|show|render)[^.!?\n]{0,120}(?:animations?|simulations?)[^.!?\n]{0,80}(?:here|text desk|chat)/i;
async function send(message, expectedRenderer) {
  const previous = await page.locator(LESSON).count();
  const responsePromise = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/chat' && res.request().method() === 'POST', { timeout: 180_000 });
  const input = page.locator('.app-shell--studio textarea').first();
  await input.fill(message);
  await input.press('Enter');
  const response = await responsePromise;
  const payload = response.request().postDataJSON();
  const body = await response.text();
  const packets = body.split(/\r?\n/).filter((line) => line.startsWith('data: ')).flatMap((line) => {
    try { return [JSON.parse(line.slice(6))]; } catch { return []; }
  });
  const metadata = packets.findLast((packet) => packet.conversation?.studyCognitiveRouting)?.conversation.studyCognitiveRouting;
  const entry = { message, requestMessage: payload.message, historyCount: payload.history?.length || 0,
    historyContainsFirstQuestion: JSON.stringify(payload.history || []).includes('can you show me Electric circuitry how it works'),
    status: response.status(), model: packets.findLast((packet) => packet.modelId)?.modelId || null,
    route: metadata || null, text: packets.map((packet) => typeof packet.text === 'string' ? packet.text : '').join(''),
    errors: packets.filter((packet) => packet.error).map((packet) => packet.error) };
  proof.turns.push(entry);
  console.log(`Live Study route: ${JSON.stringify({ message, status: entry.status, model: entry.model, representation: metadata?.representation })}`);
  assert.ok(response.ok() && !entry.errors.length, 'The live chat request must succeed.');
  assert.ok(metadata, 'The actual API must return Study routing metadata.');
  if (expectedRenderer) {
    assert.equal(metadata.representation?.rendererKind, expectedRenderer, 'Renderer must be selected by the actual server.');
    assert.equal(metadata.representation?.rendererRequired, true);
  }
  const lesson = page.locator(LESSON).nth(previous);
  await lesson.waitFor({ state: 'visible' });
  return { lesson, entry };
}
try {
  await page.goto(base.origin, { waitUntil: 'domcontentloaded' });
  await enterSignedInStudio(page);
  await page.locator('[data-quantora-advisor="education"]').first().click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');
  await send('can you show me Electric circuitry how it works');
  const { lesson, entry } = await send('can you show me with an animation to visualise', 'circuit-lab');
  assert.equal(entry.historyContainsFirstQuestion, true, 'The real client must send the actual prior question.');
  const circuit = lesson.locator(CIRCUIT);
  await circuit.waitFor({ state: 'visible' });
  assert.equal(await circuit.count(), 1);
  assert.doesNotMatch(await lesson.textContent(), FALSE_DENIAL);
  const marker = circuit.locator('[data-study-circuit-marker="0"]');
  const point = () => marker.evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy')]);
  const initial = await point();
  await circuit.locator('[data-circuit-control="play"]').click();
  await page.waitForTimeout(300);
  assert.notDeepEqual(await point(), initial);
  await circuit.locator('[data-circuit-control="play"]').click();
  const paused = await point();
  await page.waitForTimeout(200);
  assert.deepEqual(await point(), paused);
  await circuit.locator('[data-circuit-control="wire"]').click();
  assert.equal(await circuit.locator('[data-circuit-lamp="off"]').count(), 1);
  assert.match(await circuit.locator('[data-study-circuit-current]').textContent(), /0\.00 A/);
  await circuit.locator('[data-circuit-control="wire"]').click();
  await circuit.locator('[data-circuit-control="reset"]').click();
  await circuit.screenshot({ path: `${dir}/live-study-circuit.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await circuit.scrollIntoViewIfNeeded();
  const bounds = await circuit.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, 'Live circuit must fit the mobile viewport.');
  await circuit.screenshot({ path: `${dir}/live-study-circuit-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { lesson: newton } = await send("Now explain Newton's 3rd law with an animation.", 'newton-lab');
  const skaters = newton.locator('[data-quantora-study-animation="newton-third-law"]');
  await skaters.waitFor({ state: 'visible' });
  assert.doesNotMatch(await newton.textContent(), FALSE_DENIAL);
  const skater = skaters.locator('circle').first();
  const before = await skater.getAttribute('cx');
  await skaters.getByRole('button', { name: 'Play push-apart animation' }).click();
  await page.waitForTimeout(300);
  assert.notEqual(await skater.getAttribute('cx'), before);
  await skaters.screenshot({ path: `${dir}/live-study-newton.png` });
  const { lesson: linear } = await send('Now show an interactive lab for linear functions.', 'linear-function-lab');
  const graph = linear.locator('[data-quantora-study-interactive-lab="linear-function"]');
  await graph.waitFor({ state: 'visible' });
  assert.doesNotMatch(await linear.textContent(), FALSE_DENIAL);
  await graph.getByRole('button', { name: 'It gets steeper', exact: true }).click();
  await graph.getByRole('button', { name: 'Run graph', exact: true }).click();
  await graph.locator('[data-quantora-study-lab-step="observe-explain"]').waitFor({ state: 'visible' });
  await graph.screenshot({ path: `${dir}/live-study-linear.png` });
  const { lesson: biology, entry: unsupported } = await send('Now animate mitosis in an animal cell.');
  assert.ok(!['circuit-lab', 'newton-lab', 'linear-function-lab'].includes(unsupported.route.representation?.rendererKind));
  assert.equal(await biology.locator('[data-quantora-study-lab], [data-quantora-study-animation], [data-quantora-study-interactive-lab]').count(), 0);
  assert.equal(await lesson.locator(CIRCUIT).count(), 1, 'A later topic must preserve the earlier circuit.');
  proof.passed = true;
  console.log('LIVE STUDY PASS: 5 real chat turns; screenshot follow-up, actual circuit/Newton motion, linear interaction and unrelated-topic isolation.');
} catch (error) {
  proof.error = String(error?.message || error).replaceAll(canary, '[redacted]').replaceAll(bypass, '[redacted]');
  await page.screenshot({ path: `${dir}/live-study-failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  writeFileSync(`${dir}/live-study-proof.json`, JSON.stringify(proof, null, 2));
  await browser.close();
}
