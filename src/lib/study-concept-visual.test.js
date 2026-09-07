import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStudyTopicSelection,
  studyActiveConcept,
  studyOpticsVisualSpec,
  studyPictureFitsTopic,
  studySubjectFamily,
  studyTopicVisualFamily,
} from './study-concept-visual.js';

test('topic recommendation turns never earn a subject visual family', () => {
  const topic = 'you suggest me a topic from Science';
  assert.equal(isStudyTopicSelection(topic), true);
  assert.equal(studyTopicVisualFamily(topic), null);
  assert.equal(studyOpticsVisualSpec(
    'Try Chemical Reactions and Equations, Light: Reflection and Refraction, or Life Processes.',
    topic,
  ), null);
});

test('a science topic list containing equations cannot render an Algebra picture', () => {
  assert.equal(studyPictureFitsTopic(
    'An equation balance showing the same operation applied to both sides',
    'you suggest me a topic from Science',
  ), false);
});

test('message-local concept resolution escapes an earlier topic-selection turn', () => {
  const history = [
    'you suggest me a topic from Science',
    'teach me Newtonian inertia',
  ].join('\n');
  assert.equal(
    studyActiveConcept(history, 'Inertia explains why a moving passenger keeps moving when a car brakes.'),
    'teach me Newtonian inertia',
  );
});

test('historical answers keep their original subject after the learner changes topic', () => {
  const history = [
    'teach me Algebra equations',
    'teach me Newtonian inertia',
  ].join('\n');
  assert.equal(
    studyActiveConcept(history, 'For the equation x + 3 = 7, subtract 3 from both sides.'),
    'teach me Algebra equations',
  );
});

test('generic continuation falls back to the nearest established concept', () => {
  const history = [
    'Light: Reflection & Refraction',
    'ready',
  ].join('\n');
  assert.equal(
    studyActiveConcept(history, 'Let us continue with the same idea.'),
    'Light: Reflection & Refraction',
  );
});

test('subject classification is independent of renderer shape', () => {
  assert.equal(studySubjectFamily('Chemical reactions'), 'chemistry');
  assert.equal(studySubjectFamily('Newtonian inertia'), 'mechanics');
  assert.equal(studySubjectFamily('Light: Reflection & Refraction'), 'optics');
  assert.equal(studySubjectFamily('Teach me Pythagoras to find side x on a right triangle visually.'), 'geometry');
});

test('optics is locked as its own visual family', () => {
  assert.equal(studyTopicVisualFamily('Light: Reflection & Refraction'), 'optics');
  assert.equal(studyPictureFitsTopic(
    'A labelled graph showing axes, slope, and change between two points',
    'Light: Reflection & Refraction',
  ), false);
});

test('structured diagrams remain available inside a recognized subject', () => {
  assert.equal(studyPictureFitsTopic(
    'Process: reactants -> reaction -> products',
    'Chemical reactions',
  ), true);
  assert.equal(studyPictureFitsTopic(
    'Process: parent cell -> chromosome separation -> daughter cells',
    'Cell division and mitosis',
  ), true);
});

test('strong cross-subject pictures are still rejected', () => {
  assert.equal(studyPictureFitsTopic(
    'An equation balance showing the same operation applied to both sides',
    'Chemical reactions',
  ), false);
  assert.equal(studyPictureFitsTopic(
    'A labelled cell showing the membrane, cytoplasm, and nucleus',
    'Newtonian inertia',
  ), false);
});

test('concave mirror diagram requires an explicitly beyond-focus lesson', () => {
  const spec = studyOpticsVisualSpec(
    'On the concave side, once the object is beyond the focal point F, the reflected rays cross and the image is inverted.',
    'Light: Reflection & Refraction',
  );
  assert.equal(spec?.kind, 'concave-mirror');
  assert.match(spec?.caption || '', /beyond the focal distance F/i);
});

test('unknown concave-mirror region fails closed rather than guessing a ray diagram', () => {
  assert.equal(studyOpticsVisualSpec(
    'The concave side curves inward like a cave and can form different kinds of images.',
    'Light: Reflection & Refraction',
  ), null);
});

test('inside-focus concave lessons never receive the inverted real-image diagram', () => {
  assert.equal(studyOpticsVisualSpec(
    'Hold your face close to the concave spoon, inside the focal distance. The image is upright and magnified.',
    'Light: Reflection & Refraction',
  ), null);
});

test('a spoon bowl-side lesson earns the diagram only after the focal region is established', () => {
  const spec = studyOpticsVisualSpec(
    'Look into the bowl side of a spoon and move it away. When your face is beyond the focal distance, the image flips upside-down.',
    'Light: Reflection & Refraction',
  );
  assert.equal(spec?.kind, 'concave-mirror');
});

test('broad optics prose does not invent a concave mirror diagram', () => {
  assert.equal(studyOpticsVisualSpec(
    'Light can reflect from a surface and refract when it enters a different medium.',
    'Light: Reflection & Refraction',
  ), null);
});

test('existing subject diagrams remain available when their governed captions match the topic', () => {
  assert.equal(studyPictureFitsTopic(
    'Passenger motion when a vehicle brakes: velocity continues forward while the braking force acts backward',
    'Newtonian inertia',
  ), true);
  assert.equal(studyPictureFitsTopic(
    'Undo subtraction by adding the same number to both sides of the equation',
    'What is Algebra?',
  ), true);
});

test('a later unsupported concept does not inherit an earlier vector visual family', () => {
  const history = [
    'Teach me vector components visually.',
    'unsupported-concept: Teach opportunity cost visually.',
  ].join('\n');
  const reply = [
    'No safe native visual renderer exists for this concept yet, so I will keep this concise and structured rather than pretending a diagram exists.',
    '',
    'State one concrete trade-off from the scenario in one sentence.',
  ].join('\n');
  const topic = studyActiveConcept(history, reply);
  assert.equal(studyTopicVisualFamily(topic), null);
});

test('a Pythagoras caption is a real geometry picture, not a dropped decorative picture', () => {
  assert.equal(studyPictureFitsTopic(
    'Right triangle: legs a and b, hypotenuse c, so a squared plus b squared equals c squared',
    'Teach me Pythagoras to find side x on a right triangle visually.',
  ), true);
});

test('a both-sides transformation caption is a real algebra picture, not a dropped decorative picture', () => {
  assert.equal(studyPictureFitsTopic(
    'Equation transformation: subtract 8 from both sides of x + 8 = 15 to keep the balance and isolate x',
    'Teach me solving by doing the same to both sides visually.',
  ), true);
});

test('a magnetic right-hand-rule caption is a real field picture, not a dropped decorative picture', () => {
  assert.equal(studyPictureFitsTopic(
    'Right-hand grip: thumb along current I, fingers curl in the magnetic field B around the wire',
    'Teach me magnetic field direction with the right-hand rule visually.',
  ), true);
});

test('a displacement-time caption is a real graph, not a dropped decorative picture', () => {
  assert.equal(studyPictureFitsTopic(
    'Displacement-time graph: the slope at a point is velocity, change in displacement over change in time',
    'Teach me a displacement-time graph visually.',
  ), true);
});

test('a quadrant-sign caption is a real graph, not a dropped decorative picture', () => {
  assert.equal(studyPictureFitsTopic(
    'Quadrant II on the coordinate plane: x is negative and y is positive, so cosine is negative and sine is positive',
    'Teach me quadrant II sine signs visually.',
  ), true);
});

test('the word curve alone is not enough to justify a graph inside a non-graph topic', () => {
  assert.equal(studyPictureFitsTopic(
    'The curved surface changes the direction of reflected rays',
    'Light: Reflection & Refraction',
  ), false);
});
