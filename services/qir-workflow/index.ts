import express from 'express';
import { start, getRun } from 'workflow/api';
import { authenticateAdmin } from '../../api/_lib/admin-auth.js';
import { codingPilotWorkflow } from './workflow.js';
import { pilotAllows } from './transition.js';

import { liveRecoveryProof, liveProofEnabled } from './live-proof.js';

const app = express();
app.use(express.json({ limit: '2kb' }));
app.get('/health', (_req, res) => res.json({ service: 'qir-workflow-pilot', enabled: process.env.QIR_WORKFLOW_PILOT_ENABLED === 'true' }));
app.post('/runs', async (req, res) => {
  const denied = authenticateAdmin(req);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  // The caller cannot select a customer or run. The operator config pins both.
  const userSub = process.env.QIR_PILOT_USER_SUB || '';
  const runId = process.env.QIR_PILOT_RUN_ID || '';
  if (!pilotAllows(userSub, runId)) return res.status(503).json({ error: 'Pilot is not configured.' });
  try {
    const run = await start(codingPilotWorkflow, [userSub, runId]);
    return res.status(202).json({ workflowRunId: run.runId, runId });
  } catch {
    return res.status(503).json({ error: 'Unable to enqueue the pilot. Check Workflow logs before retrying.' });
  }
});
app.post('/proof', async (req, res) => {
  const denied = authenticateAdmin(req);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  if (!liveProofEnabled()) return res.status(503).json({ error: 'Proof is disabled.' });
  try {
    const run = await start(liveRecoveryProof, []);
    return res.status(202).json({ workflowRunId: run.runId });
  } catch { return res.status(503).json({ error: 'Unable to enqueue proof.' }); }
});
app.get('/proof/:id', async (req, res) => {
  const denied = authenticateAdmin(req);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  if (!liveProofEnabled() || !/^wrun_[A-Za-z0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  try {
    const run = getRun(req.params.id);
    const status = await run.status;
    return res.json({ status, ...(status === 'completed' ? { result: await run.returnValue } : {}) });
  } catch { return res.status(503).json({ error: 'Unable to read proof.' }); }
});
app.delete('/proof/:id', async (req, res) => {
  const denied = authenticateAdmin(req);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  if (!liveProofEnabled() || !/^wrun_[A-Za-z0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  try {
    await getRun(req.params.id).cancel();
    return res.json({ status: 'cancelled' });
  } catch { return res.status(503).json({ error: 'Unable to cancel proof.' }); }
});
export default app;
