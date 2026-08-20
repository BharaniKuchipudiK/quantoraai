export const CODE_PROJECT_COGNITION_VERSION = "code-project-cognition-2026-08-20.1";

export type CodeProjectFile = {
  path: string;
  content: string;
  language?: string | null;
};

export type CodeProjectIntent = "build" | "fix" | "refactor" | "learn" | "explore" | "maintain";
export type CodeProjectPurpose =
  | "web_app"
  | "api_service"
  | "data_project"
  | "automation"
  | "game"
  | "three_d_experience"
  | "robotics_simulation"
  | "animation"
  | "python_application"
  | "software_project";

export type CodeRuntimeClass = "browser_web" | "browser_python" | "sandbox_linux" | "gpu_render";

export type CodeProjectCognition = {
  version: string;
  purpose: CodeProjectPurpose;
  purposeLabel: string;
  objective: string;
  intent: CodeProjectIntent;
  confidence: number;
  languages: string[];
  frameworks: string[];
  architecture: string[];
  runtimeClass: CodeRuntimeClass;
  runtimeReasons: string[];
  evidence: string[];
};

const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "JavaScript",
  jsx: "JavaScript/React",
  ts: "TypeScript",
  tsx: "TypeScript/React",
  py: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  java: "Java",
  go: "Go",
  rs: "Rust",
  c: "C",
  cc: "C++",
  cpp: "C++",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  sql: "SQL",
  glsl: "GLSL",
  wgsl: "WGSL",
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ext(path: string): string {
  const tail = path.split("/").pop() || "";
  const dot = tail.lastIndexOf(".");
  return dot >= 0 ? tail.slice(dot + 1).toLowerCase() : "";
}

function parsePackageJson(files: CodeProjectFile[]): Record<string, any> | null {
  const manifest = files.find((file) => /(^|\/)package\.json$/i.test(file.path));
  if (!manifest) return null;
  try {
    return JSON.parse(manifest.content);
  } catch {
    return null;
  }
}

function packageNames(pkg: Record<string, any> | null): string[] {
  if (!pkg) return [];
  return unique([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ].map((value) => value.toLowerCase()));
}

function projectText(files: CodeProjectFile[], prompt: string, projectName: string): string {
  const interesting = files
    .filter((file) => /readme|package\.json|pyproject|requirements|docker|compose|\.ya?ml$|\.md$/i.test(file.path))
    .slice(0, 10)
    .map((file) => `${file.path}\n${file.content.slice(0, 5000)}`)
    .join("\n");
  return `${projectName}\n${prompt}\n${interesting}`.toLowerCase();
}

function detectLanguages(files: CodeProjectFile[]): string[] {
  return unique(files.map((file) => file.language || EXTENSION_LANGUAGE[ext(file.path)] || ""));
}

function detectFrameworks(packages: string[], text: string): string[] {
  const result: string[] = [];
  const has = (name: string) => packages.includes(name);
  if (has("react") || /\breact\b/.test(text)) result.push("React");
  if (has("next") || /\bnext\.js\b/.test(text)) result.push("Next.js");
  if (has("vue") || /\bvue\b/.test(text)) result.push("Vue");
  if (has("@angular/core") || /\bangular\b/.test(text)) result.push("Angular");
  if (has("express") || /\bexpress\b/.test(text)) result.push("Express");
  if (has("vite") || /\bvite\b/.test(text)) result.push("Vite");
  if (has("three") || /\bthree\.js\b|\bthreejs\b/.test(text)) result.push("Three.js");
  if (has("phaser") || /\bphaser\b/.test(text)) result.push("Phaser");
  if (has("pixi.js") || /\bpixi\b/.test(text)) result.push("PixiJS");
  if (has("@react-three/fiber") || /react three fiber/.test(text)) result.push("React Three Fiber");
  if (/\bfastapi\b/.test(text)) result.push("FastAPI");
  if (/\bflask\b/.test(text)) result.push("Flask");
  if (/\bdjango\b/.test(text)) result.push("Django");
  if (/\bblender\b|\bbpy\b/.test(text)) result.push("Blender");
  return unique(result);
}

function detectIntent(prompt: string): CodeProjectIntent {
  const text = prompt.toLowerCase();
  if (/\b(fix|bug|broken|error|crash|debug|repair|failing)\b/.test(text)) return "fix";
  if (/\b(refactor|simplify|clean up|optimi[sz]e|improve architecture|moderni[sz]e)\b/.test(text)) return "refactor";
  if (/\b(explain|teach|learn|understand|walk me through)\b/.test(text)) return "learn";
  if (/\b(explore|experiment|prototype|try|play with)\b/.test(text)) return "explore";
  if (/\b(maintain|upgrade|migrate|update dependenc|security patch)\b/.test(text)) return "maintain";
  return "build";
}

function detectPurpose(text: string, frameworks: string[], languages: string[]): { purpose: CodeProjectPurpose; label: string; evidence: string[] } {
  const evidence: string[] = [];
  const frameworkSet = new Set(frameworks);

  if (/\b(drone|robot|robotics|quadcopter|ros\b|gazebo|kinematics|trajectory|lidar)\b/.test(text)) {
    evidence.push("robotics/drone concepts found in project intent or metadata");
    return { purpose: "robotics_simulation", label: "Robotics / drone simulation", evidence };
  }
  if (/\b(animation|animated film|short film|storyboard|keyframe|rigging|cinematic|render frames?)\b/.test(text) || frameworkSet.has("Blender")) {
    evidence.push("animation/rendering concepts found in project intent or dependencies");
    return { purpose: "animation", label: "Animation / computational filmmaking", evidence };
  }
  if (frameworkSet.has("Three.js") || frameworkSet.has("React Three Fiber") || /\b(webgl|webgpu|3d scene|three[- ]?d)\b/.test(text)) {
    evidence.push("3D/WebGL/WebGPU framework or intent detected");
    return { purpose: "three_d_experience", label: "Interactive 3D experience", evidence };
  }
  if (frameworkSet.has("Phaser") || frameworkSet.has("PixiJS") || /\b(game|gameplay|player score|level design)\b/.test(text)) {
    evidence.push("game framework or gameplay intent detected");
    return { purpose: "game", label: "Interactive game", evidence };
  }
  if (/\b(pandas|numpy|scikit|sklearn|matplotlib|jupyter|dataframe|machine learning|regression|dataset)\b/.test(text)) {
    evidence.push("data/scientific-computing concepts detected");
    return { purpose: "data_project", label: "Data / scientific computing project", evidence };
  }
  if (/\b(cron|automation|scrape|workflow|batch job|script to)\b/.test(text)) {
    evidence.push("automation concepts detected");
    return { purpose: "automation", label: "Automation project", evidence };
  }
  if (frameworkSet.has("Express") || frameworkSet.has("FastAPI") || frameworkSet.has("Flask") || frameworkSet.has("Django") || /\b(rest api|graphql|backend service|endpoint)\b/.test(text)) {
    evidence.push("server/API framework or service intent detected");
    return { purpose: "api_service", label: "API / backend service", evidence };
  }
  if (frameworks.some((item) => ["React", "Next.js", "Vue", "Angular", "Vite"].includes(item)) || languages.includes("HTML")) {
    evidence.push("web application framework or HTML entrypoint detected");
    return { purpose: "web_app", label: "Web application", evidence };
  }
  if (languages.includes("Python")) {
    evidence.push("Python source detected");
    return { purpose: "python_application", label: "Python application", evidence };
  }
  return { purpose: "software_project", label: "Software project", evidence: ["general software project structure detected"] };
}

function architectureSignals(files: CodeProjectFile[], frameworks: string[], text: string): string[] {
  const paths = files.map((file) => file.path.toLowerCase());
  const signals: string[] = [];
  if (frameworks.some((item) => ["React", "Next.js", "Vue", "Angular", "Vite"].includes(item)) || paths.some((path) => /(^|\/)(src|app|pages|components)(\/|$)/.test(path))) signals.push("frontend");
  if (frameworks.some((item) => ["Express", "FastAPI", "Flask", "Django"].includes(item)) || paths.some((path) => /(^|\/)(api|server|backend)(\/|$)/.test(path))) signals.push("backend");
  if (/\b(postgres|mysql|mongodb|redis|sqlite|supabase)\b/.test(text) || paths.some((path) => /schema|migration|database|\.sql$/.test(path))) signals.push("database");
  if (frameworks.some((item) => ["Three.js", "React Three Fiber", "Blender"].includes(item))) signals.push("3d");
  if (/\b(test|spec|vitest|jest|pytest|playwright)\b/.test(text) || paths.some((path) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./.test(path))) signals.push("tests");
  if (paths.some((path) => /dockerfile|docker-compose|compose\.ya?ml/.test(path))) signals.push("containerized");
  return unique(signals);
}

function runtimeFor(input: { purpose: CodeProjectPurpose; languages: string[]; frameworks: string[]; architecture: string[]; text: string }): { runtimeClass: CodeRuntimeClass; reasons: string[] } {
  const { purpose, languages, frameworks, architecture, text } = input;
  if (purpose === "animation" && (frameworks.includes("Blender") || /\b(cycles|eevee|gpu render|render farm)\b/.test(text))) {
    return { runtimeClass: "gpu_render", reasons: ["film-quality rendering or Blender workload requires a GPU-capable render worker"] };
  }
  if (architecture.includes("containerized") || languages.some((language) => ["Java", "Go", "Rust", "C", "C++", "C#", "Ruby", "PHP"].includes(language)) || /\b(docker|kubernetes|native module|system package)\b/.test(text)) {
    return { runtimeClass: "sandbox_linux", reasons: ["project requires a full isolated Linux environment rather than browser-only execution"] };
  }
  if (languages.includes("Python") && !languages.some((language) => /JavaScript|TypeScript|HTML|CSS/.test(language))) {
    return { runtimeClass: "browser_python", reasons: ["Python-first project can begin in a browser Python runtime and escalate if native capabilities are required"] };
  }
  return { runtimeClass: "browser_web", reasons: ["web/JavaScript workload can execute close to the user in the browser before consuming remote compute"] };
}

function deriveObjective(prompt: string, projectName: string, purposeLabel: string): string {
  const cleanPrompt = prompt.replace(/\s+/g, " ").trim();
  if (cleanPrompt) return cleanPrompt.length > 220 ? `${cleanPrompt.slice(0, 217)}…` : cleanPrompt;
  if (projectName.trim()) return `Build and evolve ${projectName.trim()} as a ${purposeLabel.toLowerCase()}.`;
  return `Build and evolve this ${purposeLabel.toLowerCase()} while preserving its intended behaviour and architecture.`;
}

export function inferCodeProjectCognition(input: {
  files?: CodeProjectFile[];
  prompt?: string | null;
  projectName?: string | null;
}): CodeProjectCognition {
  const files = (input.files || []).filter((file) => file && typeof file.path === "string" && typeof file.content === "string");
  const prompt = String(input.prompt || "");
  const projectName = String(input.projectName || "");
  const pkg = parsePackageJson(files);
  const packages = packageNames(pkg);
  const text = projectText(files, prompt, projectName);
  const languages = detectLanguages(files);
  const frameworks = detectFrameworks(packages, text);
  const purposeResult = detectPurpose(text, frameworks, languages);
  const architecture = architectureSignals(files, frameworks, text);
  const runtime = runtimeFor({
    purpose: purposeResult.purpose,
    languages,
    frameworks,
    architecture,
    text,
  });

  const evidence = unique([
    ...purposeResult.evidence,
    ...(languages.length ? [`languages: ${languages.join(", ")}`] : []),
    ...(frameworks.length ? [`frameworks: ${frameworks.join(", ")}`] : []),
    ...(architecture.length ? [`architecture signals: ${architecture.join(", ")}`] : []),
  ]);

  const signalCount = languages.length + frameworks.length + architecture.length + (prompt.trim() ? 1 : 0) + (files.length ? 1 : 0);

  return {
    version: CODE_PROJECT_COGNITION_VERSION,
    purpose: purposeResult.purpose,
    purposeLabel: purposeResult.label,
    objective: deriveObjective(prompt, projectName, purposeResult.label),
    intent: detectIntent(prompt),
    confidence: clamp01(0.45 + Math.min(signalCount, 8) * 0.065),
    languages,
    frameworks,
    architecture,
    runtimeClass: runtime.runtimeClass,
    runtimeReasons: runtime.reasons,
    evidence,
  };
}
