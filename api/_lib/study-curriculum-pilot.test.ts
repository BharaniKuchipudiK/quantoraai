import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyCurriculumBridge } from "./study-curriculum-bridge.js";
import {
  buildStudyCurriculumPilot2026,
  STUDY_CURRICULUM_PILOT_SOURCES,
} from "./study-curriculum-pilot-2026.js";
import { validateStudyTruthSnapshot } from "./study-truth-layer.js";

test("2026 pilot is a valid universal graph with official curriculum sources and derived prerequisites", () => {
  const snapshot = buildStudyCurriculumPilot2026();
  assert.equal(validateStudyTruthSnapshot(snapshot).valid, true);
  assert.equal(snapshot.concepts.length, 9);
  assert.equal(snapshot.curricula.length, 3);
  assert.ok(snapshot.mappings.length >= 12);
  assert.ok(snapshot.edges.every((edge) => edge.provenance === "derived"));
  assert.ok(snapshot.curricula.every((curriculum) => /^https:\/\//.test(curriculum.sourceRef)));
  assert.match(STUDY_CURRICULUM_PILOT_SOURCES.singaporeAdditionalMathematics, /\.gov\.sg\//);
  assert.match(STUDY_CURRICULUM_PILOT_SOURCES.singaporePhysics, /\.gov\.sg\//);
  assert.match(STUDY_CURRICULUM_PILOT_SOURCES.jeeMain, /s3waas\.gov\.in\//);
  assert.ok(snapshot.mappings.every((mapping) => mapping.examWeight == null));
});

test("Singapore to JEE bridge identifies vector components before motion in a plane and projectile motion", () => {
  const bridge = buildStudyCurriculumBridge({
    snapshot: buildStudyCurriculumPilot2026(),
    sourceCurriculumIds: [
      "sg.seab.olevel.additional-mathematics.4049",
      "sg.seab.olevel.physics.6091",
    ],
    targetCurriculumId: "in.nta.jeemain.paper1",
  });

  assert.equal(bridge.recommendedFirstConceptId, "math.vector.components");
  const vectorComponents = bridge.bridgeConcepts.find((item) => item.conceptId === "math.vector.components");
  assert.equal(vectorComponents?.status, "ready_bridge");
  assert.deepEqual(vectorComponents?.blockingPrerequisiteIds, []);
  assert.ok(vectorComponents?.coveredPrerequisiteIds.includes("math.trigonometry.functions"));
  assert.ok(vectorComponents?.coveredPrerequisiteIds.includes("math.vector.scalar-vector"));
  assert.ok(vectorComponents?.unlocksTargetConceptIds.includes("physics.kinematics.motion-in-plane"));
  assert.ok(vectorComponents?.unlocksTargetConceptIds.includes("physics.kinematics.projectile-motion"));

  const motionInPlane = bridge.bridgeConcepts.find((item) => item.conceptId === "physics.kinematics.motion-in-plane");
  assert.equal(motionInPlane?.status, "blocked_bridge");
  assert.ok(motionInPlane?.blockingPrerequisiteIds.includes("math.vector.components"));

  const projectile = bridge.bridgeConcepts.find((item) => item.conceptId === "physics.kinematics.projectile-motion");
  assert.equal(projectile?.status, "blocked_bridge");
  assert.ok(projectile?.blockingPrerequisiteIds.includes("physics.kinematics.motion-in-plane"));
});

test("curriculum bridge never equates curriculum coverage with learner mastery", () => {
  const bridge = buildStudyCurriculumBridge({
    snapshot: buildStudyCurriculumPilot2026(),
    sourceCurriculumIds: ["sg.seab.olevel.physics.6091"],
    targetCurriculumId: "in.nta.jeemain.paper1",
  });
  const alreadyCovered = bridge.bridgeConcepts.filter((item) => item.status === "already_covered");
  assert.ok(alreadyCovered.length > 0);
  assert.ok(alreadyCovered.every((item) => item.reasonCodes.includes("curriculum_overlap")));
  assert.equal(Object.prototype.hasOwnProperty.call(alreadyCovered[0], "mastery"), false);
});

test("unknown curriculum ids fail closed", () => {
  const snapshot = buildStudyCurriculumPilot2026();
  assert.throws(() => buildStudyCurriculumBridge({
    snapshot,
    sourceCurriculumIds: ["missing"],
    targetCurriculumId: "in.nta.jeemain.paper1",
  }), /requires_source_curriculum/);
  assert.throws(() => buildStudyCurriculumBridge({
    snapshot,
    sourceCurriculumIds: ["sg.seab.olevel.physics.6091"],
    targetCurriculumId: "missing",
  }), /target_not_found/);
});
