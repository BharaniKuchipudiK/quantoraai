import { getPlatformSkill, platformSkillAssignment } from './platform-skill-registry.js';

const FAILURE_CUE = /\b(?:bug|broken|crash|error|fail(?:ed|ing|ure)?|fix|repair|regression|doesn['’]?t work|not work(?:ing)?)\b/i;
const REVIEW_CUE = /\b(?:review|audit|inspect)\b[\s\S]{0,80}\b(?:code|pull request|pr|diff|repository|repo)\b|\b(?:code|pull request|pr|diff|repository|repo)\b[\s\S]{0,80}\b(?:review|audit|inspect)\b/i;
const PYTHON_ONLY_CUE = /(?:\.py\b|\bpython\b|\bpytest\b)/i;
const WEB_PRODUCT_CUE = /\b(?:website|web\s*(?:site|app|application)|landing\s+page|portfolio|storefront|online\s+(?:shop|store)|e[- ]?commerce|frontend|dashboard|calculator|site|shop|store|ui)\b/i;
const BUILD_CUE = /\b(?:build|create|make|design|implement|develop|launch|ship|publish|redesign|refine|update|change)\b/i;

/**
 * A durable Coding Run starts from a user goal rather than a planner object.
 * Keep this resolver deliberately conservative: only goals that clearly belong
 * to one of the proven Coding Skills receive an assignment. Unknown work stays
 * unassigned instead of inventing a specialist.
 */
export function platformSkillAssignmentForCodingGoal(goal = '') {
  const text = String(goal || '').trim();
  if (!text) return null;

  if (REVIEW_CUE.test(text)) {
    return platformSkillAssignment({ workspace: 'coding', intentKind: 'code_review', message: text });
  }
  if (FAILURE_CUE.test(text)) {
    return platformSkillAssignment({ workspace: 'coding', intentKind: 'refine_desk', message: text });
  }
  if (PYTHON_ONLY_CUE.test(text) && !WEB_PRODUCT_CUE.test(text)) return null;
  if (WEB_PRODUCT_CUE.test(text) || BUILD_CUE.test(text) && /\b(?:app|application|page|product|experience)\b/i.test(text)) {
    return platformSkillAssignment({ workspace: 'coding', intentKind: 'app_build', message: text });
  }
  return null;
}

export function platformSkillBinding(assignment) {
  if (!assignment?.skillId || !assignment?.version) return null;
  return Object.freeze({
    skillId: String(assignment.skillId),
    version: String(assignment.version),
  });
}

export function platformSkillBindingForCodingGoal(goal = '') {
  return platformSkillBinding(platformSkillAssignmentForCodingGoal(goal));
}

/** Resolve only a version that still exists in the trusted registry. */
export function resolvePlatformSkillBinding(binding) {
  if (!binding || typeof binding !== 'object') return null;
  const skillId = typeof binding.skillId === 'string' ? binding.skillId.trim() : '';
  const version = typeof binding.version === 'string' ? binding.version.trim() : '';
  if (!skillId || !version) return null;
  const skill = getPlatformSkill(skillId);
  return skill && skill.version === version ? skill : null;
}

/**
 * The server-created QIR step carries the trusted Skill operating policy. The
 * original goal remains the durable goal statement; this is only the action
 * objective presented to the Coding worker.
 */
export function platformSkillObjectiveForCodingGoal(goal = '') {
  const text = String(goal || '').trim();
  const assignment = platformSkillAssignmentForCodingGoal(text);
  const skill = assignment ? getPlatformSkill(assignment.skillId) : null;
  if (!skill) return text;

  const contract = skill.completionContract.map((item) => `- ${item}`).join('\n');
  const workflow = skill.workflowStages.join(' → ');
  return [
    text,
    '',
    `GOVERNED SKILL: ${skill.name} (${skill.skillId} v${skill.version})`,
    `OPERATING POLICY: ${skill.instructions}`,
    `WORKFLOW: ${workflow}`,
    `COMPLETION CONTRACT:\n${contract}`,
    `Completion authority: ${skill.completionAuthority}; verification authority: ${skill.verificationAuthority}. Generated code alone is not completion.`,
  ].join('\n').slice(0, 4000);
}
