import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOfficeIntent } from './office-intent.js';
import {
  activeOfficeBriefingKind,
  countOfficeBriefSignals,
  officeBriefingContext,
  shouldGenerateOfficeNow,
} from './office-briefing.js';

test('an explicit first-turn presentation creation request generates immediately', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'Make me a presentation about cyber resilience',
    officeKind: 'powerpoint',
    messages: [],
  }), true);
});

test('prepare a PowerPoint is treated as direct generation authorization', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'Please prepare a PowerPoint presentation.',
    officeKind: 'powerpoint',
    messages: [],
  }), true);
});

test('the exact production screenshot phrase routes directly to PowerPoint generation', () => {
  const text = 'Prepare PowerPoint Presentation on blah blah blah.';
  const officeKind = detectOfficeIntent({ messages: [{ sender: 'user', text }] });
  assert.equal(officeKind, 'powerpoint');
  assert.equal(shouldGenerateOfficeNow({ text, officeKind, messages: [] }), true);
});

test('develop a presentation and request PowerPoint output generates immediately', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'Help me develop a consulting grade presentation on Quantum Computing in 2030 and give me the output in a PowerPoint presentation as a report',
    officeKind: 'powerpoint',
    messages: [],
  }), true);
});

test('polite command variants generate immediately', () => {
  for (const text of [
    'Can you please create a PowerPoint presentation on cloud security?',
    'I want you to generate an Excel workbook for this budget.',
    'Please draft a Word document summarizing the findings.',
  ]) {
    const officeKind = detectOfficeIntent({ messages: [{ sender: 'user', text }] });
    assert.ok(officeKind);
    assert.equal(shouldGenerateOfficeNow({ text, officeKind, messages: [] }), true, text);
  }
});

test('meta questions and negated commands do not trigger artifact generation', () => {
  for (const text of [
    'Explain how to create a PowerPoint presentation.',
    'How do I make a good PowerPoint presentation?',
    "Don't create a PowerPoint presentation yet.",
    'Can you not generate the PowerPoint yet?',
  ]) {
    const officeKind = detectOfficeIntent({ messages: [{ sender: 'user', text }] });
    assert.equal(officeKind, 'powerpoint');
    assert.equal(shouldGenerateOfficeNow({ text, officeKind, messages: [] }), false, text);
  }
});

test('a non-creation statement can still enter briefing instead of compiling immediately', () => {
  assert.equal(shouldGenerateOfficeNow({
    text: 'I need a presentation about cyber resilience',
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

test('a fully specified direct creation brief generates without a redundant approval checkpoint', () => {
  const text = 'As a senior project manager, prepare a QBR presentation for the CIO and executive leadership to secure approval. Use the attached KPIs and financial data.';
  assert.ok(countOfficeBriefSignals(text) >= 5);
  assert.equal(shouldGenerateOfficeNow({ text, officeKind: 'powerpoint', messages: [] }), true);
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

test('prepare it after a briefing is treated as approval', () => {
  const messages = [
    { sender: 'ai', text: 'Here is the inferred brief.', officeBriefing: true, officeBriefingKind: 'powerpoint' },
  ];
  assert.equal(shouldGenerateOfficeNow({
    text: 'Yes, prepare it.',
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
