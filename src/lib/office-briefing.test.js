import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeOfficeBriefingKind,
  countOfficeBriefSignals,
  officeBriefingContext,
  shouldGenerateOfficeNow,
} from './office-briefing.js';
import { extractContinuesFromAssistantText } from './studio-continues.js';

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

test('Continue UI value hands the approved briefing to Office generation', () => {
  const messages = [
    { sender: 'ai', text: 'Brief approved?', officeBriefing: true, officeBriefingKind: 'powerpoint' },
  ];
  const continueValue = 'Build the requested artifact now using this approved briefing context';
  assert.equal(activeOfficeBriefingKind(messages), 'powerpoint');
  assert.equal(shouldGenerateOfficeNow({
    text: continueValue,
    officeKind: null,
    messages,
  }), true);
});

test('completed briefing instructs the model to emit one visible Continue action', () => {
  const prompt = officeBriefingContext({
    text: 'I need a PowerPoint presentation for a CIO business case',
    officeKind: 'powerpoint',
    messages: [],
    sessionContext: { facts: ['I am a senior project manager'] },
  });
  assert.ok(prompt);
  assert.match(prompt, /"label":"Continue"/);
  assert.match(prompt, /"value":"Build the requested artifact now using this approved briefing context"/);
  assert.match(prompt, /quantora-continues/);
  assert.match(prompt, /Do NOT ask the user to type an approval phrase/);
});

test('the instructed Office marker parses into the Continue pill used by the chat UI', () => {
  const reply = 'If this looks right, choose Continue below.\n<!-- quantora-continues:{"prompt":"Ready to build?","items":[{"id":"office_continue","label":"Continue","value":"Build the requested artifact now using this approved briefing context"}]} -->';
  const parsed = extractContinuesFromAssistantText(reply);
  assert.equal(parsed.displayText, 'If this looks right, choose Continue below.');
  assert.deepEqual(parsed.continueSet, {
    prompt: 'Ready to build?',
    items: [{
      id: 'office_continue',
      label: 'Continue',
      value: 'Build the requested artifact now using this approved briefing context',
    }],
  });
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
