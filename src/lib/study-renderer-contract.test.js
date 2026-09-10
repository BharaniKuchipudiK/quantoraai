import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  decorateStudyMessage,
  enforceStudyRendererContract,
  splitStudySegments,
} from './study-pictures.js';

const routeFor = (rendererKind, overrides = {}) => ({ representation: {
  rendererRequired: true, primaryRepresentation: 'simulation_or_lab',
  rendererKind, fallback: 'none', ...overrides,
} });
function displayedLabs(text, topic, routing) {
  const enforced = enforceStudyRendererContract(text, routing);
  const decorated = decorateStudyMessage(enforced, topic, routing);
  return splitStudySegments(decorated, topic, routing).filter((part) => part.type === 'lab');
}
for (const [renderer, kind, originalTopic] of [
  ['newton-lab', 'newton-third-law', "Newton's third law of motion"],
  ['linear-function-lab', 'linear-function', 'Linear functions: slope and y-intercept'],
]) {
  test(`[was-red] ${renderer}: original message retains its routed lab after later topic changes`, () => {
    const routing = routeFor(renderer);
    const text = 'Explore the relationship using the controls below.';
    for (const topic of [originalTopic, 'Mitosis in a cell', 'Plan my study week', '']) {
      assert.deepEqual(displayedLabs(text, topic, routing), [{ type: 'lab', kind }]);
    }
  });
  test(`[was-red] ${renderer}: equivalent accepted tag spellings render once`, () => {
    for (const tag of [
      `<quantora-study-lab kind='${kind}' />`,
      `<quantora-study-lab kind="${kind}"/>`,
      `<QUANTORA-STUDY-LAB KIND = '${kind.toUpperCase()}' >`,
      `<quantora-study-lab data-x="example" kind='${kind}'/>`,
    ]) {
      assert.deepEqual(displayedLabs(`Try this.\n${tag}`, originalTopic, routeFor(renderer)), [{ type: 'lab', kind }]);
    }
  });
  test(`${renderer}: multiple duplicate tags and repeated enforcement are idempotent`, () => {
    const routing = routeFor(renderer);
    const source = `<quantora-study-lab kind='${kind}'/>\nObserve.\n<quantora-study-lab kind="${kind}" />`;
    const once = enforceStudyRendererContract(source, routing);
    assert.equal(enforceStudyRendererContract(once, routing), once);
    assert.deepEqual(displayedLabs(once, originalTopic, routing), [{ type: 'lab', kind }]);
    assert.match(once, /Observe\./);
  });
  test(`${renderer}: routed primary lab cannot be replaced by another model-selected lab`, () => {
    const source = '<quantora-study-lab kind="fbd" />\nNewton and linear functions are examples.';
    assert.deepEqual(displayedLabs(source, originalTopic, routeFor(renderer)), [{ type: 'lab', kind }]);
  });
}
test('missing, unavailable, non-required and unknown contracts never manufacture a lab', () => {
  for (const routing of [null, {}, routeFor('not-a-renderer'),
    routeFor('newton-lab', { rendererRequired: false }),
    routeFor('newton-lab', { rendererRequired: 'true' }),
    routeFor('newton-lab', { fallback: 'renderer_unavailable' }),
    routeFor('newton-lab', { primaryRepresentation: 'concise_text' })]) {
    assert.equal(enforceStudyRendererContract('Explain this.', routing), 'Explain this.');
    assert.deepEqual(displayedLabs('Explain this.', 'Biology', routing), []);
  }
});
test('without a server lab contract the existing cross-topic validation still applies', () => {
  assert.deepEqual(displayedLabs('<quantora-study-lab kind="newton-third-law" />', 'Mitosis in a cell', null), []);
});
test('text, flashcards and picture segments are not erased by lab enforcement', () => {
  const source = '<quantora-study-flashcard front="F" back="ma" />\nObserve.\n<quantora-study-picture caption="Two interaction forces act on different bodies" />';
  const routed = enforceStudyRendererContract(source, routeFor('newton-lab'));
  assert.match(routed, /front="F" back="ma"/);
  assert.match(routed, /Two interaction forces/);
  assert.match(routed, /Observe\./);
});

test('StudyMarkdown carries the original message route through both validation passes', () => {
  const source = readFileSync(new URL('../components/StudyMarkdown.jsx', import.meta.url), 'utf8');
  assert.match(source, /decorateStudyMessage\(polished, activeTopic, studyRouting\)/);
  assert.match(source, /splitStudySegments\([^;]*activeTopic, studyRouting\)/);
});
