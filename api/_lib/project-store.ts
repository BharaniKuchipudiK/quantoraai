import {
  buildProjectContextPack,
  normalizeProjectInput,
  normalizeProjectResources,
  normalizeProjectSessionIds,
  type ProjectContextPack,
  type ProjectRecord,
  type ProjectResource,
} from "./project-state.js";

const REST_TIMEOUT_MS = 4_000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isProjectStoreConfigured(): boolean {
  return config() !== null;
}

async function requestRaw(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const cfg = config();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (error: any) {
    console.warn(`Supabase ${init.method || "GET"} ${path} failed:`, error?.message || error);
    return null;
  }
}

function projectRecord(row: any): ProjectRecord | null {
  if (!row || typeof row !== "object") return null;
  return normalizeProjectInput({
    id: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    goal: row.goal,
    status: row.status,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listProjects(userSub: string): Promise<ProjectRecord[] | null> {
  if (!userSub) return null;
  const response = await requestRaw(
    `projects?select=id,version,name,description,goal,status,color,created_at,updated_at&user_sub=eq.${encodeURIComponent(userSub)}&order=updated_at.desc`,
    { method: "GET" },
  );
  if (!response || !response.ok) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows.flatMap((row) => projectRecord(row) || []) : [];
  } catch {
    return null;
  }
}

export type ProjectSaveResult =
  | { status: "saved"; record: ProjectRecord }
  | { status: "conflict" }
  | { status: "unavailable" };

export async function saveProject(entry: {
  userSub: string;
  expectedVersion: number;
  project: ProjectRecord;
}): Promise<ProjectSaveResult> {
  const project = normalizeProjectInput(entry.project);
  if (!entry.userSub || !project) return { status: "unavailable" };
  const response = await requestRaw("rpc/save_project", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_project_id: project.id,
      p_expected_version: entry.expectedVersion,
      p_name: project.name,
      p_description: project.description,
      p_goal: project.goal,
      p_status: project.status,
      p_color: project.color,
    }),
  });
  if (!response) return { status: "unavailable" };
  if (!response.ok) {
    const detail = await response.text();
    if (detail.includes("project_version_conflict")) return { status: "conflict" };
    console.warn(`Supabase POST rpc/save_project -> ${response.status}`, detail);
    return { status: "unavailable" };
  }
  try {
    const rows = await response.json();
    const record = projectRecord(Array.isArray(rows) ? rows[0] : rows);
    return record ? { status: "saved", record } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function deleteProject(userSub: string, projectId: string): Promise<boolean> {
  if (!userSub || !projectId) return false;
  const response = await requestRaw(
    `projects?user_sub=eq.${encodeURIComponent(userSub)}&id=eq.${encodeURIComponent(projectId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
  return Boolean(response && response.ok);
}

export async function upsertProjectResources(entry: {
  userSub: string;
  projectId: string;
  resources: ProjectResource[];
}): Promise<boolean> {
  const resources = normalizeProjectResources(entry.resources);
  if (!entry.userSub || !entry.projectId || resources.length === 0) return true;
  const now = new Date().toISOString();
  const response = await requestRaw("project_resources?on_conflict=user_sub,project_id,kind,ref", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(resources.map((resource) => ({
      user_sub: entry.userSub,
      project_id: entry.projectId,
      kind: resource.kind,
      ref: resource.ref,
      title: resource.title,
      metadata: resource.metadata,
      updated_at: now,
    }))),
  });
  return Boolean(response && response.ok);
}

export async function syncProjectSessions(entry: {
  userSub: string;
  projectId: string;
  sessionIds: string[];
}): Promise<boolean> {
  const sessionIds = normalizeProjectSessionIds(entry.sessionIds);
  if (!entry.userSub || !entry.projectId) return false;
  const response = await requestRaw("rpc/sync_project_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_user_sub: entry.userSub,
      p_project_id: entry.projectId,
      p_session_ids: sessionIds,
    }),
  });
  if (!response?.ok) {
    if (response) console.warn(`Supabase POST rpc/sync_project_sessions -> ${response.status}`, await response.text());
    return false;
  }
  return true;
}

export async function readProjectContext(userSub: string, projectId: string): Promise<ProjectContextPack | null> {
  if (!userSub || !projectId) return null;
  const sub = encodeURIComponent(userSub);
  const id = encodeURIComponent(projectId);
  const [projectRes, resourcesRes, sessionsRes] = await Promise.all([
    requestRaw(`projects?select=id,version,name,description,goal,status,color,created_at,updated_at&user_sub=eq.${sub}&id=eq.${id}&limit=1`, { method: "GET" }),
    requestRaw(`project_resources?select=kind,ref,title,metadata,created_at,updated_at&user_sub=eq.${sub}&project_id=eq.${id}&order=updated_at.desc&limit=100`, { method: "GET" }),
    requestRaw(`project_sessions?select=session_id,updated_at&user_sub=eq.${sub}&project_id=eq.${id}&order=updated_at.desc&limit=200`, { method: "GET" }),
  ]);
  if (!projectRes?.ok || !resourcesRes?.ok || !sessionsRes?.ok) return null;

  try {
    const projectRows = await projectRes.json();
    const project = projectRecord(Array.isArray(projectRows) ? projectRows[0] : null);
    if (!project) return null;

    const resourceRows = await resourcesRes.json();
    const resources = normalizeProjectResources(Array.isArray(resourceRows) ? resourceRows.map((row: any) => ({
      kind: row.kind,
      ref: row.ref,
      title: row.title,
      metadata: row.metadata,
    })) : []);

    const sessionRows = await sessionsRes.json();
    const sessionIds = normalizeProjectSessionIds(Array.isArray(sessionRows) ? sessionRows.map((row: any) => row.session_id) : []);
    let outcomes: Array<{ sessionId: string; state: unknown; updatedAt?: string | null }> = [];

    if (sessionIds.length > 0) {
      // Session IDs are restricted to the safe identifier grammar in
      // normalizeProjectSessionIds, so the PostgREST `in` list cannot inject a filter.
      const inList = sessionIds.join(",");
      const outcomesRes = await requestRaw(
        `outcome_states?select=session_id,state,updated_at&user_sub=eq.${sub}&session_id=in.(${inList})&order=updated_at.desc&limit=200`,
        { method: "GET" },
      );
      if (!outcomesRes?.ok) return null;
      const outcomeRows = await outcomesRes.json();
      outcomes = Array.isArray(outcomeRows) ? outcomeRows.map((row: any) => ({
        sessionId: row.session_id,
        state: row.state,
        updatedAt: row.updated_at,
      })) : [];
    }

    return buildProjectContextPack({ project, resources, outcomes });
  } catch {
    return null;
  }
}

export async function exportProjectData(userSub: string): Promise<{
  projects: unknown[];
  project_resources: unknown[];
  project_sessions: unknown[];
} | null> {
  if (!userSub) return null;
  const sub = encodeURIComponent(userSub);
  const [projectsRes, resourcesRes, sessionsRes] = await Promise.all([
    requestRaw(`projects?select=id,version,name,description,goal,status,color,created_at,updated_at&user_sub=eq.${sub}&order=updated_at.desc`, { method: "GET" }),
    requestRaw(`project_resources?select=project_id,kind,ref,title,metadata,created_at,updated_at&user_sub=eq.${sub}&order=updated_at.desc`, { method: "GET" }),
    requestRaw(`project_sessions?select=project_id,session_id,created_at,updated_at&user_sub=eq.${sub}&order=updated_at.desc`, { method: "GET" }),
  ]);
  if (!projectsRes?.ok || !resourcesRes?.ok || !sessionsRes?.ok) return null;
  try {
    return {
      projects: await projectsRes.json(),
      project_resources: await resourcesRes.json(),
      project_sessions: await sessionsRes.json(),
    };
  } catch {
    return null;
  }
}
