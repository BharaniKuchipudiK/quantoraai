import type { CodingDeliveryWorkflowInput } from './delivery.js';

function value(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] || '').trim();
}

/**
 * Autonomous delivery needs TWO independent permissions:
 *
 * 1. the operator kill switch + deployment boundary must allow the target; and
 * 2. the signed-in user must have explicitly enabled Auto Deliver.
 *
 * `auto_pr_enabled` is intentionally irrelevant here. Push/PR consent is not
 * merge/deploy consent, and can never satisfy this function by accident.
 */
export function codingDeliveryPilotAllows(
  input: CodingDeliveryWorkflowInput,
  autoDeliverEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!autoDeliverEnabled) return false;
  if (value(env, 'QIR_DELIVERY_PILOT_ENABLED') !== 'true') return false;

  // Keep the production rollout pinned to an operator-approved repository and
  // Vercel project while the new customer consent surface is proven. The old
  // user-sub pin is no longer the permission: the database opt-in is.
  const repo = value(env, 'QIR_DELIVERY_PILOT_REPO');
  const project = value(env, 'QIR_DELIVERY_PILOT_VERCEL_PROJECT');
  if (!repo || !project) return false;

  return `${input.owner}/${input.repo}` === repo
    && input.vercelProject === project;
}
