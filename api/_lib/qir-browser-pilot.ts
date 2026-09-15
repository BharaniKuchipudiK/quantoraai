import { QIR_CONTRACT_VERSION, type QirAgentRun } from './qir-contracts.js';
import { attachQirWorkingContext, compactQirWorkingContext } from './qir-context-state.js';
import { createHash } from 'node:crypto';
import {
  platformSkillBindingForCodingGoal,
  platformSkillObjectiveForCodingGoal,
} from '../../shared/platform-skill-runtime.js';

export type BrowserPilotSubmission = {
  userSub: string; sessionId: string; runId: string; goal: string; workspaceHash: string;
};

export type BrowserPilotScope = {
  userSub: string;
  sessionId: string;
  runId: string;
  dynamicRuns: boolean;
};

const DYNAMIC_RUN_ID = /^browser-pilot-[a-f0-9]{32}$/;

function validConfiguredRunId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

// The rollout remains pinned to one opt-in account and desk. Dynamic mode only
// removes the old one-run-for-ever restriction; it does not broaden who may use
// the worker or let the browser choose an execution identity.
export function browserPilotScope(userSub: string, sessionId: string, env = process.env): BrowserPilotScope | null {
  const dynamicRuns = env.QIR_BROWSER_PILOT_DYNAMIC_RUNS === 'true';
  const configuredRunId = env.QIR_BROWSER_PILOT_RUN_ID || '';
  const enabled = env.QIR_BROWSER_PILOT_ENABLED === 'true'
    && Boolean(userSub && sessionId)
    && userSub === env.QIR_BROWSER_PILOT_USER_SUB
    && sessionId === env.QIR_BROWSER_PILOT_SESSION_ID
    && (dynamicRuns || validConfiguredRunId(configuredRunId));
  return enabled ? { userSub, sessionId, runId: dynamicRuns ? '' : configuredRunId, dynamicRuns } : null;
}

export function browserPilotRunIdForSlot(userSub: string, sessionId: string, slot: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([String(userSub || ''), String(sessionId || ''), String(slot || '')]))
    .digest('hex')
    .slice(0, 32);
  return `browser-pilot-${digest}`;
}

export function browserPilotRunAllowed(scope: BrowserPilotScope | null, runId: string): boolean {
  if (!scope) return false;
  return scope.dynamicRuns ? DYNAMIC_RUN_ID.test(String(runId || '')) : scope.runId === runId;
}

export function validBrowserSubmission(input: BrowserPilotSubmission, env = process.env): boolean {
  const scope = input && browserPilotScope(input.userSub, input.sessionId, env);
  return Boolean(scope && browserPilotRunAllowed(scope, input.runId)
    && typeof input.goal === 'string' && input.goal.trim() === input.goal && input.goal.length > 0 && input.goal.length <= 2000
    && typeof input.workspaceHash === 'string' && /^[a-f0-9]{8}$/.test(input.workspaceHash));
}

export function browserSubmissionRun(input: BrowserPilotSubmission): QirAgentRun {
  const now = new Date().toISOString();
  // Publication checkpoints are desk-scoped, so different runs need different
  // action IDs. Keep the ID bounded even when the submitted run ID is long.
  const actionId = `browser-pilot-${createHash('sha256').update(input.runId).digest('hex').slice(0, 32)}`;
  const platformSkill = platformSkillBindingForCodingGoal(input.goal);
  const run: QirAgentRun = {
    version: QIR_CONTRACT_VERSION, runId: input.runId,
    goal: { statement: input.goal, status: 'confirmed' }, status: 'EXECUTING',
    steps: [{ stepId: 'browser-pilot', taskId: 'coding.model', objective: platformSkillObjectiveForCodingGoal(input.goal),
      dependsOn: [], status: 'active', requiresVerification: true, actionId }],
    cursor: { stepId: 'browser-pilot', actionId, attempt: 0 },
    artifacts: [], observations: [], verifications: [], checkpoints: [],
    budget: { runUnitsRemaining: 100, stepUnitsRemaining: 40, recoveryReserveRemaining: 20, premiumEscalationRemaining: 5 },
    createdAt: now, updatedAt: now,
  };
  return attachQirWorkingContext(run, compactQirWorkingContext({ run,
    projectState: {
      sessionId: input.sessionId,
      executionOwner: 'server',
      submissionHash: input.workspaceHash,
      ...(platformSkill ? { platformSkill } : {}),
    },
  }));
}
