import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeOfficeArtifactKind,
  activeOfficeBriefingKind,
  countOfficeBriefSignals,
  officeBriefingContext,
  shouldGenerateOfficeNow,
  OFFICE_CONTINUE_VALUE,
  shouldRevealOfficeNow,
} from './office-briefing.js';

async function withFetchResult(payload, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => payload });
  try { return await fn(); } finally { globalThis.fetch = previous; }
}

test('a generic first-turn presentation request does not bypass human briefing', async () => {
  const result = await withFetchResult({ office: { action: 'create', kind: 'powerpoint', skipBriefing: false, confidence: 0.99 } }, () => shouldGenerateOfficeNow({
    text: 'Make me a presentation about cyber resilience',
    officeKind: 'powerpoint',
    messages: [],
  }));
  assert.equal(result, false);
});

test('semantic intent can deliberately fast-track a first-turn Office build', async () => {
  const result = await withFetchResult({ office: { action: 'create', kind: 'powerpoint', skipBriefing: true, confidence: 0.99 } }, () => shouldGenerateOfficeNow({
    text: 'Build immediately without discovery',
    officeKind: 'powerpoint',
    messages: [],
  }));
  assert.equal(result, true);
});

test('a fully specified first-turn brief still gets one human approval checkpoint', async () => {
  const text = 'As a senior project manager, prepare a QBR for the CIO and executive leadership to secure approval. Use the attached KPIs and financial data.';
  assert.ok(countOfficeBriefSignals(text) >= 5);
  const result = await withFetchResult({ office: { action: 'create', kind: 'powerpoint', skipBriefing: false, confidence: 0.99 } }, () => shouldGenerateOfficeNow({ text, officeKind: 'powerpoint', messages: [] }));
  assert.equal(result, false);
});

test('Continue UI value deterministically hands the approved briefing to Office generation', async () => {
  const messages = [
    { sender: 'ai', text: 'Brief approved?', officeBriefing: true, officeBriefingKind: 'powerpoint' },
  ];
  assert.equal(activeOfficeBriefingKind(messages), 'powerpoint');
  assert.equal(await shouldGenerateOfficeNow({
    text: OFFICE_CONTINUE_VALUE,
    officeKind: null,
    messages,
  }), true);
});

test('Generate the PPT now after briefing goes to Office generation without the classifier', async () => {
  const messages = [
    { sender: 'ai', text: 'If this looks right, choose Continue below.', officeBriefing: true, officeBriefingKind: 'powerpoint' },
  ];
  assert.equal(await shouldGenerateOfficeNow({
    text: 'Generate the PPT now',
    officeKind: 'powerpoint',
    messages,
  }), true);
});

test('download and show requests reopen an existing Office file instead of chatting', async () => {
  const messages = [{
    sender: 'ai',
    officeAttachment: {
      kind: 'powerpoint',
      fileName: 'deck.pptx',
      spec: { version: 2, title: 'Deck', slides: [] },
      htmlPreview: '<html>deck</html>',
      verification: { passed: true, previewFingerprint: 'abc12345' },
    },
  }];
  assert.equal(shouldRevealOfficeNow({ text: 'can you create a downloadable link', messages }), true);
  assert.equal(await shouldGenerateOfficeNow({ text: 'can you create a downloadable link', messages }), false);
  assert.equal(shouldRevealOfficeNow({ text: 'Generate the PPT now', messages }), true);
});

test('verified artifact closes briefing and semantic refinement routes directly to generation', async () => {
  const messages = [
    { sender: 'ai', text: 'Brief', officeBriefing: true, officeBriefingKind: 'powerpoint' },
    {
      sender: 'ai',
      text: 'Generated',
      officeAttachment: {
        kind: 'powerpoint',
        fileName: 'deck.pptx',
        spec: { version: 2, title: 'Deck', slides: [] },
        htmlPreview: '<html>deck</html>',
        verification: { passed: true, previewFingerprint: 'abc12345' },
      },
    },
  ];
  assert.equal(activeOfficeBriefingKind(messages), null);
  assert.equal(activeOfficeArtifactKind(messages), 'powerpoint');
  assert.equal(officeBriefingContext({ text: 'Please correct the wording across the deck', messages }), null);
  const result = await withFetchResult({ office: { action: 'refine', kind: 'powerpoint', skipBriefing: false, confidence: 0.99 } }, () => shouldGenerateOfficeNow({
    text: 'Please correct the wording across the deck',
    messages,
  }));
  assert.equal(result, true);
});

test('discussion about an active artifact does not silently rewrite it', async () => {
  const messages = [{
    sender: 'ai',
    officeAttachment: {
      kind: 'powerpoint',
      fileName: 'deck.pptx',
      spec: { version: 2, title: 'Deck', slides: [] },
      htmlPreview: '<html>deck</html>',
      verification: { passed: true, previewFingerprint: 'abc12345' },
    },
  }];
  const result = await withFetchResult({ office: { action: 'discuss', kind: 'powerpoint', skipBriefing: false, confidence: 0.98 } }, () => shouldGenerateOfficeNow({
    text: 'Why did you choose this structure?',
    messages,
  }));
  assert.equal(result, false);
});

test('completed briefing instructs the active chat UI to render one direct Continue action', () => {
  const prompt = officeBriefingContext({
    text: 'I need a PowerPoint presentation for a CIO business case',
    officeKind: 'powerpoint',
    messages: [],
    sessionContext: { facts: ['I am a senior project manager'] },
  });
  assert.ok(prompt);
  assert.match(prompt, /<quantora-modal>/);
  assert.match(prompt, /"direct":true/);
  assert.match(prompt, /"title":"Continue"/);
  assert.match(prompt, new RegExp(`"value":"${OFFICE_CONTINUE_VALUE}"`));
  assert.match(prompt, /Do NOT ask the user to type an approval phrase/);
  assert.match(prompt, /user must see only the Continue action/);
});

test('briefing prompt masks user Office trigger words while preserving the briefing contract', () => {
  const prompt = officeBriefingContext({
    text: 'I need a PowerPoint presentation for a CIO business case',
    officeKind: 'powerpoint',
    messages: [],
    sessionContext: { facts: ['I am a senior project manager'] },
  });
  assert.ok(prompt);
  assert.match(prompt, /CIO\/board\/executive/);
  assert.match(prompt, /Ask exactly ONE highest-value question/);
  assert.match(prompt, /Analytical workbook\/model/);
  assert.match(prompt, /Current user message: I need a requested artifact for a CIO business case/);
});
