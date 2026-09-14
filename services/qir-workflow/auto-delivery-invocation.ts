import { createHash } from 'node:crypto';
import type { QirAgentRun } from '../../api/_lib/qir-contracts.js';
import { readQirWorkingContext } from '../../api/_lib/qir-context-state.js';
import { resolvePlatformSkillBinding } from '../../shared/platform-skill-runtime.js';
import type { CodingDeliveryWorkflowInput } from './delivery.js';

export const AUTO_DELIVERY_CONTEXT_KEY = 'autoDelivery';

function value(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] || '').trim();
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'run';
}

function platformSkillForDelivery(run: QirAgentRun) {
  const context = readQirWorkingContext(run);
  const binding = context?.projectState?.platformSkill;
  if (binding === undefined || binding === null) return { status: 'legacy' as const, skill: null };
  const skill = resolvePlatformSkillBinding(binding);
  if (!skill) return { status: 'invalid' as const, skill: null };
  if (skill.deliveryPolicy?.mode !== 'governed') return { status: 'denied' as const, skill };
  return { status: 'governed' as const, skill };
}

export function autoDeliveryAlreadyScheduled(run: QirAgentRun): boolean {
  const context = readQirWorkingContext(run);
  const marker = context?.projectState?.[AUTO_DELIVERY_CONTEXT_KEY];
  return Boolean(marker && typeof marker === 'object' && (marker as Record<string, unknown>).state === 'scheduled');
}

export function isVerifiedAutoDeliveryCandidate(run: QirAgentRun): boolean {
  if (run.status !== 'COMPLETE' || run.goal.status !== 'achieved') return false;
  if (autoDeliveryAlreadyScheduled(run)) return false;
  const skill = platformSkillForDelivery(run);
  if (skill.status === 'invalid' || skill.status === 'denied') return false;
  const verified = run.verifications.some((item) => item.passed && item.proofOfDoneStatus === 'verified');
  const checkpoint = run.checkpoints.length > 0;
  const artifact = run.artifacts.some((item) => item.state === 'verified');
  return verified && checkpoint && artifact;
}

export function deriveAutoDeliveryInput(
  userSub: string,
  run: QirAgentRun,
  env: NodeJS.ProcessEnv = process.env,
): CodingDeliveryWorkflowInput | null {
  if (!userSub || !isVerifiedAutoDeliveryCandidate(run)) return null;
  const target = value(env, 'QIR_DELIVERY_PILOT_REPO');
  const vercelProject = value(env, 'QIR_DELIVERY_PILOT_VERCEL_PROJECT');
  const [owner, repo, extra] = target.split('/');
  if (!owner || !repo || extra || !vercelProject) return null;

  const digest = createHash('sha256').update(run.runId).digest('hex').slice(0, 10);
  const branch = `quantora/auto-${safeSlug(run.runId).slice(0, 28)}-${digest}`;
  const title = String(run.goal.statement || 'Quantora verified delivery').trim().slice(0, 120) || 'Quantora verified delivery';
  const baseBranch = value(env, 'QIR_DELIVERY_PILOT_BASE_BRANCH') || 'main';
  const vercelTeamId = value(env, 'QIR_DELIVERY_PILOT_VERCEL_TEAM_ID');
  const skill = platformSkillForDelivery(run);
  const provenance = skill.status === 'governed' && skill.skill
    ? ` under ${skill.skill.name} v${skill.skill.version}`
    : '';

  return {
    userSub,
    runId: run.runId,
    owner,
    repo,
    branch,
    baseBranch,
    title,
    body: `Autonomous delivery for verified QIR run ${run.runId}${provenance}.`,
    vercelProject,
    ...(vercelTeamId ? { vercelTeamId } : {}),
  };
}
