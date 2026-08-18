export const DEFAULT_PROJECT_ID = "project-personal";

const MAX_PROJECT_ID = 128;
const MAX_NAME = 120;
const MAX_DESCRIPTION = 2_000;
const MAX_GOAL = 2_000;
const MAX_COLOR = 64;
const MAX_RESOURCE_REF = 2_000;
const MAX_RESOURCE_TITLE = 240;
const MAX_RESOURCES_PER_SYNC = 100;

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

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && id.length <= MAX_PROJECT_ID && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id) ? id : null;
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
