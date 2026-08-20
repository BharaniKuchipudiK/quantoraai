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

test("explicit Travel workspace selection remains authoritative", () => {
  const request = normalizeCommunicationRequest({
    studioDomain: "travel",
    message: "Tell me more",
  });

  assert.equal(request.studioDomain, "travel");
});

test("a clear first-turn Travel request can recover domain before client metadata arrives", () => {
  const request = normalizeCommunicationRequest({
    message: "Help me plan a trip to Bali and compare flights.",
  });

  assert.equal(request.studioDomain, "travel");
});

test("Travel survives a short follow-up when the client omits studioDomain", () => {
  const request = normalizeCommunicationRequest({
    message: "September 12 to 15",
    history: [
      { sender: "user", text: "I want to plan a trip to Bali and find flights." },
      { sender: "ai", text: "What dates are you considering for the trip?" },
    ],
  });

  assert.equal(request.studioDomain, "travel");
});

test("competing domain cues fail closed instead of guessing a workspace", () => {
  const request = normalizeCommunicationRequest({
    message: "Compare these",
    history: [
      { sender: "user", text: "I am balancing a travel trip with my finance budget." },
    ],
  });

  assert.equal(request.studioDomain, null);
});
