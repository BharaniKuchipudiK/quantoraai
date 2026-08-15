import { readModelRegistry, writeModelEvents, writeModelRegistry } from './model-store.js';
import { runModelSmokeTest } from './model-smoke-test.js';

const SMOKE_TEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function smokeTestIsFresh(smokeTest) {
  if (!smokeTest?.passed || !smokeTest?.ran_at) return false;
  const age = Date.now() - new Date(smokeTest.ran_at).getTime();
  return Number.isFinite(age) && age >= 0 && age <= SMOKE_TEST_MAX_AGE_MS;
}

export async function storeModelSmokeTest(modelId, smokePayload) {
  const rows = await readModelRegistry();
  const existing = rows.find((row) => row.id === modelId);
  if (!existing) return { ok: false, error: 'Model not found' };

  const now = new Date().toISOString();
  const smoke_test = {
    passed: smokePayload.passed === true,
    ran_at: smokePayload.ranAt || now,
    results: smokePayload.results || [],
    error: smokePayload.error || null,
  };

  const updated = {
    ...existing,
    lifecycle: existing.lifecycle === 'rejected' ? 'discovered' : (existing.lifecycle || 'discovered'),
    last_event: 'updated',
    last_changed_at: now,
    smoke_test,
  };

  const stored = await writeModelRegistry([updated]);
  if (!stored) return { ok: false, error: 'Could not update model registry' };

  await writeModelEvents([{
    model_id: modelId,
    event_type: 'updated',
    details: {
      action: 'smoke-test',
      passed: smoke_test.passed,
      results: smoke_test.results,
    },
  }]);

  return { ok: true, model: updated, smokeTest: smoke_test };
}

export async function runAndStoreModelSmokeTest(modelId) {
  const smoke = await runModelSmokeTest(modelId);
  if (!smoke.ok) {
    return { ok: false, error: smoke.error || 'Smoke test failed to run', smokeTest: null };
  }
  return storeModelSmokeTest(modelId, smoke);
}

export async function updateModelApproval(modelId, action, adminSub) {
  const rows = await readModelRegistry();
  const existing = rows.find((row) => row.id === modelId);
  if (!existing) return { ok: false, error: 'Model not found' };

  const now = new Date().toISOString();
  let approved;
  let lifecycle;
  let last_event;
  let event_type = null;

  if (action === 'approve') {
    if (!smokeTestIsFresh(existing.smoke_test)) {
      return {
        ok: false,
        error: 'Run a passing smoke test before approving this model',
        code: 'SMOKE_TEST_REQUIRED',
        smokeTest: existing.smoke_test || null,
      };
    }
    approved = true;
    lifecycle = 'available';
    last_event = 'approved';
    event_type = 'approved';
  } else if (action === 'reject') {
    approved = false;
    lifecycle = 'rejected';
    last_event = 'rejected';
    event_type = 'rejected';
  } else if (action === 'testing') {
    approved = false;
    lifecycle = 'testing';
    last_event = 'updated';
  } else {
    return { ok: false, error: 'Invalid action' };
  }

  const updated = {
    ...existing,
    approved,
    lifecycle,
    last_event,
    last_changed_at: now,
  };

  const stored = await writeModelRegistry([updated]);
  if (!stored) return { ok: false, error: 'Could not update model registry' };

  if (event_type) {
    await writeModelEvents([{
      model_id: modelId,
      event_type,
      details: { admin: adminSub, action },
    }]);
  }

  return { ok: true, model: updated };
}
