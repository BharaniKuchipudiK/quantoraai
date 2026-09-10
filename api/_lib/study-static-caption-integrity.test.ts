import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudyRepresentationCapability, resolveStudyRepresentationCapabilityForConcept } from './study-representation-capabilities.js';
import { interpretStudyTurn, publicStudyCognitiveMetadata, formatStudyCognitiveDirective } from './study-cognitive-routing.js';
import { resolveStudyStaticVisualContract } from '../../src/lib/study-static-visual-delivery.js';
import { splitStudySegments } from '../../src/lib/study-pictures.js';

for (const arrow of ['->', '→', '⇒']) {
  test(`structured arrows survive routing, prompt tags and direct delivery: ${arrow}`, () => {
    for (const [message, kind, expected] of [
      [`Show this diagram: Before/after: ice ${arrow} liquid water`, 'before-after', 'Before/after: ice -> liquid water'],
      [`Show this diagram: Process: input ${arrow} change ${arrow} result`, 'process-flow', 'Process: input -> change -> result'],
      [`Show this diagram: Timeline: 1914 ${arrow} 1918`, 'timeline', 'Timeline: 1914 -> 1918'],
    ]) {
      const route = interpretStudyTurn({ studioDomain: 'education', message, workingState: null });
      assert.ok(route);
      const metadata = JSON.parse(JSON.stringify(publicStudyCognitiveMetadata(route)));
      assert.equal(metadata.representation.renderCaption, expected);
      assert.equal(resolveStudyStaticVisualContract(metadata)?.rendererKind, kind);
      const directive = formatStudyCognitiveDirective(route);
      const tag = directive.match(/<quantora-study-picture\b[^>]+\/>/)?.[0];
      assert.ok(tag, 'The exact prompt tag is well formed, not truncated by an ASCII arrow.');
      const segments = splitStudySegments(tag, message);
      assert.equal(segments.length, 1);
      assert.equal(segments[0].type, 'picture');
      assert.equal(segments[0].caption, expected.replace(/->/g, '→'));
    }
  });
}

test('repeated control-plane context cannot become an invented after-state', () => {
  const topic = 'Show the state change: changes from ice to liquid water';
  const capability = resolveStudyRepresentationCapabilityForConcept({ conceptLabel: topic, fallbackText: `${topic}\nShow it visually` });
  assert.equal(capability?.renderCaption, 'Before/after: ice -> liquid water');
});

test('fraction delivery does not drop signs, false equality or extra operands', () => {
  for (const text of ['Show fraction -1/2 visually', 'Show equivalent fractions 1/2 = 2/3 visually', 'Show fractions 1/2, 2/4, 3/6 visually', 'Show fraction 3/2 visually']) {
    assert.equal(resolveStudyRepresentationCapability(text), null, text);
  }
});

test('client rejects malformed captions and renderer classes rather than silently repairing them', () => {
  const representation = { rendererRequired: true, fallback: 'none', rendererKind: 'before-after', deliveryClass: 'micro_visual', renderCaption: 'Before/after: ice -> liquid water' };
  assert.equal(resolveStudyStaticVisualContract({ representation })?.caption, representation.renderCaption);
  for (const renderCaption of ['Before/after: <img>ice -> water', 'Before/after: ice -> "water"', 'Before/after: ice -> ' + 'x'.repeat(250), { text: 'Before/after: ice -> water' }]) {
    assert.equal(resolveStudyStaticVisualContract({ representation: { ...representation, renderCaption } }), null);
  }
  assert.equal(resolveStudyStaticVisualContract({ representation: { ...representation, deliveryClass: 'static_diagram' } }), null);
  assert.equal(resolveStudyStaticVisualContract({ representation: { ...representation, primaryRepresentation: 'simulation_or_lab' } }), null);
});
