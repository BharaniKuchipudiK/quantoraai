import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretStudyTurn, publicStudyCognitiveMetadata, formatStudyCognitiveDirective } from './study-cognitive-routing.js';
import { resolveStudyRepresentationCapability, resolveStudyRepresentationCapabilityForConcept } from './study-representation-capabilities.js';
import { buildConversationSnapshot, chooseNextConversationMove, verifyConversationResponse, publicConversationMetadata } from './conversation-engine.js';
import { enforceStudyRendererContract, decorateStudyMessage, splitStudySegments } from '../../src/lib/study-pictures.js';

const followUp = 'can you show me with an animation to visualise';
const history = [{ role: 'user', content: 'Explain why a battery and lamp circuit stops working when the return wire is cut.' }];

test('[was-red] exact return-wire follow-up reaches the native circuit through public conversation metadata', () => {
  const interpretation = interpretStudyTurn({ studioDomain: 'education', message: followUp, history });
  assert.ok(interpretation);
  assert.equal(interpretation.continuity, 'follow_up');
  assert.equal(interpretation.representation.rendererKind, 'circuit-lab');
  assert.equal(interpretation.representation.primaryRepresentation, 'simulation_or_lab');
  assert.equal(interpretation.representation.rendererRequired, true);
  assert.equal(interpretation.representation.fallback, 'none');
  assert.match(formatStudyCognitiveDirective(interpretation), /simple-dc-circuit/);
  assert.match(formatStudyCognitiveDirective(interpretation), /steady states/);
  const snapshot = buildConversationSnapshot({ message: followUp, studioDomain: 'education' });
  const decision = chooseNextConversationMove(snapshot);
  const response = 'I cannot run an interactive simulation in this text desk.\n\nPredict what opening the wire does.';
  const verification = verifyConversationResponse({ snapshot, decision, response });
  const metadata = JSON.parse(JSON.stringify(publicConversationMetadata(snapshot, decision, verification, {
    studyCognitiveRouting: publicStudyCognitiveMetadata(interpretation),
  })));
  const route = metadata.studyCognitiveRouting;
  const rendered = enforceStudyRendererContract(response, route);
  assert.doesNotMatch(rendered, /cannot run/);
  for (const topic of ['Battery circuit', 'Now explain mitosis', '']) {
    const segments = splitStudySegments(decorateStudyMessage(rendered, topic, route), topic, route);
    assert.deepEqual(segments.filter((part) => part.type === 'lab'), [{ type: 'lab', kind: 'simple-dc-circuit' }]);
  }
});
test('basic DC requests resolve both canonical identity and short return-wire follow-ups', () => {
  for (const topic of ['Battery and lamp circuit', 'What if I open the return wire?', 'DC circuit with internal resistance']) {
    assert.equal(resolveStudyRepresentationCapability(`${topic} ${followUp}`)?.rendererKind, 'circuit-lab');
  }
  assert.equal(resolveStudyRepresentationCapabilityForConcept({ conceptKey: 'physics.electricity.current', fallbackText: followUp })?.rendererKind, 'circuit-lab');
});
test('AC, reactive components, network circuits and field propagation cannot be claimed by a DC toy', () => {
  for (const topic of ['AC circuit', 'RC circuit with a capacitor', 'Inductor circuit', 'RLC transient',
    'Parallel battery circuits', 'Magnetic field from a coil', 'Electromagnetic propagation in a circuit', 'Neural circuit']) {
    assert.notEqual(resolveStudyRepresentationCapability(`${topic} ${followUp}`)?.rendererKind, 'circuit-lab', topic);
  }
});
test('explicit visual diagrams and other subjects retain their previous capability and authority', () => {
  assert.equal(resolveStudyRepresentationCapability('EMF and terminal voltage in a battery circuit, show me visually')?.rendererKind, 'electricity-circuit');
  assert.equal(resolveStudyRepresentationCapability('Animate Newton third law')?.rendererKind, 'newton-lab');
  assert.equal(resolveStudyRepresentationCapability('Animate linear functions y = mx + b')?.rendererKind, 'linear-function-lab');
  assert.notEqual(resolveStudyRepresentationCapabilityForConcept({ conceptKey: 'biology.cell.mitosis', fallbackText: 'animate a battery circuit' })?.rendererKind, 'circuit-lab');
  const unrelated = interpretStudyTurn({ studioDomain: 'education', message: 'Animate mitosis in a cell', history });
  assert.notEqual(unrelated?.representation.rendererKind, 'circuit-lab');
  assert.equal(interpretStudyTurn({ studioDomain: 'finance', message: followUp, history }), null);
});
