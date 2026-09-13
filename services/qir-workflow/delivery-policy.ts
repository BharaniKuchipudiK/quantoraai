import type { CodingDeliveryWorkflowInput } from './delivery.js';

function value(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] || '').trim();
}

/**
 * Customer-wide autonomous merge is NOT enabled by this slice.
 *
 * The operator must explicitly enable one exact user/repository/project scope.
 * That lets us prove the full delivery chain in production without silently
 * upgrading the older `auto_pr_enabled` consent (which only covered push/PR)
 * into permission to merge and deploy.
 */
export function codingDeliveryPilotAllows(
  input: CodingDeliveryWorkflowInput,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (value(env, 'QIR_DELIVERY_PILOT_ENABLED') !== 'true') return false;
  const userSub = value(env, 'QIR_DELIVERY_PILOT_USER_SUB');
  const repo = value(env, 'QIR_DELIVERY_PILOT_REPO');
  const project = value(env, 'QIR_DELIVERY_PILOT_VERCEL_PROJECT');
  if (!userSub || !repo || !project) return false;
  return input.userSub === userSub
    && `${input.owner}/${input.repo}` === repo
    && input.vercelProject === project;
}
