export type StudioMode = "ask" | "build" | "plan";

export function normalizeStudioMode(value: unknown): StudioMode {
  if (value === "build" || value === "plan") return value;
  return "ask";
}

export const PLAN_DIRECTIVE = `PLAN MODE
The user wants an architecture plan before implementation — not code yet.
- Output ONLY valid JSON (no markdown fences, no commentary before or after).
- Schema:
{
  "title": "App or feature name",
  "techStack": ["React", "Vite", "etc"],
  "keyFeatures": ["feature 1", "feature 2"],
  "dataModels": [{"name": "EntityName", "fields": ["id", "name"]}],
  "risks": ["risk or tradeoff 1"],
  "nextStep": "One clear sentence on what to build first"
}`;
