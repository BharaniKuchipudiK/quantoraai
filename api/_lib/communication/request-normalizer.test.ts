import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommunicationRequest } from "./request-normalizer.js";

test("projectId is a first-class communication field", () => {
  const request = normalizeCommunicationRequest({
    message: "Continue the architecture",
    projectId: "project-quantora",
  });

  assert.equal(request.projectId, "project-quantora");
});

test("existing project context supplies projectId without polluting SessionContext", () => {
  const request = normalizeCommunicationRequest({
    message: "Continue",
    sessionContext: {
      projectId: "project-quantora",
      goal: "Build Quantora",
      facts: ["PCL owns mission continuity"],
    },
  });

  assert.equal(request.projectId, "project-quantora");
  assert.deepEqual(request.sessionContext, {
    goal: "Build Quantora",
    facts: ["PCL owns mission continuity"],
  });
});

test("invalid project identity is rejected instead of trusted", () => {
  const request = normalizeCommunicationRequest({
    message: "Continue",
    projectId: "../../other-project",
  });

  assert.equal(request.projectId, null);
});
