const SKILL_VERSION = '1.0.0';

const GOVERNED_COMPLETION = Object.freeze({
  completionAuthority: 'runtime-governor',
  verificationAuthority: 'outcome-evaluator',
});

function defineSkill(definition) {
  return Object.freeze({
    version: SKILL_VERSION,
    ...GOVERNED_COMPLETION,
    requiredContext: [],
    optionalContext: [],
    allowedTools: [],
    requiredPermissions: [],
    workflowStages: [],
    completionContract: [],
    verifiers: [],
    progressVocabulary: [],
    handoffSkills: [],
    deliveryPolicy: Object.freeze({ mode: 'none', requiresApproval: false }),
    recoveryPolicy: Object.freeze({ mode: 'bounded', maxRepairCycles: 2 }),
    ...definition,
  });
}

export const PLATFORM_SKILLS = Object.freeze({
  'coding.senior-web-product-engineer': defineSkill({
    skillId: 'coding.senior-web-product-engineer',
    name: 'Senior Web Product Engineer',
    workspace: 'coding',
    intentMatchers: ['app_build', 'shop_build', 'shop_catalog_slice', 'shop_oversize', 'refine_desk'],
    instructions: 'Own a web product job from material requirements through verified delivery without treating generated code as completion.',
    requiredContext: ['user_intent', 'project_context'],
    optionalContext: ['repository', 'brand_assets', 'delivery_target'],
    allowedTools: [
      'repository.read',
      'repository.write',
      'shell.execute',
      'browser.verify',
      'github.pr.read',
      'github.pr.write',
      'github.actions.read',
      'deployment.read',
      'deployment.write',
    ],
    requiredPermissions: ['repository.write', 'external.delivery'],
    workflowStages: ['requirements', 'plan', 'build', 'verify', 'recover', 'deliver', 'prove'],
    completionContract: [
      'requested product behavior exists',
      'runnable artifact is verified',
      'requested responsive journeys pass',
      'delivery is verified when delivery was requested and approved',
    ],
    verifiers: ['compile', 'runtime', 'browser', 'requested-behavior', 'production-health'],
    progressVocabulary: ['Requirements ready', 'Building', 'Running checks', 'Repairing', 'Preparing delivery', 'Production verification'],
    handoffSkills: ['coding.debugger-recovery-engineer', 'coding.code-reviewer'],
    deliveryPolicy: Object.freeze({ mode: 'governed', requiresApproval: true }),
  }),

  'coding.debugger-recovery-engineer': defineSkill({
    skillId: 'coding.debugger-recovery-engineer',
    name: 'Debugger & Recovery Engineer',
    workspace: 'coding',
    intentMatchers: ['debug', 'repair', 'failing_build', 'runtime_failure', 'refine_desk'],
    instructions: 'Diagnose failures from concrete evidence, make the smallest repair, and prove the repair before broadening validation.',
    requiredContext: ['failure_evidence'],
    optionalContext: ['repository', 'ci_logs', 'runtime_logs'],
    allowedTools: ['repository.read', 'repository.write', 'shell.execute', 'browser.verify', 'github.actions.read'],
    requiredPermissions: ['repository.write'],
    workflowStages: ['diagnose', 'repair', 'targeted_verify', 'broader_verify', 'prove'],
    completionContract: ['root failure is addressed', 'targeted reproduction passes', 'required broader verification passes'],
    verifiers: ['targeted-test', 'compile', 'runtime', 'browser'],
    progressVocabulary: ['Inspecting failure', 'Applying focused repair', 'Re-running failed check', 'Running broader verification'],
    handoffSkills: ['coding.senior-web-product-engineer'],
  }),

  'coding.code-reviewer': defineSkill({
    skillId: 'coding.code-reviewer',
    name: 'Code Reviewer',
    workspace: 'coding',
    intentMatchers: ['code_review', 'pr_review'],
    instructions: 'Inspect code and evidence, identify material defects, and separate findings from unverified speculation.',
    requiredContext: ['source_or_diff'],
    allowedTools: ['repository.read', 'github.pr.read', 'github.actions.read'],
    workflowStages: ['inspect', 'analyze', 'verify_findings', 'report'],
    completionContract: ['material findings are attributable to source evidence', 'severity and uncertainty are explicit'],
    verifiers: ['source-evidence', 'test-evidence'],
    progressVocabulary: ['Reading changes', 'Checking evidence', 'Verifying findings', 'Review ready'],
  }),

  'study.visual-explainer': defineSkill({
    skillId: 'study.visual-explainer',
    name: 'Visual Explainer',
    workspace: 'study',
    intentMatchers: ['visual_explanation', 'simulation_or_lab'],
    instructions: 'Teach with an instructional visual when the representation materially improves understanding.',
    allowedTools: ['study.visual', 'study.lab', 'browser.verify'],
    workflowStages: ['explain', 'visualize', 'check', 'adapt'],
    completionContract: ['visual matches the concept', 'explanation and representation agree', 'learner check is available when appropriate'],
    verifiers: ['representation', 'accessibility'],
    progressVocabulary: ['Preparing explanation', 'Building visual', 'Checking representation'],
  }),

  'study.socratic-tutor': defineSkill({
    skillId: 'study.socratic-tutor',
    name: 'Socratic Tutor',
    workspace: 'study',
    intentMatchers: ['tutor', 'guided_learning'],
    instructions: 'Teach through bounded guided questions, adapting to demonstrated learner understanding.',
    allowedTools: ['study.evidence', 'study.assessment'],
    workflowStages: ['explain', 'question', 'observe', 'adapt'],
    completionContract: ['response addresses the learner goal', 'adaptation uses current learner evidence where available'],
    verifiers: ['study-evidence'],
    progressVocabulary: ['Explaining', 'Checking understanding', 'Adapting'],
  }),

  'study.exam-coach': defineSkill({
    skillId: 'study.exam-coach',
    name: 'Exam Coach',
    workspace: 'study',
    intentMatchers: ['exam_coaching', 'revision_plan'],
    instructions: 'Turn syllabus and learner evidence into focused revision, practice, and weak-area targeting.',
    allowedTools: ['study.evidence', 'study.assessment', 'study.schedule'],
    workflowStages: ['scope', 'diagnose', 'plan', 'practice', 'adapt'],
    completionContract: ['plan is tied to syllabus or supplied scope', 'weak-area claims are evidence-backed'],
    verifiers: ['study-evidence'],
    progressVocabulary: ['Checking scope', 'Finding weak areas', 'Building revision plan'],
  }),

  'travel.trip-architect': defineSkill({
    skillId: 'travel.trip-architect',
    name: 'Trip Architect',
    workspace: 'travel',
    intentMatchers: ['trip_plan', 'itinerary'],
    instructions: 'Build a feasible itinerary around user constraints, timing, transport, and provider-backed facts.',
    allowedTools: ['travel.search', 'web.search'],
    workflowStages: ['requirements', 'search', 'plan', 'verify'],
    completionContract: ['itinerary respects stated constraints', 'time-sensitive provider claims are traceable'],
    verifiers: ['travel-provider', 'freshness'],
    progressVocabulary: ['Checking constraints', 'Finding options', 'Building itinerary', 'Verifying details'],
  }),

  'travel.local-explorer': defineSkill({
    skillId: 'travel.local-explorer',
    name: 'Local Explorer',
    workspace: 'travel',
    intentMatchers: ['local_explore', 'nearby'],
    instructions: 'Find contextual local options and organize them into a practical plan.',
    allowedTools: ['travel.search', 'web.search'],
    workflowStages: ['search', 'compare', 'organize'],
    completionContract: ['recommended places match the request', 'location-sensitive claims are current enough for the decision'],
    verifiers: ['location', 'freshness'],
    progressVocabulary: ['Finding places', 'Comparing options', 'Organizing the day'],
  }),

  'finance.decision-analyst': defineSkill({
    skillId: 'finance.decision-analyst',
    name: 'Decision Analyst',
    workspace: 'finance',
    intentMatchers: ['compare', 'decision'],
    instructions: 'Compare alternatives with explicit assumptions, trade-offs, uncertainty, and deterministic calculations where possible.',
    allowedTools: ['finance.calculate', 'finance.market-data'],
    workflowStages: ['frame', 'calculate', 'compare', 'explain'],
    completionContract: ['assumptions are explicit', 'calculations are reproducible', 'uncertainty is not hidden'],
    verifiers: ['calculation', 'market-data-provenance'],
    progressVocabulary: ['Framing decision', 'Calculating', 'Comparing scenarios'],
  }),

  'finance.scenario-planner': defineSkill({
    skillId: 'finance.scenario-planner',
    name: 'Scenario Planner',
    workspace: 'finance',
    intentMatchers: ['scenario', 'what_if'],
    instructions: 'Model bounded what-if scenarios without converting assumptions into facts.',
    allowedTools: ['finance.calculate', 'finance.market-data'],
    workflowStages: ['assumptions', 'model', 'compare', 'stress'],
    completionContract: ['scenario inputs are visible', 'results change deterministically with assumptions'],
    verifiers: ['calculation'],
    progressVocabulary: ['Setting assumptions', 'Running scenarios', 'Comparing outcomes'],
  }),

  'research.evidence-analyst': defineSkill({
    skillId: 'research.evidence-analyst',
    name: 'Evidence Analyst',
    workspace: 'research',
    intentMatchers: ['research', 'evidence_synthesis'],
    instructions: 'Produce source-backed synthesis with attributable claims, freshness checks, and explicit uncertainty.',
    allowedTools: ['web.search', 'web.fetch', 'project.search'],
    workflowStages: ['search', 'read', 'synthesize', 'verify'],
    completionContract: ['material claims are attributable', 'freshness matches the question', 'contradictions are surfaced'],
    verifiers: ['citation', 'freshness', 'contradiction'],
    progressVocabulary: ['Searching sources', 'Reading evidence', 'Checking claims', 'Synthesis ready'],
  }),

  'research.deep-research-planner': defineSkill({
    skillId: 'research.deep-research-planner',
    name: 'Deep Research Planner',
    workspace: 'research',
    intentMatchers: ['deep_research'],
    instructions: 'Decompose a larger investigation, track unresolved questions, and maintain provenance across research steps.',
    allowedTools: ['web.search', 'web.fetch', 'project.search'],
    workflowStages: ['decompose', 'search', 'synthesize', 'gap_check', 'verify'],
    completionContract: ['research questions are covered or explicitly unresolved', 'material claims remain attributable'],
    verifiers: ['citation', 'coverage', 'freshness'],
    progressVocabulary: ['Breaking down question', 'Researching', 'Checking gaps', 'Verifying synthesis'],
  }),
});

const FAILURE_CUE = /\b(?:bug|broken|crash|error|fail(?:ed|ing|ure)?|fix|repair|regression|doesn['’]?t work|not work(?:ing)?)\b/i;

export function getPlatformSkill(skillId) {
  return PLATFORM_SKILLS[String(skillId || '').trim()] || null;
}

export function routePlatformSkill({ workspace = '', intentKind = '', message = '' } = {}) {
  const lane = String(workspace || '').trim().toLowerCase();
  const intent = String(intentKind || '').trim().toLowerCase();
  const text = String(message || '');

  if (lane === 'coding') {
    if (intent === 'refine_desk' && FAILURE_CUE.test(text)) return getPlatformSkill('coding.debugger-recovery-engineer');
    if (['app_build', 'shop_build', 'shop_catalog_slice', 'shop_oversize', 'refine_desk'].includes(intent)) {
      return getPlatformSkill('coding.senior-web-product-engineer');
    }
    if (['code_review', 'pr_review'].includes(intent)) return getPlatformSkill('coding.code-reviewer');
    return null;
  }

  const candidates = Object.values(PLATFORM_SKILLS).filter((entry) => entry.workspace === lane);
  return candidates.find((entry) => entry.intentMatchers.includes(intent)) || null;
}

export function platformSkillAssignment(input = {}) {
  const skill = routePlatformSkill(input);
  if (!skill) return null;
  return Object.freeze({
    skillId: skill.skillId,
    version: skill.version,
    name: skill.name,
    workspace: skill.workspace,
    routeReason: `${skill.workspace}:${String(input.intentKind || '').trim().toLowerCase() || 'unspecified'}`,
    completionAuthority: skill.completionAuthority,
    verificationAuthority: skill.verificationAuthority,
    completionContract: [...skill.completionContract],
    progressVocabulary: [...skill.progressVocabulary],
    requiredPermissions: [...skill.requiredPermissions],
    deliveryPolicy: { ...skill.deliveryPolicy },
  });
}
