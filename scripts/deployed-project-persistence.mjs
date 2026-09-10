import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function targetOrigin(baseUrl) {
  const target = new URL(baseUrl);
  if (target.protocol !== 'https:' || target.username || target.password || target.port
    || target.search || target.hash || target.pathname !== '/'
    || !/^quantora-platform-[a-z0-9]+-sartho\.vercel\.app$/.test(target.hostname)) {
    throw new Error('Persistence probe requires an exact Quantora deployment URL');
  }
  return target.origin;
}

// A unique canary-owned record, never the shared Personal Workspace or user data.
// Keep the runtime API real. No retries, mocks, model calls or service-role keys.
export async function verifyProjectPersistence({ baseUrl, headers, fetchImpl = fetch }) {
  const origin = targetOrigin(baseUrl);
  const id = `golden-project-${randomUUID()}`;
  const initial = { id, name: 'Conflict durability probe', description: 'Synthetic test fixture',
    goal: 'First saved goal', status: 'active', color: null };
  const updated = { ...initial, name: 'Conflict durability probe updated', goal: 'Second saved goal' };
  let primaryError;
  let cleanupNeeded = false;
  let evidence;
  const request = async (action, fields = {}, expectedStatus = 200) => {
    const started = performance.now();
    const response = await fetchImpl(`${origin}/api/projects`, {
      method: 'POST', redirect: 'error',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStage: 'project-state', action, ...fields }),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status !== expectedStatus) {
      throw new Error(`Project persistence ${action}: expected HTTP ${expectedStatus}, received ${response.status}`);
    }
    const data = await response.json();
    return { data, elapsedMs: Math.round(performance.now() - started) };
  };
  const readBack = async (expected, version) => {
    const { data } = await request('list');
    if (!Array.isArray(data.projects)) throw new Error('Project list did not return an inventory');
    const stored = data.projects.find((project) => project.id === id);
    if (expected === null) {
      if (stored) throw new Error('Rejected or deleted fixture still exists');
    } else if (!stored || stored.version !== version
      || Object.entries(expected).some(([key, value]) => stored[key] !== value)) {
      throw new Error('Saved fields/version changed or failed readback');
    }
  };
  const conflict = async (project, expectedVersion) => {
    const result = await request('save', { project, expectedVersion }, 409);
    if (result.data.conflict !== true) throw new Error('Version refusal did not identify a conflict');
    return result.elapsedMs;
  };
  try {
    // Both deliberate exception branches: missing record and stale existing record.
    cleanupNeeded = true; // Even a lost reply might have committed; clean only our UUID.
    const missingConflictMs = await conflict(initial, 1);
    await readBack(null);
    const created = await request('save', { project: initial, expectedVersion: 0 });
    if (created.data.project?.id !== id || created.data.project.version !== 1) {
      throw new Error('Create did not confirm the expected new record and version 1');
    }
    await readBack(initial, 1);
    const saved = await request('save', { project: updated, expectedVersion: 1 });
    if (saved.data.project?.id !== id || saved.data.project.version !== 2) {
      throw new Error('Update did not confirm version 2');
    }
    await readBack(updated, 2);
    const staleConflictMs = await conflict({ ...initial, goal: 'Must never overwrite version 2' }, 1);
    await readBack(updated, 2);
    evidence = { created: true, updated: true, readBack: true, missingConflict: true,
      staleConflict: true, preservedAfterConflict: true, missingConflictMs, staleConflictMs };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (cleanupNeeded) {
      try {
        const result = await request('delete', { projectId: id });
        if (result.data.deleted !== true) throw new Error('Fixture cleanup was not confirmed');
        await readBack(null);
      } catch (error) {
        if (primaryError) throw new AggregateError([primaryError, error], `${primaryError.message}; fixture cleanup also failed`);
        throw error;
      }
    }
  }
  return { ...evidence, cleanupConfirmed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const token = process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
    if (!token) throw new Error('A configured synthetic canary token is required');
    const headers = { 'x-quantora-golden-canary': token };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }
    const result = await verifyProjectPersistence({ baseUrl: process.env.QUANTORA_E2E_BASE_URL, headers });
    console.log(JSON.stringify({ ...result, deploymentSha: process.env.QUANTORA_DEPLOYMENT_SHA }));
  } catch (error) {
    console.error(`PROJECT PERSISTENCE FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
