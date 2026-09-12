import express from 'express';
import { start } from 'workflow/api';
import { authenticateAdmin } from '../../api/_lib/admin-auth.js';
import { codingPilotWorkflow } from './workflow.js';
import { pilotAllows } from './transition.js';

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
export default app;
