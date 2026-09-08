#!/usr/bin/env node
/**
 * Attachments travel through the real composer/send path, stay honest when a
 * source cannot be read, and preserve only bounded conversation context.
 *
 * THE DOCUMENT INCIDENT (2026-09-05). Four association documents — bylaws, a
 * scanned registration certificate, a member form, a spreadsheet — were
 * attached to one chat turn. The browser dropped every one as "(not a readable
 * image)" and the model, told nothing about files it never received, asked the
 * user how to get them. No gate had ever attached a file.
 *
 * THE IMAGE FOLLOW-UP GAP (2026-09-08). A photographed assessment or worked
 * solution reached vision on the turn where it was uploaded, but the pixels
 * disappeared on the very next question. Conversation text survived; the
 * source image did not. A learner could ask "where did I go wrong?" once, then
 * "why is step 3 wrong?" was answered without the working in view.
 *
 * Deterministic, no model: the backend is a stub that records exactly what the
 * request carried. What only this gate can catch:
 *   1. a Study image reaching /api/chat as vision input;
 *   2. the same pixels surviving a follow-up with no re-upload;
 *   3. carried pixels staying transport-only rather than duplicating UI chips;
 *   4. fresh PDFs replacing carried image context;
 *   5. documents travelling as documents and publishing what was read;
 *   6. an unsupported fresh source clearing old context instead of falling back.
 */
import process from 'node:process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { enterSignedInStudio } from './e2e-enter-studio.mjs';
import { buildMinimalPdf } from './lib/minimal-pdf.mjs';

const BASE_URL = process.env.QUANTORA_E2E_BASE_URL || 'http://127.0.0.1:4173';
const REGISTRATION = 'RKV-2019-0417';
const WORKING_IMAGE_NAME = 'assessment-working.png';
const IMAGE_FOLLOW_UP_REPLY = 'I still have the original working in view.';
const DOCUMENT_FOLLOW_UP_REPLY = 'I still have the bylaws in this conversation.';
// Valid 1×1 PNG. The gate cares about the browser's real FileReader/data-URL
// path, not image semantics; the synthetic backend proves exactly what travelled.
const WORKING_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const chatBodies = [];

function sseBody(text, attachments = []) {
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
  localStorage.removeItem('quantora_active_specialist_domain');
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
    const images = Array.isArray(body.attachedImages) ? body.attachedImages : [];
    const documents = Array.isArray(body.attachedDocuments) ? body.attachedDocuments : [];

    const attachments = documents.map((doc) => (doc.name === 'scan.pdf'
      ? { name: doc.name, kind: 'pdf', ok: false, detail: 'no text layer — this looks like a scanned image, and Quantora cannot OCR it yet', reason: 'source_pdf_empty', chars: 0 }
      : { name: doc.name, kind: 'pdf', ok: true, detail: '1 pages · 118 characters', chars: 118, pages: 1 }));

    let text = 'I received no readable attachment context with this message.';
    if (images.length) {
      text = chatBodies.length === 1
        ? 'I can see the attached working. The sign changes at step 3.'
        : `${IMAGE_FOLLOW_UP_REPLY} The sign changes at step 3.`;
    }
    if (documents.length) {
      text = documents.every((doc) => doc.carried === true)
        ? `${DOCUMENT_FOLLOW_UP_REPLY} The registration number remains ${REGISTRATION}.`
        : `The registration number in the attached bylaws is ${REGISTRATION}.`;
    }

    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: sseBody(text, attachments) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [], sessions: [], ok: true }) });
});

async function visible(locator, message, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch(() => {});
  if (!(await locator.isVisible().catch(() => false))) throw new Error(message);
}
const transcript = () => page.evaluate(() => document.querySelector('.app-shell--studio')?.innerText || document.body.innerText || '');
const waitForChatCount = async (count) => {
  const started = Date.now();
  while (chatBodies.length < count && Date.now() - started < 20_000) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (chatBodies.length < count) throw new Error(`Expected ${count} chat calls; saw ${chatBodies.length}.`);
};

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await enterSignedInStudio(page);

  // Enter Study explicitly: this is the learner journey the vision continuity
  // contract exists to protect.
  const study = page.locator('[data-quantora-advisor="education"]').first();
  await visible(study, 'Study Tutor is missing from the Agentic Workspace sidebar.');
  await study.click();
  await page.waitForFunction(() => document.documentElement.dataset.quantoraDomain === 'education');

  const prompt = page.locator('.app-shell--studio textarea').first();
  await visible(prompt, 'Studio prompt input is missing.');
  const fileInput = page.locator('.app-shell--studio input[type="file"]').first();

  // 1. A real PNG travels from the composer's file input into the Study vision request.
  await fileInput.setInputFiles([{ name: WORKING_IMAGE_NAME, mimeType: 'image/png', buffer: WORKING_PNG }]);
  const imageChip = page.locator(`[data-quantora-attachment-chip="${WORKING_IMAGE_NAME}"]`).first();
  await visible(imageChip, 'The Study composer never showed the assessment image as a chip.');
  const imageKind = await imageChip.getAttribute('data-quantora-attachment-kind');
  if (imageKind !== 'image') throw new Error(`The Study composer classified the PNG as ${JSON.stringify(imageKind)}, not image.`);

  await prompt.fill('This is my working. Where did I go wrong?');
  await prompt.press('Enter');
  await page.waitForFunction(() => /I can see the attached working/i.test(document.body.innerText || ''), null, { timeout: 20_000 });
  await waitForChatCount(1);

  const firstImageTurn = chatBodies[0];
  if (firstImageTurn.studioDomain !== 'education') throw new Error(`The image turn left Study and routed as ${JSON.stringify(firstImageTurn.studioDomain)}.`);
  if (!Array.isArray(firstImageTurn.attachedImages) || firstImageTurn.attachedImages.length !== 1) throw new Error('The first Study image turn did not carry exactly one image.');
  if (!String(firstImageTurn.attachedImages[0]).startsWith('data:image/png;base64,')) throw new Error('The PNG did not travel as an image data URL.');
  if ((firstImageTurn.attachedDocuments || []).length) throw new Error('The PNG was also sent as a document.');
  const originalPixels = firstImageTurn.attachedImages[0];

  // 2. Natural follow-up: no re-upload, but the same pixels must still reach vision.
  await prompt.fill('Why is step 3 wrong?');
  await prompt.press('Enter');
  await waitForChatCount(2);
  await page.waitForFunction((needle) => (document.body.innerText || '').includes(needle), IMAGE_FOLLOW_UP_REPLY, { timeout: 20_000 });
  const imageFollowUp = chatBodies[1];
  if (!Array.isArray(imageFollowUp.attachedImages) || imageFollowUp.attachedImages.length !== 1) throw new Error('The Study follow-up lost the assessment image.');
  if (imageFollowUp.attachedImages[0] !== originalPixels) throw new Error('The Study follow-up did not receive the same original image pixels.');
  if ((imageFollowUp.attachedDocuments || []).length) throw new Error('Document carry competed with the active image context.');

  // Carried pixels are transport context only. The original upload appears once
  // in the visible transcript; the follow-up must not manufacture another chip.
  const afterImageFollowUp = await transcript();
  const visibleImageNames = afterImageFollowUp.match(new RegExp(WORKING_IMAGE_NAME.replace('.', '\\.'), 'g')) || [];
  if (visibleImageNames.length !== 1) throw new Error(`Carried image context rendered ${visibleImageNames.length} visible attachment names instead of exactly one original upload.`);

  // 3. Fresh PDFs replace the carried image context. One has a text layer; one
  // is a scan, preserving the existing OCR-honesty regression.
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
  await waitForChatCount(3);

  const pdfTurn = chatBodies[2];
  const sent = pdfTurn.attachedDocuments;
  if (!Array.isArray(sent) || sent.length !== 2) throw new Error(`The request carried ${Array.isArray(sent) ? sent.length : 'no'} documents; expected 2 — the send path dropped them.`);
  if (sent.map((d) => d.name).join(',') !== 'rkv-bylaws.pdf,scan.pdf') throw new Error(`Documents arrived as ${sent.map((d) => d.name).join(',')}.`);
  for (const doc of sent) {
    if (!String(doc.dataUrl || '').startsWith('data:application/pdf;base64,')) throw new Error(`${doc.name} did not travel as a base64 PDF data URL.`);
    const head = Buffer.from(String(doc.dataUrl).split(',')[1] || '', 'base64').subarray(0, 4).toString('latin1');
    if (head !== '%PDF') throw new Error(`${doc.name} arrived corrupted (starts with ${JSON.stringify(head)}).`);
  }
  if ((pdfTurn.attachedImages || []).length) throw new Error('Fresh PDFs did not replace the carried image context.');
  const afterPdfSend = await transcript();
  if (/not a readable image/i.test(afterPdfSend)) throw new Error('The desk called a document an unreadable image — the 2026-09-05 copy is back.');

  // 4. The desk publishes the server's account: 1 of 2 read, and names the scan.
  const reads = page.locator('[data-quantora-document-reads]').last();
  await visible(reads, 'The desk never published what was read of the attached documents.');
  const ratio = await reads.getAttribute('data-quantora-document-reads');
  if (ratio !== '1/2') throw new Error(`Expected the desk to publish 1/2 documents read; it published ${JSON.stringify(ratio)}.`);
  const note = page.locator('[data-quantora-document-note="true"]').last();
  await visible(note, 'The unreadable document was not named on the desk.');
  const noteText = (await note.innerText()).trim();
  if (!/scan\.pdf/.test(noteText) || !/no text layer/.test(noteText)) throw new Error(`The document note does not name the scan or why: ${JSON.stringify(noteText)}.`);

  // 5. Documents still carry on an ordinary follow-up when no newer source arrives.
  await prompt.fill('What else do the bylaws say?');
  await prompt.press('Enter');
  await waitForChatCount(4);
  await page.waitForFunction((needle) => (document.body.innerText || '').includes(needle), DOCUMENT_FOLLOW_UP_REPLY, { timeout: 20_000 });
  const documentFollowUp = chatBodies[3];
  const carried = documentFollowUp.attachedDocuments || [];
  if (carried.map((d) => d.name).join(',') !== 'rkv-bylaws.pdf,scan.pdf') throw new Error(`Document follow-up carried ${JSON.stringify(carried.map((d) => d.name))}; expected both PDFs.`);
  if (!carried.every((d) => d.carried === true)) throw new Error('Carried documents are not marked as carried.');
  if ((documentFollowUp.attachedImages || []).length) throw new Error('Expired/replaced image context resurfaced after the PDF turn.');

  // 6. A type nothing reads is refused honestly. Because it is a NEW source,
  // old carried PDFs must also be cleared rather than substituted underneath it.
  await fileInput.setInputFiles([{ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) }]);
  const exeChip = page.locator('[data-quantora-attachment-chip="setup.exe"]').first();
  await visible(exeChip, 'The composer never showed setup.exe as a chip.');
  await prompt.fill('And this one?');
  await prompt.press('Enter');
  await page.waitForFunction(() => /could not send/i.test(document.body.innerText || ''), null, { timeout: 15_000 });
  await waitForChatCount(5);
  const afterExe = await transcript();
  if (/not a readable image/i.test(afterExe)) throw new Error('An unsupported file was called "not a readable image" again.');
  if (!/PDFs, Word, Excel/.test(afterExe)) throw new Error('The refusal does not say what Quantora can read.');
  const refusedTurn = chatBodies[4];
  if ((refusedTurn.attachedDocuments || []).length || (refusedTurn.attachedImages || []).length) throw new Error('A refused fresh source silently fell back to older carried attachment context.');

  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/attachments.png', fullPage: true });
  console.log('attachments browser gate passed — Study image pixels survived a no-reupload follow-up without duplicate UI, fresh PDFs replaced the image, document carry remained intact, the scan stayed honestly unreadable, and a refused fresh source cleared stale context.');
  await browser.close();
  process.exit(0);
} catch (error) {
  mkdirSync('artifacts/e2e', { recursive: true });
  await page.screenshot({ path: 'artifacts/e2e/attachments-failure.png', fullPage: true }).catch(() => {});
  console.error(`attachments browser gate FAILED: ${error?.message || error}`);
  await browser.close().catch(() => {});
  process.exit(1);
}
