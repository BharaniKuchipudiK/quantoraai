import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeOfficeBriefingKind,
  countOfficeBriefSignals,
  officeBriefingContext,
  shouldGenerateOfficeNow,
} from './office-briefing.js';

test('a generic first-turn presentation request does not bypass human briefing', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'Make me a presentation about cyber resilience',
    officeKind: 'powerpoint',
    messages: [],
  }), false);
});

test('a deliberately fast-tracked request can bypass briefing', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'Just build it now and use reasonable assumptions',
    officeKind: 'powerpoint',
    messages: [],
  }), true);
});

test('a fully specified first-turn brief still gets one human approval checkpoint', () => {
  const text = 'As a senior project manager, prepare a QBR for the CIO and executive leadership to secure approval. Use the attached KPIs and financial data.';
  assert.ok(countOfficeBriefSignals(text) >= 5);
  assert.equal(shouldGenerateOfficeNow({ text, officeKind: 'powerpoint', messages: [] }), false);
});

test('briefing approval on a later turn inherits the artifact kind', () => {
  const messages = [
    { sender: 'ai', text: 'Who is the audience?', officeBriefing: true, officeBriefingKind: 'powerpoint' },
  ];
  assert.equal(activeOfficeBriefingKind(messages), 'powerpoint');
  assert.equal(shouldGenerateOfficeNow({
    text: 'Build the requested artifact now using this approved briefing context',
    officeKind: null,
    messages,
  }), true);
});

test('briefing prompt is isolated from immediate Office generator trigger words', () => {
  const prompt = officeBriefingContext({
    text: 'I need a PowerPoint presentation for a CIO business case',
    officeKind: 'powerpoint',
    messages: [],
    sessionContext: { facts: ['I am a senior project manager'] },
  });
  assert.ok(prompt);
  assert.doesNotMatch(prompt, /\b(powerpoint|pptx?|slide deck|slides?|presentation|slideshow|excel|xlsx?|spreadsheet|worksheet|docx?)\b/i);
  assert.match(prompt, /CIO\/board\/executive/);
  assert.match(prompt, /Ask exactly ONE highest-value question/);
  assert.match(prompt, /Analytical workbook\/model/);
});
