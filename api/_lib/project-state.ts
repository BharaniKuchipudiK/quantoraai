import { normalizeOutcomeState, type OutcomeState } from "./outcome-state.js";

export const DEFAULT_PROJECT_ID = "project-personal";

const MAX_PROJECT_ID = 128;
const MAX_SESSION_ID = 128;
const MAX_NAME = 120;
const MAX_DESCRIPTION = 2_000;
const MAX_GOAL = 2_000;
const MAX_COLOR = 64;
const MAX_RESOURCE_REF = 2_000;
const MAX_RESOURCE_TITLE = 240;
const MAX_RESOURCES_PER_SYNC = 100;
const MAX_SESSIONS_PER_PROJECT = 200;
const MAX_CONTEXT_ITEMS = 40;
const MAX_CONTEXT_FACTS = 16;
const MAX_CONTEXT_TEXT = 500;

export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRecord = {
  id: string;
  version: number;
  name: string;
  description: string;
  goal: string;
  status: ProjectStatus;
  color: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
};

export type ProjectResource = {
  kind: string;
  ref: string;
  title: string;
  metadata: Record<string, unknown>;
};

export type ProjectContextPack = {
  projectId: string;
  projectName: string;
  goal: string;
  understanding: string;
  facts: string[];
  decisions: string[];
  constraints: string[];
  assumptions: string[];
  openQuestions: string[];
  nextActions: Array<{ action: string; risk: "low" | "medium" | "high" }>;
  artifacts: Array<{ type: string; ref: string; title?: string; verifiedAt?: string | null }>;
  sessionCount: number;
  updatedAt: string | number | null;
};

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function dedupeText(values: unknown[], max = MAX_CONTEXT_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value, MAX_CONTEXT_TEXT);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

export function normalizeProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && id.length <= MAX_PROJECT_ID && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id) ? id : null;
}

export function normalizeProjectSessionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const sessionId = candidate.trim();
    if (!sessionId || sessionId.length > MAX_SESSION_ID || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(sessionId) || seen.has(sessionId)) continue;
    seen.add(sessionId);
    result.push(sessionId);
    if (result.length >= MAX_SESSIONS_PER_PROJECT) break;
  }
  return result;
}

export function normalizeProjectStatus(value: unknown): ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : "active";
}

export function normalizeProjectInput(value: unknown): ProjectRecord | null {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = normalizeProjectId(raw.id);
  const name = cleanText(raw.name, MAX_NAME);
  if (!id || !name) return null;

  const version = Number.isInteger(raw.version) && Number(raw.version) >= 0 ? Number(raw.version) : 0;
  const color = cleanText(raw.color, MAX_COLOR) || null;
  return {
    id,
    version,
    name,
    description: cleanText(raw.description, MAX_DESCRIPTION),
    goal: cleanText(raw.goal, MAX_GOAL),
    status: normalizeProjectStatus(raw.status),
    color,
    createdAt: typeof raw.createdAt === "string" || typeof raw.createdAt === "number" ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === "string" || typeof raw.updatedAt === "number" ? raw.updatedAt : null,
  };
}

export function normalizeProjectResources(value: unknown): ProjectResource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ProjectResource[] = [];
  for (const candidate of value.slice(0, MAX_RESOURCES_PER_SYNC)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const kind = cleanText(raw.kind, 80).toLowerCase();
    const ref = cleanText(raw.ref, MAX_RESOURCE_REF);
    const title = cleanText(raw.title, MAX_RESOURCE_TITLE) || "Project resource";
    if (!kind || !ref) continue;
    const key = `${kind}\u0000${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      kind,
      ref,
      title,
      metadata: raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? raw.metadata as Record<string, unknown>
        : {},
    });
  }
  return result;
}

type ProjectOutcomeSource = {
  sessionId: string;
  state: OutcomeState | unknown;
  updatedAt?: string | number | null;
};

/**
 * Build one bounded, deterministic Project Outcome Graph from existing trusted
 * session Outcome State plus Project resources. No model call is used here: the
 * Project context is a projection of already persisted user/project state.
 */
export function buildProjectContextPack({
  project,
  resources = [],
  outcomes = [],
}: {
  project: ProjectRecord;
  resources?: ProjectResource[];
  outcomes?: ProjectOutcomeSource[];
}): ProjectContextPack {
  const normalizedOutcomes = outcomes.slice(0, MAX_SESSIONS_PER_PROJECT).map((source) => ({
    ...source,
    state: normalizeOutcomeState(source.state),
  }));

  const latestUnderstanding = normalizedOutcomes
    .filter((source) => source.state.understanding?.statement)
    .sort((a, b) => Date.parse(String(b.updatedAt || "")) - Date.parse(String(a.updatedAt || "")))[0]
    ?.state.understanding?.statement || "";

  const decisions = dedupeText(normalizedOutcomes.flatMap((source) => source.state.decisions.map((item) => item.value)));
  const constraints = dedupeText(normalizedOutcomes.flatMap((source) => source.state.constraints
    .filter((item) => item.confidence >= 0.8)
    .map((item) => item.value)));
  const assumptions = dedupeText(normalizedOutcomes.flatMap((source) => source.state.assumptions
    .filter((item) => item.status === "confirmed")
    .map((item) => item.value)));
  const openQuestions = dedupeText(normalizedOutcomes.flatMap((source) => source.state.openQuestions
    .filter((item) => item.material)
    .map((item) => item.question)));

  const nextActionSeen = new Set<string>();
  const nextActions = normalizedOutcomes.flatMap((source) => source.state.nextActions)
    .filter((item) => {
      const key = item.action.trim().toLocaleLowerCase();
      if (!key || nextActionSeen.has(key)) return false;
      nextActionSeen.add(key);
      return true;
    })
    .slice(0, MAX_CONTEXT_ITEMS);

  const artifactSeen = new Set<string>();
  const artifactCandidates: ProjectContextPack["artifacts"] = [
    ...resources.map((resource) => ({
      type: resource.kind,
      ref: resource.ref,
      title: resource.title,
      verifiedAt: cleanText(resource.metadata?.verifiedAt, 80) || null,
    })),
    ...normalizedOutcomes.flatMap((source) => source.state.artifacts.map((artifact) => ({
      type: artifact.type,
      ref: artifact.ref,
      title: undefined,
      verifiedAt: artifact.verifiedAt || null,
    }))),
  ];
  const artifacts = artifactCandidates.filter((artifact) => {
    const key = `${artifact.type}\u0000${artifact.ref}`.toLocaleLowerCase();
    if (!artifact.type || !artifact.ref || artifactSeen.has(key)) return false;
    artifactSeen.add(key);
    return true;
  }).slice(0, MAX_CONTEXT_ITEMS);

  // Keep the legacy goal/understanding/facts contract intact for chat + Office,
  // but fill it from the richer Outcome Graph in priority order.
  const facts = dedupeText([
    ...decisions.map((value) => `Decision: ${value}`),
    ...constraints.map((value) => `Constraint: ${value}`),
    ...assumptions.map((value) => `Confirmed assumption: ${value}`),
    ...nextActions.map((item) => `Next action: ${item.action}`),
    ...artifacts.map((item) => `Artifact: ${item.title || item.type}`),
  ], MAX_CONTEXT_FACTS);

  const updatedAt = [project.updatedAt, ...normalizedOutcomes.map((source) => source.updatedAt)]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  return {
    projectId: project.id,
    projectName: project.name,
    goal: project.goal,
    understanding: project.description || latestUnderstanding,
    facts,
    decisions,
    constraints,
    assumptions,
    openQuestions,
    nextActions,
    artifacts,
    sessionCount: normalizedOutcomes.length,
    updatedAt,
  };
}
