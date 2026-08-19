import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_MIGRATION_EXECUTIVE_STRATEGY_BLUEPRINT,
  instantiateGoldenOutcomeBlueprint,
} from "./golden-outcome-blueprints.js";

test("Golden Cloud Migration workflow starts as canonical project Outcome State", () => {
  const state = instantiateGoldenOutcomeBlueprint(CLOUD_MIGRATION_EXECUTIVE_STRATEGY_BLUEPRINT);

  assert.equal(state.goal?.status, "draft");
  assert.match(state.goal?.statement || "", /cloud migration strategy/i);
  assert.equal(state.memory.scope, "project");
  assert.equal(state.definitionOfDone.length, 8);
  assert.equal(state.definitionOfDone.every((item) => item.confirmed === false), true);
  assert.equal(state.openQuestions.length, 4);
  assert.equal(state.openQuestions.every((item) => item.material), true);
  assert.equal(state.nextActions.length, 6);
  assert.equal(state.artifacts.length, 0);
});

test("Golden Workflow never pre-claims completion or verification", () => {
  const state = instantiateGoldenOutcomeBlueprint(CLOUD_MIGRATION_EXECUTIVE_STRATEGY_BLUEPRINT);
  assert.notEqual(state.goal?.status, "achieved");
  assert.equal(state.artifacts.some((artifact) => Boolean(artifact.verifiedAt)), false);
  assert.deepEqual(state.cognitiveLedger, []);
});
