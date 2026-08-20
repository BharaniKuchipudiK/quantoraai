import assert from "node:assert/strict";
import test from "node:test";
import { inferCodeProjectCognition } from "./code-project-cognition.js";
import { chooseCodeRuntime } from "./code-runtime-broker.js";
import {
  canClaimCodeOutcomeComplete,
  decideCodeRepair,
  defaultCodeRepairPolicy,
  nextRepairAttempt,
  type CodeDiagnostic,
} from "./code-self-heal.js";

const reactFiles = [
  {
    path: "package.json",
    content: JSON.stringify({ dependencies: { react: "latest", "react-dom": "latest", vite: "latest", three: "latest" } }),
  },
  {
    path: "src/App.jsx",
    content: "export default function App(){ return <main>Drone simulator</main> }",
  },
];

test("PCL code cognition understands project purpose before editing", () => {
  const cognition = inferCodeProjectCognition({
    projectName: "Drone Lab",
    prompt: "Build a quadcopter simulator where I can tune rotor speeds and understand the flight behaviour.",
    files: reactFiles,
  });

  assert.equal(cognition.purpose, "robotics_simulation");
  assert.equal(cognition.intent, "build");
  assert.ok(cognition.frameworks.includes("React"));
  assert.ok(cognition.frameworks.includes("Three.js"));
  assert.ok(cognition.architecture.includes("frontend"));
  assert.equal(cognition.runtimeClass, "browser_web");
  assert.ok(cognition.confidence > 0.6);
  assert.match(cognition.objective, /quadcopter simulator/i);
});

test("film-quality Blender workloads route to specialized GPU rendering", () => {
  const cognition = inferCodeProjectCognition({
    prompt: "Create an animated short film in Blender and render the frames with Cycles.",
    files: [{ path: "film.py", content: "import bpy\n# render animated scene" }],
  });
  assert.equal(cognition.purpose, "animation");
  assert.equal(cognition.runtimeClass, "gpu_render");

  const runtime = chooseCodeRuntime({ cognition });
  assert.equal(runtime.preferred.tier, "gpu");
  assert.equal(runtime.preferred.id, "gpu-render");
});

test("Docker and native-language projects escalate instead of pretending the browser can run them", () => {
  const cognition = inferCodeProjectCognition({
    prompt: "Run this Go service with Postgres using Docker Compose.",
    files: [
      { path: "main.go", content: "package main" },
      { path: "docker-compose.yml", content: "services:\n  db:\n    image: postgres" },
    ],
  });

  assert.equal(cognition.runtimeClass, "sandbox_linux");
  const runtime = chooseCodeRuntime({ cognition });
  assert.equal(runtime.preferred.tier, "sandbox");
  assert.equal(runtime.shouldEscalate, true);
});

test("self-heal keeps diagnostics observable and requires verification", () => {
  const cognition = inferCodeProjectCognition({
    prompt: "Fix this React component.",
    files: reactFiles,
  });
  const policy = defaultCodeRepairPolicy({ cognition });
  assert.equal(policy.keepDiagnosticsVisible, true);
  assert.equal(policy.requireReviewableDiff, true);
  assert.equal(policy.requireVerification, true);

  const diagnostics: CodeDiagnostic[] = [{
    id: "runtime-1",
    source: "runtime",
    severity: "error",
    message: "ReferenceError: rotorSpeed is not defined",
    path: "src/App.jsx",
    line: 12,
  }];

  const decision = decideCodeRepair({ diagnostics, policy });
  assert.equal(decision.shouldRepair, true);
  assert.equal(decision.mode, "auto");
  assert.equal(canClaimCodeOutcomeComplete({ policy, diagnostics, evidence: { previewLoaded: true } }), false);

  assert.equal(canClaimCodeOutcomeComplete({
    policy,
    diagnostics: [],
    evidence: { buildPassed: true, previewLoaded: true, runtimeClean: true },
  }), true);
});

test("repair loop stops after the bounded attempt budget", () => {
  const cognition = inferCodeProjectCognition({ prompt: "Fix it", files: reactFiles });
  const policy = defaultCodeRepairPolicy({ cognition });
  const previousAttempts = Array.from({ length: policy.maxAttempts }, (_, index) => ({
    attempt: index + 1,
    status: "verify" as const,
    diagnosticIds: ["x"],
    changedFiles: ["src/App.jsx"],
  }));

  const next = nextRepairAttempt({
    previousAttempts,
    diagnostics: [{ id: "x", source: "runtime", severity: "error", message: "still broken" }],
    policy,
  });

  assert.equal(next.status, "failed");
  assert.match(next.summary || "", /budget exhausted/i);
});
