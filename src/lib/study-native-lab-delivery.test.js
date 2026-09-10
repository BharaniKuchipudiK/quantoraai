import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { studyNativeLabForRenderer } from '../../shared/study-native-labs.js';
import { decorateStudyMessage, enforceStudyRendererContract, splitStudySegments } from './study-pictures.js';

const route = (rendererKind, overrides = {}) => ({ representation: {
  rendererRequired: true, primaryRepresentation: 'simulation_or_lab', fallback: 'none', rendererKind, ...overrides,
} });
const labs = (text, routing, topic = 'Mitosis') => splitStudySegments(
  decorateStudyMessage(enforceStudyRendererContract(text, routing), topic, routing), topic, routing,
).filter((part) => part.type === 'lab');
const denial = 'I cannot run a live video or interactive simulation directly inside this text desk, but we can visualize it clearly using an exact physical equivalent: the bicycle chain.';

for (const [renderer, kind] of [['newton-lab', 'newton-third-law'], ['linear-function-lab', 'linear-function'], ['circuit-lab', 'simple-dc-circuit']]) {
  test(`${renderer}: prose-only response still delivers exactly one native lab after a topic switch`, () => {
    assert.deepEqual(labs(denial, route(renderer)), [{ type: 'lab', kind }]);
    const restored = JSON.parse(JSON.stringify(route(renderer)));
    assert.deepEqual(labs(denial, restored, ''), [{ type: 'lab', kind }]);
  });
  test(`${renderer}: equivalent and conflicting tags cannot duplicate the primary renderer`, () => {
    const source = `<quantora-study-lab kind='${kind}'/><quantora-study-lab kind="${kind}" /><quantora-study-lab kind="fbd" />`;
    assert.deepEqual(labs(source, route(renderer)), [{ type: 'lab', kind }]);
    const once = enforceStudyRendererContract(source, route(renderer));
    assert.equal(enforceStudyRendererContract(once, route(renderer)), once);
  });
  test(`${renderer}: real native delivery corrects the blanket text-desk denial`, () => {
    const shown = enforceStudyRendererContract(`${denial}\n\nThe battery has 6 V.`, route(renderer));
    assert.doesNotMatch(shown, /cannot run|bicycle chain/);
    assert.match(shown, /The battery has 6 V/);
    assert.equal(studyNativeLabForRenderer(renderer).kind, kind);
  });
}
test('unknown, invalid and unsupported routes never suppress honest capability limitations', () => {
  for (const routing of [null, route('invented'), route('__proto__'), route('constructor'),
    route('circuit-lab', { rendererRequired: false }), route('circuit-lab', { rendererRequired: 'true' }),
    route('circuit-lab', { fallback: 'renderer_unavailable' }), route('circuit-lab', { primaryRepresentation: 'concise_text' })]) {
    assert.equal(enforceStudyRendererContract(denial, routing), denial);
    assert.deepEqual(labs(denial, routing), []);
  }
});
test('a circuit tag without server authorization cannot manufacture the new lab', () => {
  assert.deepEqual(labs('<quantora-study-lab kind="simple-dc-circuit" />', null, 'battery circuit'), []);
});
test('model limitations, code, formulae and quoted material are not rewritten as capability claims', () => {
  for (const source of ['I cannot simulate electromagnetic propagation with this steady-state model.',
    'This model cannot represent AC transients.', 'I = ε / (R + r).',
    `\`\`\`text\n${denial}\n\`\`\``, `> ${denial}`]) {
    assert.ok(enforceStudyRendererContract(source, route('circuit-lab')).includes(source));
  }
});
test('the new renderer is lazy, isolated on load failure and included in the existing blocking journey', () => {
  const markdown = readFileSync(new URL('../components/StudyMarkdown.jsx', import.meta.url), 'utf8');
  assert.match(markdown, /React\.lazy\(\(\) => import\('\.\/StudyCircuitLab\.jsx'\)\)/);
  assert.match(markdown, /<StudyNativeLabBoundary/);
  const browser = readFileSync(new URL('../../scripts/study-electricity-browser-gate.mjs', import.meta.url), 'utf8');
  assert.match(browser, /import\('\.\/study-native-lab-browser-proof\.mjs'\)/);
});
