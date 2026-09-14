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

// A single opt-in account, desk and run. None of these are selected by the caller.
export function browserPilotScope(userSub: string, sessionId: string, env = process.env) {
  const runId = env.QIR_BROWSER_PILOT_RUN_ID || '';
  return env.QIR_BROWSER_PILOT_ENABLED === 'true'
    && Boolean(userSub && sessionId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(runId))
    && userSub === env.QIR_BROWSER_PILOT_USER_SUB
    && sessionId === env.QIR_BROWSER_PILOT_SESSION_ID ? { userSub, sessionId, runId } : null;
}

export function validBrowserSubmission(input: BrowserPilotSubmission, env = process.env): boolean {
  const scope = input && browserPilotScope(input.userSub, input.sessionId, env);
  return Boolean(scope && scope.runId === input.runId
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
