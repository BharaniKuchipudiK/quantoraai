import { readModelRegistry, writeModelEvents, writeModelRegistry } from './model-store.js';

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
