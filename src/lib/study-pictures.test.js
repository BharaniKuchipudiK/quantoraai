import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decorateStudyMessage,
  pictureCaptionFitsLesson,
  splitStudySegments,
  studyAlgebraVisualVariant,
  studyElectricityVisualVariant,
  studyFieldVisualVariant,
  studyGeometryVisualVariant,
  studyGraphVisualVariant,
  studyNumberLineLabel,
  studyNumberLineSpec,
  studyPicturePromptHint,
  studyPhysicsVisualVariant,
  studyProcessSteps,
  studyTimelinePoints,
  studyVisualKind,
  wantsStudyLab,
} from './study-pictures.js';

test('Study picture tags become real segments from the caption, not a stock kind', () => {
  const parts = splitStudySegments(
    'Hook.\n<quantora-study-picture caption="A box holding the unknown in x + 3 = 5" />\nThen wait.',
    'What is Algebra?',
  );
  assert.equal(parts[1].type, 'picture');
  assert.match(parts[1].caption, /unknown/);
});

test('flashcard tags become front/back segments without exposing a Markdown table', () => {
  const parts = splitStudySegments(
    '<quantora-study-flashcard front="What is inertia?" back="Resistance to a change in velocity." />\n<quantora-study-flashcard front="Is inertia a force?" back="No." />',
    'Inertia',
  );
  assert.deepEqual(parts.map((part) => part.type), ['flashcard', 'flashcard']);
  assert.equal(parts[0].front, 'What is inertia?');
  assert.equal(parts[0].back, 'Resistance to a change in velocity.');
});

test('a lab tag only renders when this conversation is actually that lab', () => {
  const newton = decorateStudyMessage(
    '<quantora-study-lab kind="fbd" />\nPush on the crate.',
    "Newton's laws of motion",
  );
  assert.match(newton, /quantora-study-lab kind="fbd"/);
  const algebra = decorateStudyMessage(
    '<quantora-study-lab kind="newton" />\nSolve x - 8 = 15.',
    'What is Algebra?',
  );
  assert.doesNotMatch(algebra, /quantora-study-lab/);
});

test('Algebra never keeps leftover Newton stock scenes', () => {
  assert.equal(pictureCaptionFitsLesson(
    'Newton under the tree — why does the apple fall the same way every time?',
    'What is Algebra?',
    'x - 8 = 15',
  ), false);
  assert.doesNotMatch(studyPicturePromptHint('Algebra'), /apple-tree|book-table|truck-car/);

  const leaked = splitStudySegments(
    '<quantora-study-picture kind="book-table" />\nKeep both sides of the equation balanced. What is the value of $x-8=15$?',
    'What is Algebra?',
  );
  assert.equal(leaked.some((part) => part.type === 'picture'), false);

  const leakedTruck = splitStudySegments(
    '<quantora-study-picture kind="truck-car" />\nNo more images or tags. Back to the problem: $x - 8 = 15$.',
    'What is Algebra?',
  );
  assert.equal(leakedTruck.some((part) => part.type === 'picture'), false);

  const appleLeak = splitStudySegments(
    '<quantora-study-picture kind="apple-tree" caption="Newton under the tree — why does the apple fall the same way every time?" />\nAlgebra is a mystery box.',
    'What is Algebra?',
  );
  assert.equal(appleLeak.some((part) => part.type === 'picture'), false);
});

test('an Electricity picture cannot leak into a non-Electricity lesson', () => {
  assert.equal(pictureCaptionFitsLesson(
    'EMF and terminal potential difference in a battery circuit',
    'What is Algebra?',
    'Solve x - 8 = 15',
  ), false);
  const electricity = splitStudySegments(
    '<quantora-study-picture caption="EMF and terminal potential difference in a battery circuit" />\nSolve x - 8 = 15.',
    'What is Algebra?',
  );
  assert.equal(electricity.some((part) => part.type === 'picture'), false);
});

test('the client does not invent a picture from the word apple', () => {
  const decorated = decorateStudyMessage('Three apples in a box is just counting.');
  assert.doesNotMatch(decorated, /quantora-study-picture|apple-tree/);
});

test('a model caption about this Algebra turn is kept', () => {
  const parts = splitStudySegments(
    '<quantora-study-picture caption="Undo subtraction by adding the same number to both sides" />\n$$x - 8 = 15$$',
    'What is Algebra?',
  );
  assert.equal(parts[0].type, 'picture');
  assert.match(parts[0].caption, /both sides/);
});

test('wantsStudyLab does not treat a generic visual as Newton', () => {
  assert.equal(wantsStudyLab('Add a visual workspace for this idea'), false);
  assert.equal(wantsStudyLab('Open the free-body diagram lab'), true);
});

test('Study visuals are subject-aware teaching diagrams', () => {
  assert.equal(studyVisualKind('A box accelerating under a net force'), 'physics-motion');
  assert.equal(studyVisualKind('Resolve a vector into x and y components'), 'physics-motion');
  assert.equal(studyPhysicsVisualVariant('Resolve a vector into x and y components'), 'vector-components');
  assert.equal(studyVisualKind('Electric field lines around a positive charge'), 'field-lines');
  assert.equal(studyFieldVisualVariant('Electric field lines around a positive charge'), 'electric');
  assert.equal(studyVisualKind('Right-hand grip: thumb along current I, fingers curl in the magnetic field B around the wire'), 'field-lines');
  assert.equal(studyFieldVisualVariant('Right-hand grip: thumb along current I, fingers curl in the magnetic field B around the wire'), 'magnetic');
  assert.equal(studyVisualKind('A battery drives current around a resistor circuit'), 'electricity-circuit');
  assert.equal(studyVisualKind('Keep both sides of the equation balanced'), 'algebra-balance');
  assert.equal(studyVisualKind('The nucleus sits inside the cell membrane'), 'biology-cell');
  assert.equal(studyVisualKind('The slope of a displacement-time graph'), 'graph');
  assert.equal(studyVisualKind('Plot sine and cosine on the unit circle graph by quadrant'), 'graph');
});

test('graph visuals distinguish slope, quadrant signs, and the unit circle', () => {
  const quadrantCaption = 'Quadrant II on the coordinate plane: x is negative and y is positive, so cosine is negative and sine is positive';
  assert.equal(studyVisualKind(quadrantCaption), 'graph');
  assert.equal(studyGraphVisualVariant('The slope of a displacement-time graph'), 'displacement-time');
  assert.equal(studyGraphVisualVariant(quadrantCaption), 'quadrant');
  assert.equal(studyGraphVisualVariant('Unit circle: cosine is the x-coordinate and sine is the y-coordinate'), 'unit-circle');
});

test('motion-graph captions are graphs, not free-body diagrams, and name what the slope means', () => {
  const displacement = 'Displacement-time graph: the slope at a point is velocity, change in displacement over change in time';
  const velocity = 'Velocity-time graph: the slope at a point is acceleration, change in velocity over change in time';
  assert.equal(studyVisualKind(displacement), 'graph');
  assert.equal(studyVisualKind(velocity), 'graph');
  assert.equal(studyGraphVisualVariant(displacement), 'displacement-time');
  assert.equal(studyGraphVisualVariant(velocity), 'velocity-time');
  assert.equal(studyGraphVisualVariant('A labelled graph showing axes, slope, and change between two points'), 'slope');
});

test('a Pythagoras lesson with side x is a right triangle, not an algebra scale', () => {
  const caption = 'Right triangle: legs a and b, hypotenuse c, so a squared plus b squared equals c squared';
  assert.equal(studyVisualKind('Find side x in this right triangle using Pythagoras'), 'geometry-construction');
  assert.equal(studyVisualKind(caption), 'geometry-construction');
  assert.equal(studyGeometryVisualVariant(caption), 'right-triangle');
  assert.notEqual(studyVisualKind('Find side x in this right triangle using Pythagoras'), 'algebra-balance');
});

test('algebra visuals distinguish a static scale from a both-sides transformation', () => {
  assert.equal(studyAlgebraVisualVariant('A box holding the unknown in x + 3 = 5'), 'scale');
  assert.equal(studyAlgebraVisualVariant('Equation transformation: subtract 8 from both sides of x + 8 = 15 to keep the balance and isolate x'), 'transformation');
});

test('electricity visuals distinguish a circuit schematic from EMF energy flow', () => {
  assert.equal(studyElectricityVisualVariant('Battery circuit with current through a resistor'), 'simple-circuit');
  assert.equal(studyElectricityVisualVariant('EMF versus terminal voltage with internal resistance and lost volts'), 'emf-terminal-voltage');
});

test('structured captions unlock deterministic process, timeline, and number-line visuals', () => {
  const process = 'Process: sunlight -> chlorophyll -> glucose';
  assert.equal(studyVisualKind(process), 'process-flow');
  assert.deepEqual(studyProcessSteps(process), ['sunlight', 'chlorophyll', 'glucose']);

  const timeline = 'Timeline of key events: 1914 -> 1918 -> 1939';
  assert.equal(studyVisualKind(timeline), 'timeline');
  assert.deepEqual(studyTimelinePoints(timeline), ['1914', '1918', '1939']);

  const numberLine = 'Number line from -3 to 5, mark 2';
  assert.equal(studyVisualKind(numberLine), 'number-line');
  assert.deepEqual(studyNumberLineSpec(numberLine), { min: -3, max: 5, mark: 2 });
});

test('explicit process grammar wins over broad subject keywords', () => {
  assert.equal(studyVisualKind('Process: cell grows -> DNA replicates -> cell divides'), 'process-flow');
  assert.equal(studyVisualKind('Process: reactants -> reaction -> products'), 'process-flow');
  assert.equal(studyVisualKind('Process: force applied -> velocity changes -> object accelerates'), 'process-flow');
});

test('timeline years are chronological even when the caption mentions them out of order', () => {
  const caption = 'Timeline: World War II began in 1939, after World War I began in 1914 and ended in 1918';
  assert.deepEqual(studyTimelinePoints(caption), ['1914', '1918', '1939']);
  assert.equal(studyVisualKind(caption), 'timeline');
});

test('narrow number lines preserve enough precision to keep tick labels distinct', () => {
  const spec = studyNumberLineSpec('Number line from 0 to 0.04, mark 0.03');
  assert.deepEqual(spec, { min: 0, max: 0.04, mark: 0.03 });
  const labels = Array.from({ length: 7 }, (_, index) => {
    const value = spec.min + (spec.max - spec.min) * (index / 6);
    return studyNumberLineLabel(value, spec.min, spec.max);
  });
  assert.equal(new Set(labels).size, 7);
  assert.equal(studyNumberLineLabel(spec.mark, spec.min, spec.max), '0.03');
});

test('structured visual grammar fails closed when the data needed to draw is missing', () => {
  assert.deepEqual(studyProcessSteps('Explain a process with no explicit sequence'), []);
  assert.equal(studyNumberLineSpec('Draw a number line'), null);
  assert.equal(studyVisualKind('Explain a process with no explicit sequence'), null);
  assert.equal(studyVisualKind('Timeline with no dates'), null);
});

test('picture prompt teaches the model the native visual grammar without image URLs', () => {
  const hint = studyPicturePromptHint('photosynthesis');
  assert.match(hint, /electric circuit/);
  assert.match(hint, /Process: input -> change -> result/);
  assert.match(hint, /Timeline: 1914 -> 1918 -> 1939/);
  assert.match(hint, /Number line from -3 to 5, mark 2/);
  assert.match(hint, /Do not invent image URLs/);
});

test('physics visuals distinguish braking inertia from a free-body diagram', () => {
  assert.equal(studyPhysicsVisualVariant('Passenger motion when a vehicle brakes'), 'braking-inertia');
  assert.equal(studyPhysicsVisualVariant('Free-body diagram of a block on a table'), 'free-body');
});

test('a caption about the instruction earns no diagram', () => {
  for (const caption of [
    'Opening a study idea with an icebreaker and visual tag',
    'one sentence about this idea',
    'A picture tag for this idea',
    'placeholder scene',
  ]) {
    assert.equal(studyVisualKind(caption), null, caption);
  }
});

test('a caption naming a real subject still earns its diagram', () => {
  assert.equal(studyVisualKind('Free-body diagram of a block on a table'), 'physics-motion');
  assert.equal(studyVisualKind('Battery circuit with current through a resistor'), 'electricity-circuit');
  assert.equal(studyVisualKind('EMF versus terminal potential difference with internal resistance'), 'electricity-circuit');
  assert.equal(studyVisualKind('Solving for the unknown on both sides'), 'algebra-balance');
  assert.equal(studyVisualKind('The nucleus inside a plant cell'), 'biology-cell');
  assert.equal(studyVisualKind('Atoms joined by a covalent bond'), 'chemistry-bond');
  assert.equal(studyVisualKind('Slope of a distance-time graph'), 'graph');
  assert.equal(studyVisualKind('How temperature leads to pressure'), 'concept-relationship');
});

test('a caption naming no subject at all draws nothing', () => {
  assert.equal(studyVisualKind('Here is something interesting'), null);
  assert.equal(studyVisualKind(''), null);
});
