import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStudyCognitiveDirective, interpretStudyTurn, publicStudyCognitiveMetadata } from './study-cognitive-routing.js';
import { resolveStudyStaticVisualContract } from '../../src/lib/study-static-visual-delivery.js';

for (const probe of [
  {
    name: 'vector components',
    message: 'Teach me vector components visually on x and y axes',
    rendererKind: 'physics-motion',
    deliveryClass: 'static_diagram',
    caption: /vector components/i,
  },
  {
    name: 'EMF',
    message: 'Show EMF and terminal potential difference in a battery circuit visually',
    rendererKind: 'electricity-circuit',
    deliveryClass: 'static_diagram',
    caption: /EMF and terminal potential difference/i,
  },
  {
    name: 'Pythagoras',
    message: 'Show a right triangle using Pythagoras visually',
    rendererKind: 'geometry-construction',
    deliveryClass: 'static_diagram',
    caption: /Right triangle/i,
  },
  {
    name: 'equivalent fractions',
    message: 'Show equivalent fractions 2/3 and 4/6 visually',
    rendererKind: 'fraction-model',
    deliveryClass: 'micro_visual',
    caption: /2\/3 = 4\/6/,
  },
  {
    name: 'state change',
    message: 'Show the state change: changes from ice to liquid water visually',
    rendererKind: 'before-after',
    deliveryClass: 'micro_visual',
    caption: /ice -> liquid water/i,
  },
] as const) {
  test(`per-message route carries a deterministic ${probe.name} render contract to the client`, () => {
    const interpretation = interpretStudyTurn({ studioDomain: 'education', message: probe.message, history: [] });
    assert.ok(interpretation);
    assert.equal(interpretation.representation.rendererRequired, true);
    assert.equal(interpretation.representation.rendererKind, probe.rendererKind);

    const metadata = publicStudyCognitiveMetadata(interpretation);
    assert.equal(metadata?.representation.rendererKind, probe.rendererKind);
    assert.equal(metadata?.representation.deliveryClass, probe.deliveryClass);
    assert.match(metadata?.representation.renderCaption || '', probe.caption);

    const client = resolveStudyStaticVisualContract(metadata);
    assert.equal(client?.rendererKind, probe.rendererKind);
    assert.equal(client?.deliveryClass, probe.deliveryClass);
    assert.equal(client?.caption, metadata?.representation.renderCaption);

    const directive = formatStudyCognitiveDirective(interpretation);
    assert.match(directive, /including exactly one <quantora-study-picture caption=/i);
    // The prompt tag must encode ASCII arrows without introducing an HTML tag
    // terminator. Assert the complete caption, not just an arrow-shaped substring.
    const directiveTag = /<quantora-study-picture caption="([^"<>]+)" \/>/.exec(directive);
    assert.ok(directiveTag);
    assert.equal(directiveTag[1], metadata?.representation.renderCaption?.replace(/->/g, '→'));
  });
}

test('unsupported visual request carries no invented static render contract', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Show opportunity cost visually',
    history: [],
  });
  assert.ok(interpretation);
  assert.equal(interpretation.representation.rendererRequired, false);
  assert.equal(interpretation.representation.fallback, 'renderer_unavailable');
  const metadata = publicStudyCognitiveMetadata(interpretation);
  assert.equal(metadata?.representation.deliveryClass, null);
  assert.equal(metadata?.representation.renderCaption, null);
  assert.equal(resolveStudyStaticVisualContract(metadata), null);
});

test('native lab metadata stays on the existing lab contract and is not reclassified as static', () => {
  const interpretation = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Animate a battery and lamp circuit with an open return wire',
    history: [],
  });
  assert.ok(interpretation);
  const metadata = publicStudyCognitiveMetadata(interpretation);
  assert.equal(metadata?.representation.rendererKind, 'circuit-lab');
  assert.equal(metadata?.representation.deliveryClass, 'timed_animation');
  assert.equal(metadata?.representation.renderCaption, null);
  assert.equal(resolveStudyStaticVisualContract(metadata), null);
});
