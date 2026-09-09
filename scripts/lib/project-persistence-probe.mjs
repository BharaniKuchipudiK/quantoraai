import { randomUUID } from 'node:crypto';

// Every run owns a unique synthetic fixture, never the shared Personal Workspace.
export async function verifyProjectPersistence({ baseUrl, headers, fetchImpl = fetch }) {
  const id = `golden-project-${randomUUID()}`;
  const initial = { id, name: 'Durability probe', description: 'Synthetic test fixture', goal: 'First saved goal', status: 'active', color: null };
  const updated = { ...initial, name: 'Durability probe updated', goal: 'Second saved goal' };
  let primaryError;
  const request = async (action, fields = {}) => {
    const response = await fetchImpl(`${baseUrl}/api/projects`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStage: 'project-state', action, ...fields }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Project persistence ${action} failed: HTTP ${response.status}`);
    return response.json();
  };
  const readBack = async (expected, version) => {
    const result = await request('list');
    const stored = result.projects?.find((project) => project.id === id);
    if (!stored || stored.version !== version || Object.entries(expected).some(([key, value]) => stored[key] !== value)) {
      throw new Error('Project persistence readback did not match the saved fields and version');
    }
  };
  try {
    const created = await request('save', { project: initial, expectedVersion: 0 });
    const version = created.project?.version;
    if (created.project?.id !== id || !Number.isInteger(version) || version < 1) throw new Error('Project persistence create returned no valid version');
    await readBack(initial, version);
    const saved = await request('save', { project: updated, expectedVersion: version });
    if (saved.project?.id !== id || saved.project?.version !== version + 1) throw new Error('Project persistence update did not advance its version');
    await readBack(updated, version + 1);
    return { created: true, updated: true, readBack: true };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    // Delete only this run's random fixture, including an unknown create outcome.
    // No failed mutation is retried, and cleanup can never hide the original error.
    try {
      const result = await request('delete', { projectId: id });
      if (result.deleted !== true) throw new Error('Project persistence fixture cleanup was not confirmed');
    } catch (error) {
      if (!primaryError) throw error;
    }
  }
}
