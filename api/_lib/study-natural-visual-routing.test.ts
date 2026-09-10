import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretStudyTurn, publicStudyCognitiveMetadata, formatStudyCognitiveDirective } from './study-cognitive-routing.js';
import { resolveStudyRepresentationCapability, resolveStudyRepresentationCapabilityForConcept } from './study-representation-capabilities.js';
import { enforceStudyRendererContract, decorateStudyMessage, splitStudySegments } from '../../src/lib/study-pictures.js';

const followUp = 'can you show me with an animation to visualise';
const suppliedQuestion = 'can you show me Electric circuitry how it works';
const examples = [
  [suppliedQuestion, 'circuit-lab', 'simple-dc-circuit'],
  ['Explain electrical circuitry', 'circuit-lab', 'simple-dc-circuit'],
  ["Explain Newton's 3rd law", 'newton-lab', 'newton-third-law'],
  ['Explain the 3rd law of motion', 'newton-lab', 'newton-third-law'],
  ['Explain linear functions', 'linear-function-lab', 'linear-function'],
  ['Explain straight-line graphs', 'linear-function-lab', 'linear-function'],
] as const;

for (const [question, renderer, kind] of examples) {
  test(`[was-red] ${question}: real interpretation selects the supported native family`, () => {
    const history = [
      { role: 'user', content: question },
      { role: 'assistant', content: 'Here is the idea. Let us examine what changes.' },
    ];
    const interpretation = interpretStudyTurn({ studioDomain: 'education', message: followUp, history, workingState: null });
    assert.ok(interpretation);
    assert.equal(interpretation.continuity, 'follow_up');
    assert.equal(interpretation.representation.rendererKind, renderer);
    assert.equal(interpretation.representation.rendererRequired, true);
    assert.equal(interpretation.representation.fallback, 'none');
    assert.ok(formatStudyCognitiveDirective(interpretation).includes(`<quantora-study-lab kind="${kind}" />`));
    // The route comes from the real interpretation, never an expected-route fixture.
    const metadata = JSON.parse(JSON.stringify(publicStudyCognitiveMetadata(interpretation)));
    const text = enforceStudyRendererContract('Use the controls to test your prediction.', metadata);
    for (const laterTopic of ['', question, 'Mitosis in a cell']) {
      const segments = splitStudySegments(decorateStudyMessage(text, laterTopic, metadata), laterTopic, metadata);
      assert.deepEqual(segments.filter((part) => part.type === 'lab'), [{ type: 'lab', kind }]);
    }
  });
}

test('circuitry spelling does not expand the physical scope of the DC model', () => {
  for (const topic of ['neural circuitry', 'digital circuitry', 'AC circuitry', 'parallel circuitry',
    'series circuitry', 'RC circuitry with a capacitor', 'RLC transient circuitry',
    'electromagnetic propagation in circuitry', 'electrochemistry in a battery']) {
    const interpretation = interpretStudyTurn({ studioDomain: 'education', message: followUp,
      history: [{ role: 'user', content: `Explain ${topic}` }], workingState: null });
    assert.notEqual(interpretation?.representation.rendererKind, 'circuit-lab', topic);
  }
  assert.notEqual(resolveStudyRepresentationCapabilityForConcept({ conceptKey: 'biology.cell.mitosis',
    fallbackText: `Electric circuitry ${followUp}` })?.rendererKind, 'circuit-lab');
});

test('cross-topic requests choose their own family, and unknown subjects never inherit the circuit', () => {
  const history = [{ role: 'user', content: suppliedQuestion }, { role: 'assistant', content: 'A battery drives a complete loop.' }];
  for (const message of ['Now animate mitosis in an animal cell.', 'Animate a covalent bond.', 'Animate neural circuitry.']) {
    const interpretation = interpretStudyTurn({ studioDomain: 'education', message, history, workingState: null });
    assert.notEqual(interpretation?.representation.rendererKind, 'circuit-lab');
    assert.notEqual(interpretation?.representation.primaryRepresentation, 'simulation_or_lab');
  }
  assert.equal(interpretStudyTurn({ studioDomain: 'finance', message: followUp, history }), null);
  assert.equal(interpretStudyTurn({ studioDomain: 'education', message: followUp, history: [], workingState: null })?.representation.rendererRequired, false);
});

test('ordinary diagrams are not relabelled as animations; existing canonical contracts remain supported', () => {
  assert.equal(resolveStudyRepresentationCapability('Electric circuitry, show me visually')?.rendererKind, 'electricity-circuit');
  for (const [key, expected] of [['physics.electricity.current', 'circuit-lab'],
    ['physics.dynamics.newton-third-law', 'newton-lab'], ['math.linear-function', 'linear-function-lab']]) {
    assert.equal(resolveStudyRepresentationCapabilityForConcept({ conceptKey: key, fallbackText: followUp })?.rendererKind, expected);
  }
});
