export const STUDY_ASSESSMENT_ITEM_BANK_VERSION = "study-assessment-items-2026-08-26.1";

export type StudyAssessmentOption = { id: string; text: string };
export type StudyAssessmentReviewStatus = "approved" | "draft" | "rejected";

export type StudyAssessmentItem = {
  key: string;
  version: string;
  conceptKey: string;
  prompt: string;
  options: StudyAssessmentOption[];
  correctOptionId: string;
  explanation: string;
  difficulty: number;
  objectiveCode: string;
  cognitiveOperation: "recall" | "representation" | "application" | "error_detection";
  misconceptionOptionIds: string[];
  reviewStatus: StudyAssessmentReviewStatus;
};

const ITEMS: StudyAssessmentItem[] = [
  {
    key: "trig-functions-quadrant-sign",
    version: "1",
    conceptKey: "math.trigonometry.functions",
    prompt: "An angle lies in quadrant II. Which statement must be true?",
    options: [
      { id: "a", text: "Its sine is positive and its cosine is negative." },
      { id: "b", text: "Its sine and cosine are both positive." },
      { id: "c", text: "Its sine is negative and its cosine is positive." },
      { id: "d", text: "Its sine and cosine are both negative." },
    ],
    correctOptionId: "a",
    explanation: "In quadrant II, the vertical coordinate is positive and the horizontal coordinate is negative, so sine is positive and cosine is negative.",
    difficulty: 0.35,
    objectiveCode: "trig-signs-q2",
    cognitiveOperation: "representation",
    misconceptionOptionIds: ["b", "c", "d"],
    reviewStatus: "approved",
  },
  {
    key: "trig-identities-unit-circle",
    version: "1",
    conceptKey: "math.trigonometry.identities",
    prompt: "Which expression is equal to 1 for every angle x where the functions are defined?",
    options: [
      { id: "a", text: "sin(x) + cos(x)" },
      { id: "b", text: "sin²(x) + cos²(x)" },
      { id: "c", text: "tan(x) + cot(x)" },
      { id: "d", text: "sin(x)cos(x)" },
    ],
    correctOptionId: "b",
    explanation: "The Pythagorean identity sin²(x) + cos²(x) = 1 follows from the unit circle.",
    difficulty: 0.3,
    objectiveCode: "trig-pythagorean-identity",
    cognitiveOperation: "recall",
    misconceptionOptionIds: ["a", "c", "d"],
    reviewStatus: "approved",
  },
  {
    key: "scalar-vector-classification",
    version: "1",
    conceptKey: "math.vector.scalar-vector",
    prompt: "Which quantity requires both a magnitude and a direction to be fully specified?",
    options: [
      { id: "a", text: "Temperature" },
      { id: "b", text: "Mass" },
      { id: "c", text: "Velocity" },
      { id: "d", text: "Time" },
    ],
    correctOptionId: "c",
    explanation: "Velocity is a vector: its magnitude alone does not specify the direction of motion.",
    difficulty: 0.25,
    objectiveCode: "vector-scalar-classification",
    cognitiveOperation: "recall",
    misconceptionOptionIds: ["a", "b", "d"],
    reviewStatus: "approved",
  },
  {
    key: "vector-resultant-perpendicular",
    version: "1",
    conceptKey: "math.vector.resultant",
    prompt: "A 3 N eastward force and a 4 N northward force act together. What is the magnitude of their resultant?",
    options: [
      { id: "a", text: "1 N" },
      { id: "b", text: "5 N" },
      { id: "c", text: "7 N" },
      { id: "d", text: "12 N" },
    ],
    correctOptionId: "b",
    explanation: "The forces are perpendicular, so the resultant magnitude is √(3² + 4²) = 5 N.",
    difficulty: 0.45,
    objectiveCode: "vector-resultant-perpendicular",
    cognitiveOperation: "application",
    misconceptionOptionIds: ["c"],
    reviewStatus: "approved",
  },
  {
    key: "vector-components-angle",
    version: "1",
    conceptKey: "math.vector.components",
    prompt: "A vector of magnitude V makes an angle θ above the positive x-axis. What is its x-component?",
    options: [
      { id: "a", text: "V sin(θ)" },
      { id: "b", text: "V cos(θ)" },
      { id: "c", text: "V tan(θ)" },
      { id: "d", text: "V / cos(θ)" },
    ],
    correctOptionId: "b",
    explanation: "The x-component is adjacent to θ in the component triangle, so it is V cos(θ).",
    difficulty: 0.4,
    objectiveCode: "vector-resolve-x-component",
    cognitiveOperation: "representation",
    misconceptionOptionIds: ["a"],
    reviewStatus: "approved",
  },
  {
    key: "kinematics-acceleration-change",
    version: "1",
    conceptKey: "physics.kinematics.speed-velocity-acceleration",
    prompt: "A car's velocity changes from 6 m/s east to 14 m/s east in 4 s. What is its average acceleration?",
    options: [
      { id: "a", text: "2 m/s² east" },
      { id: "b", text: "5 m/s² east" },
      { id: "c", text: "8 m/s² east" },
      { id: "d", text: "20 m/s² east" },
    ],
    correctOptionId: "a",
    explanation: "Average acceleration is the velocity change divided by time: (14 - 6) / 4 = 2 m/s² east.",
    difficulty: 0.4,
    objectiveCode: "kinematics-average-acceleration",
    cognitiveOperation: "application",
    misconceptionOptionIds: ["b", "c"],
    reviewStatus: "approved",
  },
  {
    key: "motion-graphs-velocity-slope",
    version: "1",
    conceptKey: "physics.kinematics.motion-graphs",
    prompt: "On a displacement-time graph, what does the slope at a point represent?",
    options: [
      { id: "a", text: "Acceleration" },
      { id: "b", text: "Displacement" },
      { id: "c", text: "Velocity" },
      { id: "d", text: "Distance travelled" },
    ],
    correctOptionId: "c",
    explanation: "The slope is change in displacement divided by change in time, which is velocity.",
    difficulty: 0.35,
    objectiveCode: "motion-graph-displacement-slope",
    cognitiveOperation: "representation",
    misconceptionOptionIds: ["a"],
    reviewStatus: "approved",
  },
  {
    key: "motion-plane-independent-components",
    version: "1",
    conceptKey: "physics.kinematics.motion-in-plane",
    prompt: "For ideal two-dimensional motion with constant downward gravity, which statement is correct?",
    options: [
      { id: "a", text: "Horizontal acceleration equals vertical acceleration." },
      { id: "b", text: "Horizontal and vertical components can be analysed independently using the same time." },
      { id: "c", text: "Vertical velocity remains constant." },
      { id: "d", text: "Horizontal motion determines the downward acceleration." },
    ],
    correctOptionId: "b",
    explanation: "The two components share time but obey separate component equations; gravity acts vertically in the ideal model.",
    difficulty: 0.55,
    objectiveCode: "motion-plane-component-independence",
    cognitiveOperation: "representation",
    misconceptionOptionIds: ["a", "c", "d"],
    reviewStatus: "approved",
  },
  {
    key: "projectile-horizontal-velocity",
    version: "1",
    conceptKey: "physics.kinematics.projectile-motion",
    prompt: "Ignoring air resistance, what happens to a projectile's horizontal velocity while it is in flight?",
    options: [
      { id: "a", text: "It increases because gravity acts forward." },
      { id: "b", text: "It decreases at 9.8 m/s each second." },
      { id: "c", text: "It remains constant." },
      { id: "d", text: "It becomes zero at the highest point." },
    ],
    correctOptionId: "c",
    explanation: "With no air resistance there is no horizontal force, so horizontal acceleration is zero and horizontal velocity stays constant.",
    difficulty: 0.4,
    objectiveCode: "projectile-horizontal-component",
    cognitiveOperation: "error_detection",
    misconceptionOptionIds: ["b", "d"],
    reviewStatus: "approved",
  },
];

export function studyAssessmentItemsForConcept(conceptKey: string): StudyAssessmentItem[] {
  return ITEMS.filter((item) => item.conceptKey === conceptKey).map((item) => ({
    ...item,
    options: item.options.map((option) => ({ ...option })),
    misconceptionOptionIds: [...item.misconceptionOptionIds],
  }));
}

export function findStudyAssessmentItem(itemKey: string, version: string): StudyAssessmentItem | null {
  const item = ITEMS.find((candidate) => candidate.key === itemKey && candidate.version === version);
  return item ? { ...item, options: item.options.map((option) => ({ ...option })), misconceptionOptionIds: [...item.misconceptionOptionIds] } : null;
}

export function publicStudyAssessmentItem(item: StudyAssessmentItem) {
  return {
    itemKey: item.key,
    itemVersion: item.version,
    conceptKey: item.conceptKey,
    prompt: item.prompt,
    options: item.options.map((option) => ({ ...option })),
    responseFormat: "single_correct" as const,
  };
}
