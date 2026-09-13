import { validBrowserSubmission } from '../../api/_lib/qir-browser-pilot.js';
import express from 'express';
import { start, getRun } from 'workflow/api';
import { authenticateAdmin } from '../../api/_lib/admin-auth.js';
import { codingPilotWorkflow, browserPilotWorkflow } from './workflow.js';
import { pilotAllows, browserPilotAllows } from './transition.js';

import { liveRecoveryProof, liveProofEnabled } from './live-proof.js';

import { seedJournalProof, readJournalProof, proveSaveConflict } from './journal-proof.js';

const app = express();
app.use(express.json({ limit: '8kb' }));
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
app.post('/submissions', async (req, res) => {
  const denied = authenticateAdmin(req);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  if (!validBrowserSubmission(req.body) || !browserPilotAllows(req.body.userSub, req.body.sessionId, req.body.runId)) {
    return res.status(403).json({ error: 'Submission is outside the configured browser pilot.' });
  }
  try {
    // The durable engine accepts first. Its step creates the QIR row, so there
    // is no saved-but-never-enqueued job if the requesting browser disappears.
    const { userSub, sessionId, runId, goal, workspaceHash } = req.body;
    const run = await start(browserPilotWorkflow, [{ userSub, sessionId, runId, goal, workspaceHash }]);
    return res.status(202).json({ workflowRunId: run.runId, runId: req.body.runId, durability: 'scheduled' });
  } catch { return res.status(503).json({ error: 'Scheduling was not confirmed. Retry the same submission.' }); }
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
for (const [method, path, handler] of [
  ['post', '/journal-proof', seedJournalProof],
  ['get', '/journal-proof', readJournalProof],
  ['post', '/journal-proof/save-conflict', proveSaveConflict],
] as const) {
  app[method](path, async (req, res) => {
    const denied = authenticateAdmin(req);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    try { return res.json(await handler()); }
    catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : 'Journal proof unavailable.' }); }
  });
}
export default app;
