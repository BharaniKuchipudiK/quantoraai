import { browserPilotScope, browserSubmissionRun, validBrowserSubmission } from './qir-browser-pilot.js';
import { loadQirDeskWorkspace } from './qir-desk-workspace.js';
import { readQirRun } from './qir-run-store.js';
import { readQirWorkingContext } from './qir-context-state.js';
import { fetchWithTimeout } from './fetch-timeout.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

function workerConfig(env = process.env) {
  // The operator key must never follow redirects or leave the designated worker.
  return env.QIR_BROWSER_PILOT_WORKER_URL === 'https://quantora-coding-worker-pilot.vercel.app'
    && (env.QIR_BROWSER_PILOT_WORKER_TOKEN || '').trim().length >= 16
    ? { url: env.QIR_BROWSER_PILOT_WORKER_URL, token: env.QIR_BROWSER_PILOT_WORKER_TOKEN! } : null;
}

export async function handleBrowserPilotRequest(req: any, res: any, userSub: string,
  ports = { load: loadQirDeskWorkspace, read: readQirRun, fetch: fetchWithTimeout }) {
  const capability = req.method === 'GET' && req.query?.workerPilot === '1';
  const submission = req.method === 'POST' && req.body?.action === 'coding.workflow_submit';
  if (!capability && !submission) return false;
  const sessionId = String(capability ? req.query?.sessionId || '' : req.body?.sessionId || '');
  const scope = browserPilotScope(userSub, sessionId);
  const worker = workerConfig();
  if (capability) {
    res.status(200).json({ enabled: Boolean(scope && worker), ...(scope && worker ? { runId: scope.runId } : {}) });
    return true;
  }
  if (!scope || !worker) {
    res.status(403).json({ error: 'Background execution is not enabled for this desk.' });
    return true;
  }
  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  const workspaceHash = String(req.body?.workspaceHash || '');
  const input = { ...scope, goal, workspaceHash };
  if (!validBrowserSubmission(input)) {
    res.status(400).json({ error: 'A bounded goal and saved workspace revision are required.' });
    return true;
  }
  const existing = await ports.read(userSub, scope.runId);
  if (existing) {
    const context = readQirWorkingContext(existing.run)?.projectState;
    if (existing.run.goal.statement !== goal || context?.submissionHash !== workspaceHash
      || context?.sessionId !== sessionId || context?.executionOwner !== 'server') {
      res.status(409).json({ error: 'This pilot already has a different submission. Its saved work was not changed.' });
    } else res.status(200).json({ run: existing.run, runId: scope.runId, durability: 'persisted' });
    return true;
  }
  const workspace = await ports.load(userSub, browserSubmissionRun(input));
  if (workspace.status !== 'loaded' || !Object.keys(workspace.vfs).length) {
    res.status(503).json({ error: 'Save the existing workspace before submitting background work.' });
    return true;
  }
  if (hashVfsContent(workspace.vfs) !== workspaceHash) {
    res.status(409).json({ error: 'The desk has unsaved or newer changes. Reload the saved workspace and retry.' });
    return true;
  }
  try {
    const response = await ports.fetch(`${worker.url}/submissions`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${worker.token}` },
      body: JSON.stringify(input),
    }, 20_000);
    const data = await response.json();
    if (response.status !== 202 || data.runId !== scope.runId || !/^wrun_[A-Za-z0-9]+$/.test(data.workflowRunId)) throw new Error('Scheduling unconfirmed');
    res.status(202).json({ runId: scope.runId, workflowRunId: data.workflowRunId, durability: 'scheduled' });
  } catch {
    res.status(503).json({ error: 'Scheduling was not confirmed. Retry this same submission; do not start a separate browser build.', reason: 'scheduling-unconfirmed' });
  }
  return true;
}
