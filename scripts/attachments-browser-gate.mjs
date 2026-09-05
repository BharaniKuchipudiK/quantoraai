#!/usr/bin/env node
/**
 * Documents attached to a chat turn travel, and what was read is said.
 *
 * THE INCIDENT (2026-09-05). Four association documents — bylaws, a scanned
 * registration certificate, a member form, a spreadsheet — were attached to
 * one chat turn. The browser dropped every one as "(not a readable image)" and
 * the model, told nothing about files it never received, asked the user how to
 * get them. No gate had ever attached a file.
 *
 * Deterministic, no model: the backend is a stub that records exactly what the
 * request carried and answers with the server's read summary (one document
 * read, one scanned). What only this gate can catch:
 *   1. the composer taking a PDF as anything but a document;
 *   2. the send path dropping documents, or sending them as images;
 *   3. the desk not publishing what was read, or hiding an unreadable file;
 *   4. the old copy coming back — a document called "not a readable image".
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { buildMinimalPdf } from './lib/minimal-pdf.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const REGISTRATION = 'RKV-2019-0417';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const chatBodies = [];

function sseBody(text, attachments) {
  return [
    `data: ${JSON.stringify({ text })}`,
    `data: ${JSON.stringify({ provider: 'Synthetic Reader', latencyMs: 12, modelId: 'synthetic-a', liveConnected: true, finish: { kind: 'complete', reason: 'stop' }, attachments })}`,
    'data: [DONE]',
    '',
  ].join('\n\n');
}

await page.addInitScript(() => {
  localStorage.setItem('quantora_hide_welcome', 'true');
  localStorage.removeItem('quantora_profile_avatar_v1');
});

await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/auth/session') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { sub: 'attachments-user', name: 'Attachments User', email: 'attach@quantora.test', picture: null, isAdmin: false } }) });
  }
  if (path === '/api/models') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'synthetic-a', name: 'Synthetic A', provider: 'Synthetic', available: true }] }) });
  }
  if (path === '/api/chat') {
    const body = request.postDataJSON?.() || {};
    chatBodies.push(body);
    const documents = Array.isArray(body.attachedDocuments) ? body.attachedDocuments : [];
    // The server's account, as attachment-text.ts would give it: the bylaws
    // read, the scan named as unreadable.
    const attachments = documents.map((doc) => (doc.name === 'scan.pdf'
      ? { name: doc.name, kind: 'pdf', ok: false, detail: 'no text layer — this looks like a scanned image, and Quantora cannot OCR it yet', reason: 'source_pdf_empty', chars: 0 }
      : { name: doc.name, kind: 'pdf', ok: true, detail: '1 pages · 118 characters', chars: 118, pages: 1 }));
    const text = documents.length
      ? `The registration number in the attached bylaws is ${REGISTRATION}.`
      : 'I received no documents with this message.';
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(text, attachments) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}
const transcript = () => page.evaluate(() => document.querySelector('.app-shell--studio')?.innerText || document.body.innerText || '');

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  const fileInput = page.locator('.app-shell--studio input[type="file"]').first();

  // 1. Two PDFs through the composer's real file input: one with a text layer, one "scanned".
  await fileInput.setInputFiles([
    { name: 'rkv-bylaws.pdf', mimeType: 'application/pdf', buffer: buildMinimalPdf(`Registration number ${REGISTRATION}.`) },
    { name: 'scan.pdf', mimeType: 'application/pdf', buffer: buildMinimalPdf('') },
  ]);
  for (const name of ['rkv-bylaws.pdf', 'scan.pdf']) {
    const chip = page.locator(`[data-quantora-attachment-chip="${name}"]`).first();
    await visible(chip, `The composer never showed ${name} as a chip.`);
    const kind = await chip.getAttribute('data-quantora-attachment-kind');
    if (kind !== 'document') throw new Error(`The composer took ${name} as "${kind}", not as a document — it would be dropped at send.`);
  }

  await prompt.fill('What is the registration number in the attached bylaws?');
  await prompt.press('Enter');
  await page.waitForFunction((needle) => (document.body.innerText || '').includes(needle), REGISTRATION, { timeout: 20_000 });

  // 2. The request carried both documents, as documents, intact.
  if (chatBodies.length !== 1) throw new Error(`Expected exactly one chat call; saw ${chatBodies.length}.`);
  const sent = chatBodies[0].attachedDocuments;
  if (!Array.isArray(sent) || sent.length !== 2) throw new Error(`The request carried ${Array.isArray(sent) ? sent.length : 'no'} documents; expected 2 — the send path dropped them.`);
  if (sent.map((d) => d.name).join(',') !== 'rkv-bylaws.pdf,scan.pdf') throw new Error(`Documents arrived as ${sent.map((d) => d.name).join(',')}.`);
  for (const doc of sent) {
    if (!String(doc.dataUrl || '').startsWith('data:application/pdf;base64,')) throw new Error(`${doc.name} did not travel as a base64 PDF data URL.`);
    const head = Buffer.from(String(doc.dataUrl).split(',')[1] || '', 'base64').subarray(0, 4).toString('latin1');
    if (head !== '%PDF') throw new Error(`${doc.name} arrived corrupted (starts with ${JSON.stringify(head)}).`);
  }
  if ((chatBodies[0].attachedImages || []).length) throw new Error('A PDF was sent as an image.');
  const afterSend = await transcript();
  if (/could not send|not a readable image/i.test(afterSend)) throw new Error('The desk excluded a document it should have sent — the 2026-09-05 copy is back.');

  // 3. The desk publishes the server's account: 1 of 2 read, and names the one it could not.
  const reads = page.locator('[data-quantora-document-reads]').last();
  await visible(reads, 'The desk never published what was read of the attached documents.');
  const ratio = await reads.getAttribute('data-quantora-document-reads');
  if (ratio !== '1/2') throw new Error(`Expected the desk to publish 1/2 documents read; it published ${JSON.stringify(ratio)}.`);
  const note = page.locator('[data-quantora-document-note="true"]').last();
  await visible(note, 'The unreadable document was not named on the desk.');
  const noteText = (await note.innerText()).trim();
  if (!/scan\.pdf/.test(noteText) || !/no text layer/.test(noteText)) throw new Error(`The document note does not name the scan or why: ${JSON.stringify(noteText)}.`);

  // 4. A type nothing reads is refused honestly, by name, without calling it an image.
  await fileInput.setInputFiles([{ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) }]);
  const exeChip = page.locator('[data-quantora-attachment-chip="setup.exe"]').first();
  await visible(exeChip, 'The composer never showed setup.exe as a chip.');
  await prompt.fill('And this one?');
  await prompt.press('Enter');
  await page.waitForFunction(() => /could not send/i.test(document.body.innerText || ''), null, { timeout: 15_000 });
  const afterExe = await transcript();
  if (/not a readable image/i.test(afterExe)) throw new Error('An unsupported file was called "not a readable image" again.');
  if (!/PDFs, Word, Excel/.test(afterExe)) throw new Error('The refusal does not say what Quantora can read.');
  if (chatBodies.length !== 2) throw new Error(`Expected the second turn to go ahead; chat calls: ${chatBodies.length}.`);
  // 5. The documents stay with the conversation: turn two carries both PDFs
  //    (marked as carried), never the .exe.
  const carried = chatBodies[1].attachedDocuments || [];
  if (carried.map((d) => d.name).join(',') !== 'rkv-bylaws.pdf,scan.pdf') throw new Error(`Turn two carried ${JSON.stringify(carried.map((d) => d.name))}; the build turn after the designer's question would have no documents.`);
  if (!carried.every((d) => d.carried === true)) throw new Error('Carried documents are not marked as carried.');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/attachments.png', fullPage: true });
  console.log('attachments browser gate passed — two PDFs travelled as documents, the desk published 1/2 read and named the scan, an .exe was refused by name, and the next turn still carried both PDFs.');
  await browser.close();
  process.exit(0);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/attachments-failure.png', fullPage: true }).catch(() => {});
  console.error(`attachments browser gate FAILED: ${error?.message || error}`);
  await browser.close().catch(() => {});
  process.exit(1);
}
