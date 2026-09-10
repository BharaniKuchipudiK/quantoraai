#!/usr/bin/env node
/**
 * Browser proof for the transport boundary Vercel itself makes necessary:
 * a near-5 MiB PDF must leave the browser as a direct private upload, never as
 * ~7 MiB of base64 in /api/chat. No model and no real Storage mutation here;
 * the signed-upload endpoint is stubbed while Playwright records exact bytes.
 */
import process from 'node:process';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { buildMinimalPdf } from './lib/minimal-pdf.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const FILE_NAME = 'near-five-mib.pdf';
const TARGET_BYTES = 5 * 1024 * 1024 - 4096;
const STORAGE_REF = 'v1.eyJwYXRoIjoidGVzdCJ9.synthetic_signature_123';
const rawPdf = buildMinimalPdf('Near five MiB transport proof.');
if (rawPdf.length >= TARGET_BYTES) throw new Error('Minimal PDF fixture unexpectedly exceeds near-5 MiB target.');
// PDF readers tolerate trailing whitespace after %%EOF, so this remains a PDF
// while exercising the actual browser byte boundary rather than a fake size.
const NEAR_FIVE_MIB_PDF = Buffer.concat([rawPdf, Buffer.alloc(TARGET_BYTES - rawPdf.length, 0x20)]);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const chatBodies = [];
const uploadRequests = [];
const tokenRequests = [];

function sseBody(text) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Reader', latencyMs: 8, modelId: 'synthetic-a', liveConnected: true, finish: { kind: 'complete', reason: 'stop' }, attachments: [{ name: FILE_NAME, kind: 'pdf', ok: true, detail: '1 pages · 31 characters', chars: 31, pages: 1 }] })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_active_specialist_domain');
});

await page.route('**/__attachment-upload-test**', async (route) => {
  const request = route.request();
  uploadRequests.push({
    method: request.method(),
    headers: request.headers(),
    bytes: request.postDataBuffer()?.length || 0,
  });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `quantora-attachments/test/${FILE_NAME}` }) });
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'attachments-5mib-user', name: 'Attachments User', email: 'attach5@quantora.test', picture: null, isAdmin: false } }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }) });
  }
  if (path === '/api/domains' && url.searchParams.get('route') === 'attachment-upload') {
    const body = request.postDataJSON?.() || {};
    tokenRequests.push(body);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uploadUrl: `${BASE_URL}/__attachment-upload-test?token=synthetic`,
        storageRef: STORAGE_REF,
      }),
    });
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    chatBodies.push({ body, jsonBytes: Buffer.byteLength(request.postData() || '', 'utf8') });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sseBody(chatBodies.length === 1 ? 'I read the near-five-MiB PDF.' : 'I still have that PDF in this conversation.'),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function waitForCount(list, count, label, timeout = 20_000) {
  const started = Date.now();
  while (list.length < count && Date.now() - started < timeout) await new Promise((resolve) => setTimeout(resolve, 50));
  if (list.length < count) throw new Error(`Expected ${count} ${label}; saw ${list.length}.`);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);
  const study = page.locator('[data-quantora-advisor="education"]').first();
  await study.waitFor({ state: 'visible', timeout: 10_000 });
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  const prompt = page.locator('.app-shell--studio textarea').first();
  const fileInput = page.locator('.app-shell--studio input[type="file"]').first();
  await prompt.waitFor({ state: 'visible', timeout: 10_000 });

  await fileInput.setInputFiles([{ name: FILE_NAME, mimeType: 'application/pdf', buffer: NEAR_FIVE_MIB_PDF }]);
  const chip = page.locator(`[data-quantora-attachment-chip="${FILE_NAME}"]`).first();
  await chip.waitFor({ state: 'visible', timeout: 15_000 });
  if (await chip.getAttribute('data-quantora-attachment-kind') !== 'document') throw new Error('Near-5 MiB PDF was not classified as a document.');

  await waitForCount(tokenRequests, 1, 'attachment token requests');
  await waitForCount(uploadRequests, 1, 'private upload requests');
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (tokenRequests[0].name !== FILE_NAME || tokenRequests[0].size !== TARGET_BYTES) {
    throw new Error(`Upload token request did not carry exact file metadata: ${JSON.stringify(tokenRequests[0])}.`);
  }
  const upload = uploadRequests[0];
  if (upload.method !== 'PUT') throw new Error(`Private upload used ${upload.method}, expected PUT.`);
  if (!String(upload.headers['content-type'] || '').includes('multipart/form-data')) throw new Error('Private upload was not multipart/form-data.');
  if (upload.bytes < TARGET_BYTES) throw new Error(`Private upload carried only ${upload.bytes} bytes for a ${TARGET_BYTES}-byte file.`);

  await prompt.fill('Read this PDF and tell me what it contains.');
  await prompt.press('Enter');
  await waitForCount(chatBodies, 1, 'chat requests');
  const first = chatBodies[0];
  const firstDocs = first.body.attachedDocuments || [];
  if (firstDocs.length !== 1 || firstDocs[0].storageRef !== STORAGE_REF) throw new Error(`First chat did not carry the private storage ref: ${JSON.stringify(firstDocs)}.`);
  if ('dataUrl' in firstDocs[0]) throw new Error('Near-5 MiB document base64 leaked into /api/chat.');
  if (first.jsonBytes > 250_000) throw new Error(`/api/chat stayed too large after private upload (${first.jsonBytes} bytes).`);
  if ((first.body.attachedImages || []).length) throw new Error('Near-5 MiB PDF was also sent as an image.');

  await page.waitForFunction(() => /I read the near-five-MiB PDF/i.test(document.body.innerText || ''), null, { timeout: 20_000 });
  await prompt.fill('What was in that PDF again?');
  await prompt.press('Enter');
  await waitForCount(chatBodies, 2, 'chat requests');
  const follow = chatBodies[1];
  const carried = follow.body.attachedDocuments || [];
  if (carried.length !== 1 || carried[0].storageRef !== STORAGE_REF || carried[0].carried !== true) {
    throw new Error(`Stored document continuity failed: ${JSON.stringify(carried)}.`);
  }
  if ('dataUrl' in carried[0]) throw new Error('Carried stored document reintroduced base64 into /api/chat.');
  if (follow.jsonBytes > 250_000) throw new Error(`Follow-up /api/chat grew unexpectedly (${follow.jsonBytes} bytes).`);

  console.log(`attachments 5 MiB browser gate passed — ${TARGET_BYTES} raw PDF bytes uploaded privately, /api/chat stayed ${first.jsonBytes} bytes, and the same opaque ref survived a no-reupload follow-up.`);
  await browser.close();
} catch (error) {
  await browser.close().catch(() => {});
  throw new Error(`attachments 5 MiB browser gate FAILED: ${error?.message || error}`);
}
