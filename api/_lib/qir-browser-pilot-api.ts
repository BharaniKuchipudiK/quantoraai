import { randomUUID } from 'node:crypto';
import {
  browserPilotRunIdForSlot,
  browserPilotScope,
  browserSubmissionRun,
  validBrowserSubmission,
} from './qir-browser-pilot.js';
import { loadQirDeskWorkspace } from './qir-desk-workspace.js';
import { readQirRun } from './qir-run-store.js';
import { readQirWorkingContext } from './qir-context-state.js';
import { fetchWithTimeout } from './fetch-timeout.js';
import { hashVfsContent } from '../../src/lib/desk-checkpoints.js';

const PILOT_SLOT_COOKIE = 'quantora_qir_browser_slot';
const PILOT_SLOT = /^[a-f0-9-]{36}$/;

function workerConfig(env = process.env) {
  // The operator key must never follow redirects or leave the designated worker.
  return env.QIR_BROWSER_PILOT_WORKER_URL === 'https://quantora-coding-worker-pilot.vercel.app'
    && (env.QIR_BROWSER_PILOT_WORKER_TOKEN || '').trim().length >= 16
    ? { url: env.QIR_BROWSER_PILOT_WORKER_URL, token: env.QIR_BROWSER_PILOT_WORKER_TOKEN! } : null;
}

function cookieValue(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function writePilotSlot(res: any, slot: string) {
  if (typeof res?.setHeader !== 'function') return;
  res.setHeader('Set-Cookie', `${PILOT_SLOT_COOKIE}=${encodeURIComponent(slot)}; Path=/api/qir-runs; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`);
}

function terminalRun(run: any): boolean {
  return run?.status === 'COMPLETE' || run?.status === 'FAILED_TERMINAL';
}

async function dynamicRunIdForCapability(req: any, res: any, userSub: string, sessionId: string, read: typeof readQirRun) {
  let slot = cookieValue(req, PILOT_SLOT_COOKIE);
  if (!PILOT_SLOT.test(slot)) slot = randomUUID();
  let runId = browserPilotRunIdForSlot(userSub, sessionId, slot);
  try {
    const existing = await read(userSub, runId);
    if (existing && terminalRun(existing.run)) {
      slot = randomUUID();
      runId = browserPilotRunIdForSlot(userSub, sessionId, slot);
    }
  } catch {
    // Capability discovery is fail-soft. The actual submission still validates
    // persistence and worker admission before any execution can begin.
  }
  writePilotSlot(res, slot);
  return runId;
}

export async function handleBrowserPilotRequest(req: any, res: any, userSub: string,
  ports = { load: loadQirDeskWorkspace, read: readQirRun, fetch: fetchWithTimeout }) {
  const capability = req.method === 'GET' && req.query?.workerPilot === '1';
  const submission = req.method === 'POST' && req.body?.action === 'coding.workflow_submit';
  if (!capability && !submission) return false;
  const sessionId = String(capability ? req.query?.sessionId || '' : req.body?.sessionId || '');
  const scope = browserPilotScope(userSub, sessionId);
  const worker = workerConfig();
  if (!scope || !worker) {
    if (capability) res.status(200).json({ enabled: false });
    else res.status(403).json({ error: 'Background execution is not enabled for this desk.' });
    return true;
  }

  let scopedRunId = scope.runId;
  if (scope.dynamicRuns) {
    if (capability) {
      scopedRunId = await dynamicRunIdForCapability(req, res, userSub, sessionId, ports.read);
    } else {
      const slot = cookieValue(req, PILOT_SLOT_COOKIE);
      if (!PILOT_SLOT.test(slot)) {
        res.status(409).json({ error: 'Background execution identity expired. Refresh the desk and retry.', reason: 'submission-identity-missing' });
        return true;
      }
      scopedRunId = browserPilotRunIdForSlot(userSub, sessionId, slot);
    }
  }

  if (capability) {
    res.status(200).json({ enabled: true, runId: scopedRunId, dynamicRuns: scope.dynamicRuns });
    return true;
  }

  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  const workspaceHash = String(req.body?.workspaceHash || '');
  const input = { userSub: scope.userSub, sessionId: scope.sessionId, runId: scopedRunId, goal, workspaceHash };
  if (!validBrowserSubmission(input)) {
    res.status(400).json({ error: 'A bounded goal and saved workspace revision are required.' });
    return true;
  }
  const existing = await ports.read(userSub, scopedRunId);
  if (existing) {
    const context = readQirWorkingContext(existing.run)?.projectState;
    if (existing.run.goal.statement !== goal || context?.submissionHash !== workspaceHash
      || context?.sessionId !== sessionId || context?.executionOwner !== 'server') {
      res.status(409).json({ error: 'This pilot already has a different submission. Its saved work was not changed.' });
    } else res.status(200).json({ run: existing.run, runId: scopedRunId, durability: 'persisted' });
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
    if (response.status !== 202 || data.runId !== scopedRunId || !/^wrun_[A-Za-z0-9]+$/.test(data.workflowRunId)) throw new Error('Scheduling unconfirmed');
    res.status(202).json({ runId: scopedRunId, workflowRunId: data.workflowRunId, durability: 'scheduled' });
  } catch {
    res.status(503).json({ error: 'Scheduling was not confirmed. Retry this same submission; do not start a separate browser build.', reason: 'scheduling-unconfirmed' });
  }
  return true;
}
