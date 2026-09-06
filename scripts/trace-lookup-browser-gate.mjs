#!/usr/bin/env node
/**
 * A failed turn's reference id resolves to what happened.
 *
 * THE INCIDENT (2026-09-05). A turn ended with "This turn ended without a reply
 * — that is a fault on Quantora's side … Reference: studio-719887e2-…". The
 * reference was a handle to nothing the person could reach: the server's
 * boundary events were stdout lines of a function instance that no longer
 * existed, and the only diagnosis available was a screenshot and a guess.
 *
 * Deterministic, no model: the backend is a stub. The chat stream ends without
 * a reply; the desk must show the failure with its reference, put its own
 * word on the record under that SAME reference, and, when asked, render the
 * server's account of the turn. What only this gate can catch:
 *   1. the reference the desk shows not being the id the request carried —
 *      a lookup that could never find the turn;
 *   2. the desk not recording its own half (browser.chat-stream failed);
 *   3. the "What happened?" control missing, or its answer not rendering;
 *   4. an unresolvable reference shown as a blank instead of a sentence.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const chatRequests = [];
const traceWrites = [];
const traceLookups = [];

/* The server's record of the incident's shape: received, engine chosen, engine
 * called — then nothing. Answered for whichever reference the desk asks about,
 * so the assertion is on the desk's half: it asked for the id it showed. */
function storedEventsFor(correlationId) {
  const base = Date.parse('2026-09-05T13:20:00.000Z');
  const at = (offset) => new Date(base + offset).toISOString();
  return [
    { correlationId, boundary: 'api.chat', state: 'started', at: at(0) },
    { correlationId, boundary: 'inference.plan', state: 'selected', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(40) },
    { correlationId, boundary: 'inference.provider', state: 'attempting', modelId: 'anthropic/claude-opus-5', gateway: 'openrouter', at: at(45) },
    ...traceWrites
      .filter((event) => event.correlationId === correlationId)
      .map((event, index) => ({ ...event, at: at(60_000 + index) })),
  ];
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'trace-user', name: 'Trace User', email: 'trace@quantora.test', picture: null, isAdmin: false } }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }) });
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    chatRequests.push({ body, headerId: request.headers()['x-quantora-correlation-id'] || null });
    // The stream ends with nothing said: no text, no done payload, no error.
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-quantora-correlation-id': body.correlationId || '' },
      body: 'data: [DONE]\n\n',
    });
  }
  if (path === '/api/trace' && request.method() === 'POST') {
    const body = request.postDataJSON?.() || {};
    traceWrites.push(body);
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ recorded: true, correlationId: body.correlationId }) });
  }
  if (path === '/api/trace' && request.method() === 'GET') {
    const correlationId = url.searchParams.get('correlationId') || '';
    traceLookups.push(correlationId);
    // Only the first turn's reference has a record; any other is unknown, as
    // the served route answers for a reference nothing was kept under.
    if (correlationId !== (chatRequests[0]?.body?.correlationId || '')) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No record for that reference.', correlationId }) });
    }
    const events = storedEventsFor(correlationId);
    // The story is the server's; here it is built the same way the server builds it.
    const { describeTrace } = await import('../shared/trace-story.js');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ correlationId, events, story: describeTrace(events) }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  await prompt.fill('Propose a standard maintenance format for the association.');
  await prompt.press('Enter');

  // 1. The turn ends without a reply, and the desk says so with a reference.
  await page.waitForFunction(() => /Reference:\s*[a-zA-Z0-9][a-zA-Z0-9._:-]{7,95}/.test(document.body.innerText || ''), null, { timeout: 20_000 });
  if (chatRequests.length !== 1) throw new Error(`Expected exactly one chat call; saw ${chatRequests.length}.`);
  const sent = chatRequests[0];
  const requestId = sent.body.correlationId;
  if (!requestId) throw new Error('The chat request carried no correlationId in its body — nothing on the server could be filed under a reference.');
  if (sent.headerId !== requestId) throw new Error(`The request header X-Quantora-Correlation-Id (${sent.headerId}) differs from the body's correlationId (${requestId}).`);
  const shownReference = (await page.evaluate(() => (document.body.innerText || '').match(/Reference:\s*([a-zA-Z0-9][a-zA-Z0-9._:-]{7,95})/)?.[1] || ''));
  if (shownReference !== requestId) {
    throw new Error(`The desk shows reference ${shownReference} but the request was filed under ${requestId} — a lookup could never find this turn.`);
  }

  // 2. The desk put its own word on the record under that reference.
  await page.waitForFunction(() => true, null, { timeout: 1_000 }).catch(() => {});
  const deskRecord = traceWrites.find((event) => event.correlationId === requestId && event.boundary === 'browser.chat-stream' && event.state === 'failed');
  if (!deskRecord) throw new Error(`The desk did not record its side of the silent turn under ${requestId}. Trace writes: ${JSON.stringify(traceWrites)}`);
  if (deskRecord.detailCode !== 'silent-turn') throw new Error(`The desk's record does not say why: ${JSON.stringify(deskRecord)}`);

  // 3. "What happened?" carries the same reference, asks the server for it, and renders the account.
  const control = page.locator(`[data-quantora-trace-lookup="${requestId}"]`).first();
  await visible(control, `The failed turn offers no "What happened?" control for reference ${requestId}.`);
  await control.click();
  const story = page.locator('[data-quantora-trace-story]').first();
  await visible(story, 'The account of the turn never rendered after the lookup.');
  if (traceLookups[0] !== requestId) throw new Error(`The desk looked up ${JSON.stringify(traceLookups)} instead of ${requestId}.`);
  const outcome = await story.getAttribute('data-quantora-trace-story');
  if (outcome !== 'server-cut-off') throw new Error(`Expected the account to say the server was cut off; it says ${JSON.stringify(outcome)}.`);
  const storyText = (await story.innerText()).trim();
  if (!/cut off before it finished this turn — a fault on our side/.test(storyText)) throw new Error(`The headline does not place the fault: ${JSON.stringify(storyText.slice(0, 200))}`);
  if (!/Called anthropic\/claude-opus-5 via openrouter\./.test(storyText)) throw new Error('The steps do not name the engine that was called.');
  if (!/desk ended the turn without a reply/.test(storyText)) throw new Error('The desk\'s own record is missing from the account.');

  // 4. A reference nothing was kept under is answered with a sentence, not a blank.
  await prompt.fill('Try that again, please.');
  await prompt.press('Enter');
  await page.waitForFunction((known) => {
    const refs = Array.from((document.body.innerText || '').matchAll(/Reference:\s*([a-zA-Z0-9][a-zA-Z0-9._:-]{7,95})/g), (m) => m[1]);
    return refs.some((ref) => ref !== known);
  }, requestId, { timeout: 20_000 });
  if (chatRequests.length !== 2) throw new Error(`Expected a second chat call; saw ${chatRequests.length}.`);
  const secondId = chatRequests[1].body.correlationId;
  if (!secondId || secondId === requestId) throw new Error(`The second turn reused the first turn's reference (${secondId}).`);
  const secondControl = page.locator(`[data-quantora-trace-lookup="${secondId}"]`).first();
  await visible(secondControl, `The second failed turn offers no "What happened?" control for reference ${secondId}.`);
  await secondControl.click();
  const unresolved = page.locator('[data-quantora-trace-story="unresolved"]').first();
  await visible(unresolved, 'An unresolvable reference rendered nothing instead of a sentence.');
  const unresolvedText = (await unresolved.innerText()).trim();
  if (!/no record under this reference for your account/.test(unresolvedText)) {
    throw new Error(`The unresolvable reference is not explained in the desk's words: ${JSON.stringify(unresolvedText)}`);
  }

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/trace-lookup.png', fullPage: true });
  console.log(`trace-lookup browser gate passed — the silent turn showed reference ${requestId}, the same id the request and the desk's own record carried; "What happened?" rendered the server's account (server-cut-off).`);
  await browser.close();
  process.exit(0);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/trace-lookup-failure.png', fullPage: true }).catch(() => {});
  console.error(`trace-lookup browser gate FAILED: ${error?.message || error}`);
  console.error(`Evidence: chatRequests=${chatRequests.length}, traceWrites=${JSON.stringify(traceWrites)}, traceLookups=${JSON.stringify(traceLookups)}`);
  await browser.close().catch(() => {});
  process.exit(1);
}
