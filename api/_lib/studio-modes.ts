export type StudioMode = "ask" | "build" | "plan";

export function normalizeStudioMode(value: unknown): StudioMode {
  if (value === "build" || value === "plan") return value;
  return "ask";
}

export const PLAN_DIRECTIVE = `PLAN APP MODE (software / application architecture ONLY)
Use this directive ONLY when the user is planning a software application, feature, or technical system to build.
If they are planning something else — travel, finance, events, career, research, etc. — ignore this JSON schema completely and follow the normal conversation loop instead.

When this directive applies:
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
