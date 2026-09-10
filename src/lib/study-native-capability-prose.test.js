import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stripFalseNativeCapabilityDenial } from './study-native-capability-prose.js';

const route = (rendererKind = 'circuit-lab', overrides = {}) => ({ representation: {
  rendererRequired: true,
  primaryRepresentation: 'simulation_or_lab',
  fallback: 'none',
  rendererKind,
  ...overrides,
} });

const screenshotDenial = "I understand you're looking for an animation to visualize electric circuits, but unfortunately, I can't create or display animations directly here. However, I can guide you to some excellent resources where you can find animations and interactive simulations.";

test('[was-red] a delivered native circuit removes the exact contradictory screenshot copy', () => {
  const shown = stripFalseNativeCapabilityDenial(
    `<quantora-study-lab kind="simple-dc-circuit" />\n\n${screenshotDenial}\n\nUse Open return wire to test your prediction.`,
    route(),
  );

  assert.doesNotMatch(shown, /can't create or display animations|excellent resources|find animations/i);
  assert.match(shown, /quantora-study-lab kind="simple-dc-circuit"/);
  assert.match(shown, /Use Open return wire to test your prediction/);
});

test('preambles, multiple capability verbs and video/canvas wording are removed', () => {
  for (const denial of [
    'Unfortunately, I cannot run a live video or interactive simulation directly inside this text desk, but picture two skaters pushing apart.',
    "I can't play dynamic video or run an interactive canvas right here in our chat, but we can break the action into still frames.",
    "I understand the request, but I can't create or display animations directly here. Instead, I can point you to websites with interactive simulations.",
  ]) {
    assert.equal(stripFalseNativeCapabilityDenial(denial, route('newton-lab')), '');
  }
});

test('only a real supported native-lab route may suppress capability prose', () => {
  for (const routing of [
    null,
    route('invented-renderer'),
    route('__proto__'),
    route('constructor'),
    route('circuit-lab', { rendererRequired: false }),
    route('circuit-lab', { rendererRequired: 'true' }),
    route('circuit-lab', { fallback: 'renderer_unavailable' }),
    route('circuit-lab', { primaryRepresentation: 'concise_text' }),
  ]) {
    assert.equal(stripFalseNativeCapabilityDenial(screenshotDenial, routing), screenshotDenial);
  }
});

test('scientific limitations, fenced code, indented code and quotations stay untouched', () => {
  const scientific = 'I cannot simulate electromagnetic propagation with this steady-state model.';
  const fenced = `\`\`\`text\n${screenshotDenial}\n\`\`\``;
  const indented = `    ${screenshotDenial}`;
  const quoted = `> ${screenshotDenial}`;

  for (const source of [scientific, fenced, indented, quoted]) {
    assert.equal(stripFalseNativeCapabilityDenial(source, route()), source);
  }
});

test('StudyMarkdown applies the truth guard to the routed response before polishing and rendering', () => {
  const markdown = readFileSync(new URL('../components/StudyMarkdown.jsx', import.meta.url), 'utf8');
  assert.match(markdown, /stripFalseNativeCapabilityDenial\(\s*enforceStudyRendererContract\(text, studyRouting\),\s*studyRouting,\s*\)/s);
});
