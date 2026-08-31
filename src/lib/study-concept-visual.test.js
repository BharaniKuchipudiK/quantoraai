import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStudyTopicSelection,
  studyAllowsAutomaticTeachingVisual,
  studyOpticsVisualSpec,
  studyPictureFitsTopic,
  studyTopicVisualFamily,
} from './study-concept-visual.js';

test('topic recommendation turns never earn an automatic teaching visual', () => {
  const topic = 'you suggest me a topic from Science';
  assert.equal(isStudyTopicSelection(topic), true);
  assert.equal(studyTopicVisualFamily(topic), null);
  assert.equal(studyAllowsAutomaticTeachingVisual(topic), false);
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

test('optics is locked as its own visual family', () => {
  assert.equal(studyTopicVisualFamily('Light: Reflection & Refraction'), 'optics');
  assert.equal(studyAllowsAutomaticTeachingVisual('Light: Reflection & Refraction'), false);
  assert.equal(studyPictureFitsTopic(
    'A labelled graph showing axes, slope, and change between two points',
    'Light: Reflection & Refraction',
  ), false);
});

test('concave mirror explanations earn the dedicated optics diagram', () => {
  const spec = studyOpticsVisualSpec(
    'The concave side curves inward like a cave. Reflected rays from the object cross after reflection, so the image flips.',
    'Light: Reflection & Refraction',
  );
  assert.equal(spec?.kind, 'concave-mirror');
  assert.match(spec?.caption || '', /beyond F/);
});

test('a spoon bowl-side explanation also earns the concave mirror diagram', () => {
  const spec = studyOpticsVisualSpec(
    'Look into the bowl side of a spoon and move it slowly away from your face.',
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

test('existing subject diagrams remain available when the topic itself establishes the subject', () => {
  assert.equal(studyAllowsAutomaticTeachingVisual('Newtonian inertia'), true);
  assert.equal(studyPictureFitsTopic(
    'Passenger motion when a vehicle brakes: velocity continues forward while the braking force acts backward',
    'Newtonian inertia',
  ), true);
  assert.equal(studyAllowsAutomaticTeachingVisual('What is Algebra?'), true);
  assert.equal(studyPictureFitsTopic(
    'Undo subtraction by adding the same number to both sides of the equation',
    'What is Algebra?',
  ), true);
});

test('the word curve alone is not enough to justify a graph inside a non-graph topic', () => {
  assert.equal(studyPictureFitsTopic(
    'The curved surface changes the direction of reflected rays',
    'Light: Reflection & Refraction',
  ), false);
});
