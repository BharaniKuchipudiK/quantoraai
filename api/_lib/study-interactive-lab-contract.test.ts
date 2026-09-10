import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { formatStudyCognitiveDirective, interpretStudyTurn } from './study-cognitive-routing.js';

const domainSource = fs.readFileSync(new URL('./studio-domains.ts', import.meta.url), 'utf8');

// Exercise the public directive, not the location of its implementation strings:
// the shared native-lab registry now owns the renderer-to-tag mapping.
for (const { message, rendererKind, kind, scope } of [
  {
    message: 'interactive lab for the linear function y = mx + b with slope and intercept',
    rendererKind: 'linear-function-lab',
    kind: 'linear-function',
    scope: /supported Study workspace for this turn/i,
  },
  {
    message: "Animate Newton's third law of motion as an interactive simulation",
    rendererKind: 'newton-lab',
    kind: 'newton-third-law',
    scope: /do not replace it with prose frames/i,
  },
  {
    message: 'Animate a battery and lamp circuit with an open return wire',
    rendererKind: 'circuit-lab',
    kind: 'simple-dc-circuit',
    scope: /steady states, not electromagnetic propagation or thermal transients/i,
  },
]) {
  test(`the turn-specific governed directive delivers exactly one ${kind} contract`, () => {
    const interpretation = interpretStudyTurn({ studioDomain: 'education', message });
    assert.ok(interpretation);
    assert.equal(interpretation.representation.rendererKind, rendererKind);
    assert.equal(interpretation.representation.rendererRequired, true);
    const directive = formatStudyCognitiveDirective(interpretation);
    assert.deepEqual(directive.match(/<quantora-study-lab kind="[^"]+" \/>/g), [
      `<quantora-study-lab kind="${kind}" />`,
    ]);
    assert.match(directive, scope);

    // A known renderer is not permission to render when this turn requires none.
    const withoutRenderer = formatStudyCognitiveDirective({
      ...interpretation,
      representation: { ...interpretation.representation, rendererRequired: false },
    });
    assert.match(withoutRenderer, /do NOT emit <quantora-study-picture> or <quantora-study-lab> tags/);
    assert.doesNotMatch(withoutRenderer, /<quantora-study-lab kind=/);
  });
}

test('the base Study prompt does not grant generic permission to invent labs', () => {
  assert.match(domainSource, /Study has no separate Preview canvas/);
  assert.doesNotMatch(domainSource, /use any quantora-study-lab kind/i);
});
