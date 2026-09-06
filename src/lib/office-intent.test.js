import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFICE_KIND,
  clearOfficeToolSelection,
  detectOfficeIntent,
  officeKindFromTool,
  isPresentationIntent,
  rememberOfficeToolSelection,
  sanitizeOfficeFilename,
  looksLikeWebBuildRequest,
  webBuildOutranksOfficeNoun,
} from './office-intent.js';

test('explicit tool selection wins over text', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ selectedTool: 'Excel', messages: [{ sender: 'user', text: 'a slide deck' }] }), OFFICE_KIND.EXCEL);
  assert.equal(officeKindFromTool('PowerPoint'), OFFICE_KIND.POWERPOINT);
  assert.equal(officeKindFromTool('nonsense'), null);
});

test('Tools-menu Office choice survives a completely rewritten prompt exactly once', () => {
  clearOfficeToolSelection();
  assert.equal(rememberOfficeToolSelection('PowerPoint'), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Should we build an AI travel agent?' }] }), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Should we build an AI travel agent?' }] }), null);
});

test('selecting a non-Office tool clears stale Office intent', () => {
  rememberOfficeToolSelection('PowerPoint');
  rememberOfficeToolSelection('Search');
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'AI travel agents' }] }), null);
});

test('detects each kind from user text', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'Make a PowerPoint about Mars' }] }), OFFICE_KIND.POWERPOINT);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'build me a spreadsheet of expenses' }] }), OFFICE_KIND.EXCEL);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'draft a word document' }] }), OFFICE_KIND.WORD);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'generate a PDF summary' }] }), OFFICE_KIND.PDF);
});

test('does NOT false-positive on non-office uses of similar words', () => {
  clearOfficeToolSelection();
  // "sundeck" / "deck of the boat" must not read as a slide deck.
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'a landing page for a sundeck furniture shop' }] }), null);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'photos of the deck of the boat' }] }), null);
});

test('only user turns count, not assistant echoes', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'ai', text: 'here is your powerpoint' }] }), null);
});

test('sanitizeOfficeFilename strips extension/path/unsafe chars', () => {
  assert.equal(sanitizeOfficeFilename('My Deck.pptx'), 'My Deck');
  assert.equal(sanitizeOfficeFilename('../../etc/passwd'), 'etc passwd');
  assert.equal(sanitizeOfficeFilename(''), 'quantora-document');
  assert.equal(sanitizeOfficeFilename('', 'fallback-x'), 'fallback-x');
});

test('a later web build cancels an earlier Office intent (PPTX hijack)', () => {
  clearOfficeToolSelection();
  // Reproduces the reported failure: one "presentation" early in a thread made
  // every later turn a PowerPoint turn, so a website request was compiled as a
  // deck ("this is not a website and must not be published to Vercel").
  const messages = [
    { sender: 'user', text: 'Make a presentation about our roadmap' },
    { sender: 'ai', text: 'Here is your deck' },
    { sender: 'user', text: 'Design a complete e-commerce website architecture and frontend layout for a handloom boutique' },
  ];
  assert.equal(detectOfficeIntent({ messages }), null);
  assert.equal(isPresentationIntent(messages), false);
});

test('Office intent survives a briefing follow-up that names no artifact', () => {
  clearOfficeToolSelection();
  const messages = [
    { sender: 'user', text: 'Make a presentation about climate' },
    { sender: 'ai', text: 'Which regions should I cover?' },
    { sender: 'user', text: 'Focus on South Asia, keep it to eight slides' },
  ];
  assert.equal(detectOfficeIntent({ messages }), OFFICE_KIND.POWERPOINT);
});

test('Office intent does not persist beyond the lookback window', () => {
  clearOfficeToolSelection();
  const messages = [
    { sender: 'user', text: 'Make a presentation about climate' },
    { sender: 'user', text: 'ok' },
    { sender: 'user', text: 'sure' },
    { sender: 'user', text: 'thanks' },
    { sender: 'user', text: 'now something else entirely' },
  ];
  assert.equal(detectOfficeIntent({ messages }), null);
});

test('an explicit artifact noun still wins inside one message', () => {
  clearOfficeToolSelection();
  assert.equal(
    detectOfficeIntent({ messages: [{ sender: 'user', text: 'a presentation about our website' }] }),
    OFFICE_KIND.POWERPOINT,
  );
});

test('looksLikeWebBuildRequest identifies web asks, not Office asks', () => {
  assert.equal(looksLikeWebBuildRequest('build a one-page site for a coffee shop'), true);
  assert.equal(looksLikeWebBuildRequest('a landing page for Nimbus'), true);
  assert.equal(looksLikeWebBuildRequest('make a presentation about Mars'), false);
});

/*
 * 2026-09-06: this exact brief was routed to the Excel generator, which ran to
 * the platform's time limit and blamed the brief. The website is the ask;
 * "excel format" is the look of a form. With the word-first rule restored,
 * the first assertion fails with 'excel'.
 */
const WELFARE_SITE_BRIEF = 'I want to build a website for Ramakrishna Venuzia Owners Welfare association. this website will act as a single point of information for all things happening for this Welfare association. I have attached the documents. please go through to get more context and understanding. We need to have multi page website We can think of authentication later.. but for now create a multi-page website Section for Downloads Section for Entering Payment details.. when the users select this option, the webpage must imitate the same excel format and allow the users to enter the information. This how to design with the best navigation and UX experience';

test('a website brief that borrows "excel format" for a form is a web build, not an Excel file', () => {
  clearOfficeToolSelection();
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: WELFARE_SITE_BRIEF }] }), null);
  assert.equal(webBuildOutranksOfficeNoun(WELFARE_SITE_BRIEF), true);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'make the payment page look like the attached spreadsheet' }] }), null);
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'build a landing page with a pricing table in excel style' }] }), null);
});

test('the Office noun still wins when it is the object of its own ask', () => {
  clearOfficeToolSelection();
  // The website is the topic, the presentation is the ask (unchanged).
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'a presentation about our website' }] }), OFFICE_KIND.POWERPOINT);
  // Two asks in one breath: the Office noun is not a descriptor, so it keeps its turn.
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'build a website and also create an excel sheet of all members' }] }), OFFICE_KIND.EXCEL);
  // A descriptor without a web build is still an Office ask.
  assert.equal(detectOfficeIntent({ messages: [{ sender: 'user', text: 'export the members list in excel format' }] }), OFFICE_KIND.EXCEL);
  assert.equal(webBuildOutranksOfficeNoun('export the members list in excel format'), false);
});
