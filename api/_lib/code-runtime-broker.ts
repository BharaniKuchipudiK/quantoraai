import type { CodeProjectCognition, CodeRuntimeClass } from "./code-project-cognition.js";

export const CODE_RUNTIME_BROKER_VERSION = "code-runtime-broker-2026-08-20.1";

export type CodeRuntimeCapability =
  | "browser_js"
  | "browser_python"
  | "webgl"
  | "webgpu"
  | "node"
  | "linux"
  | "native_packages"
  | "network"
  | "docker"
  | "database"
  | "gpu_render";

export type CodeRuntimeTier = "browser" | "sandbox" | "gpu";

export type CodeRuntimeTarget = {
  id: string;
  tier: CodeRuntimeTier;
  runtimeClass: CodeRuntimeClass;
  capabilities: CodeRuntimeCapability[];
  estimatedCostClass: "zero_or_client" | "low_on_demand" | "specialized";
  reason: string;
};

export type CodeRuntimeDecision = {
  version: string;
  preferred: CodeRuntimeTarget;
  fallbacks: CodeRuntimeTarget[];
  missingCapabilities: CodeRuntimeCapability[];
  shouldEscalate: boolean;
};

const BROWSER_WEB: CodeRuntimeTarget = {
  id: "browser-web",
  tier: "browser",
  runtimeClass: "browser_web",
  capabilities: ["browser_js", "webgl", "webgpu", "node", "network"],
  estimatedCostClass: "zero_or_client",
  reason: "Run web, JavaScript and interactive 3D workloads on the user's device first.",
};

const BROWSER_PYTHON: CodeRuntimeTarget = {
  id: "browser-python",
  tier: "browser",
  runtimeClass: "browser_python",
  capabilities: ["browser_python", "network"],
  estimatedCostClass: "zero_or_client",
  reason: "Use browser Python for lightweight scientific and educational workloads before allocating remote compute.",
};

const SANDBOX_LINUX: CodeRuntimeTarget = {
  id: "sandbox-linux",
  tier: "sandbox",
  runtimeClass: "sandbox_linux",
  capabilities: ["node", "linux", "native_packages", "network", "docker", "database"],
  estimatedCostClass: "low_on_demand",
  reason: "Escalate to an isolated Linux sandbox when the browser cannot faithfully execute the project.",
};

const GPU_RENDER: CodeRuntimeTarget = {
  id: "gpu-render",
  tier: "gpu",
  runtimeClass: "gpu_render",
  capabilities: ["linux", "native_packages", "network", "gpu_render"],
  estimatedCostClass: "specialized",
  reason: "Use specialized GPU workers only for rendering or compute that genuinely requires them.",
};

const TARGETS = [BROWSER_WEB, BROWSER_PYTHON, SANDBOX_LINUX, GPU_RENDER] as const;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function supports(target: CodeRuntimeTarget, requested: CodeRuntimeCapability[]): boolean {
  return requested.every((capability) => target.capabilities.includes(capability));
}

function targetForClass(runtimeClass: CodeRuntimeClass): CodeRuntimeTarget {
  return TARGETS.find((target) => target.runtimeClass === runtimeClass) || BROWSER_WEB;
}

export function inferRequiredRuntimeCapabilities(cognition: CodeProjectCognition): CodeRuntimeCapability[] {
  const required: CodeRuntimeCapability[] = [];
  const architecture = new Set(cognition.architecture);
  const languages = new Set(cognition.languages);
  const frameworks = new Set(cognition.frameworks);

  if (cognition.runtimeClass === "browser_python" || languages.has("Python")) required.push("browser_python");
  if (cognition.runtimeClass === "browser_web") required.push("browser_js");
  if (frameworks.has("Three.js") || frameworks.has("React Three Fiber") || architecture.has("3d")) required.push("webgl");
  if (architecture.has("backend")) required.push("node");
  if (architecture.has("database")) required.push("database");
  if (architecture.has("containerized")) required.push("docker");
  if (cognition.runtimeClass === "sandbox_linux") required.push("linux");
  if (cognition.runtimeClass === "gpu_render") required.push("gpu_render");

  return unique(required);
}

export function chooseCodeRuntime(input: {
  cognition: CodeProjectCognition;
  requestedCapabilities?: CodeRuntimeCapability[];
}): CodeRuntimeDecision {
  const inferred = inferRequiredRuntimeCapabilities(input.cognition);
  const requested = unique([...(input.requestedCapabilities || []), ...inferred]);
  const preferredByClass = targetForClass(input.cognition.runtimeClass);

  const ordered = input.cognition.runtimeClass === "gpu_render"
    ? [GPU_RENDER]
    : input.cognition.runtimeClass === "sandbox_linux"
      ? [SANDBOX_LINUX, GPU_RENDER]
      : input.cognition.runtimeClass === "browser_python"
        ? [BROWSER_PYTHON, SANDBOX_LINUX, GPU_RENDER]
        : [BROWSER_WEB, SANDBOX_LINUX, GPU_RENDER];

  const preferred = ordered.find((target) => supports(target, requested)) || preferredByClass;
  const missingCapabilities = requested.filter((capability) => !preferred.capabilities.includes(capability));
  const fallbacks = ordered.filter((target) => target.id !== preferred.id && supports(target, requested));

  return {
    version: CODE_RUNTIME_BROKER_VERSION,
    preferred,
    fallbacks,
    missingCapabilities,
    shouldEscalate: preferred.tier !== "browser",
  };
}
