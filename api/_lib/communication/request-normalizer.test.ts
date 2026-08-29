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

test("real calculator phrasing is inferred as a build even when the client misses it", () => {
  const request = normalizeCommunicationRequest({
    message: "Design a calculator that performs the basic functions with an iOS theme",
    buildMode: false,
  });

  assert.equal(request.buildMode, true);
  assert.equal(request.taskCategory, "coding");
});

test("refineMode forces a coding build even when the prompt is a follow-up", () => {
  const request = normalizeCommunicationRequest({
    message: "Please include a currency converter",
    refineMode: true,
    previewCode: "<!DOCTYPE html><html><body>shop</body></html>",
    buildMode: false,
  });

  assert.equal(request.isRefine, true);
  assert.equal(request.hasPreviewCode, true);
  assert.equal(request.buildMode, true);
});

test("ordinary design discussion is not forced into build mode", () => {
  const request = normalizeCommunicationRequest({
    message: "Explain Apple's design principles",
  });

  assert.equal(request.buildMode, false);
});

test("omitted Studio mode remains distinguishable from an explicit Ask override", () => {
  const inferredBuild = normalizeCommunicationRequest({ message: "Build a React app", buildMode: true });
  const explicitAsk = normalizeCommunicationRequest({ message: "Explain React", studioMode: "ask", buildMode: true });

  assert.equal(inferredBuild.studioMode, "ask");
  assert.equal(inferredBuild.studioModeExplicit, false);
  assert.equal(inferredBuild.buildMode, true);
  assert.equal(explicitAsk.studioModeExplicit, true);
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

test("explicit Study workspace stays Study even if the user mentions a trip", () => {
  const request = normalizeCommunicationRequest({
    studioDomain: "education",
    message: "After this chapter I might take a trip. First teach me kinematics.",
  });

  assert.equal(request.studioDomain, "education");
});

test("Study learner context is accepted only inside the Study workspace", () => {
  const studyContext = { conceptKey: "physics.motion", conceptLabel: "Motion" };
  assert.deepEqual(normalizeCommunicationRequest({ studioDomain: "education", message: "Continue", studyContext }).studyContext, studyContext);
  for (const studioDomain of ["finance", "research", "travel", null]) {
    assert.equal(normalizeCommunicationRequest({ studioDomain, message: "Continue", studyContext }).studyContext, null);
  }
});

test("explicit Travel workspace stays Travel even if the user asks to study", () => {
  const request = normalizeCommunicationRequest({
    studioDomain: "travel",
    message: "Also quiz me on Newton later. For now find hotels in Tokyo.",
  });

  assert.equal(request.studioDomain, "travel");
});

test("a clear first-turn Travel request can recover domain before client metadata arrives", () => {
  const request = normalizeCommunicationRequest({
    message: "Help me plan a trip to Bali and compare flights.",
  });

  assert.equal(request.studioDomain, "travel");
});

test("attractions and hotels from ordinary Studio chat still resolve to Travel", () => {
  const singapore = normalizeCommunicationRequest({
    message: "give me the list o attactions in Singapore and include the hotels to stay",
  });
  const vizag = normalizeCommunicationRequest({
    message: "give me the list o attactions in Vizag and include the hotels to stay",
  });
  assert.equal(singapore.studioDomain, "travel");
  assert.equal(vizag.studioDomain, "travel");
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

test("a coding preview follow-up about cart and budget stays coding, not Finance", () => {
  const request = normalizeCommunicationRequest({
    message: "Keep the boutique cart under budget and show prices in INR",
    previewCode: "<!DOCTYPE html><html><body>shop</body></html>",
    refineMode: true,
    buildMode: false,
  });

  assert.equal(request.studioDomain, null);
  assert.equal(request.buildMode, true);
  assert.equal(request.hasPreviewCode, true);
});

test("a chat-only deskContext packet keeps Study/Travel/Research follow-ups on coding", () => {
  const history = [
    { sender: "user", text: "Build me a simple calculator" },
    { sender: "ai", text: "Done — here is a working calculator." },
  ];
  for (const message of [
    "also help me study for the JEE exam",
    "also help me plan a trip with hotels",
    "research the literature while I investigate this",
    "keep this under budget for my taxes",
  ]) {
    const request = normalizeCommunicationRequest({
      message,
      history,
      buildMode: false,
      taskCategory: "coding",
      deskContext: { files: ["src/App.jsx", "index.html"] },
    });
    assert.equal(request.studioDomain, null, `desk packet must stay coding: ${message}`);
    assert.equal(request.buildMode, false);
  }
});

test("a cold tax and portfolio question from empty chat can still open Finance", () => {
  const request = normalizeCommunicationRequest({
    message: "help me with my taxes and portfolio",
  });

  assert.equal(request.studioDomain, "finance");
});
